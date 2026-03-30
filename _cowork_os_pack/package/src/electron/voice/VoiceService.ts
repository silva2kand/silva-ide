/**
 * Voice Service - Text-to-Speech and Speech-to-Text
 *
 * Provides voice interaction capabilities using ElevenLabs for TTS
 * and OpenAI Whisper for STT.
 *
 * NOTE: This service runs in the Electron main process.
 * Audio playback must be handled by the renderer process.
 */

import { EventEmitter } from "events";
import { spawn } from "child_process";
import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  VoiceSettings,
  VoiceState,
  ElevenLabsVoice,
  DEFAULT_VOICE_SETTINGS,
} from "../../shared/types";

// ElevenLabs API configuration
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const OPENAI_API_BASE = "https://api.openai.com/v1";

// Default ElevenLabs voice (Rachel - conversational)
const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export interface VoiceServiceOptions {
  settings?: Partial<VoiceSettings>;
  onStateChange?: (state: VoiceState) => void;
}

export class VoiceService extends EventEmitter {
  private settings: VoiceSettings;
  private state: VoiceState;

  constructor(options: VoiceServiceOptions = {}) {
    super();
    this.settings = { ...DEFAULT_VOICE_SETTINGS, ...options.settings };
    this.state = {
      isActive: false,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      audioLevel: 0,
    };

    if (options.onStateChange) {
      this.on("stateChange", options.onStateChange);
    }
  }

  /**
   * Initialize the voice service
   */
  async initialize(): Promise<void> {
    console.log("[VoiceService] Initializing...");
    this.updateState({ isActive: this.settings.enabled });
    console.log("[VoiceService] Initialized with settings:", {
      enabled: this.settings.enabled,
      ttsProvider: this.settings.ttsProvider,
      sttProvider: this.settings.sttProvider,
    });
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.updateState({ isActive: this.settings.enabled });
    this.emit("settingsChange", this.settings);
  }

  /**
   * Get current settings
   */
  getSettings(): VoiceSettings {
    return { ...this.settings };
  }

  /**
   * Get current state
   */
  getState(): VoiceState {
    return { ...this.state };
  }

  /**
   * Check if speech-to-text transcription is available
   * Returns true if an STT provider with valid API keys is configured
   */
  isTranscriptionAvailable(): boolean {
    const { sttProvider, openaiApiKey, azureApiKey, azureEndpoint } = this.settings;

    switch (sttProvider) {
      case "openai":
        return !!openaiApiKey;
      case "azure":
        return !!(azureApiKey && azureEndpoint);
      case "elevenlabs":
        // ElevenLabs uses OpenAI or Azure for STT
        return !!openaiApiKey || !!(azureApiKey && azureEndpoint);
      case "local":
        return !!this.resolveLocalCommand(this.settings.localSttCommand, "whisper").command;
      default:
        return false;
    }
  }

  /**
   * Text-to-Speech: Convert text to audio data
   * Returns audio data as Buffer for the renderer to play
   */
  async speak(text: string): Promise<Buffer | null> {
    if (!this.settings.enabled) {
      console.log("[VoiceService] Voice mode disabled, skipping TTS");
      return null;
    }

    if (!text || text.trim().length === 0) {
      return null;
    }

    console.log(
      "[VoiceService] Generating TTS:",
      text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    );

    try {
      // Clear any previous error
      this.updateState({ isSpeaking: true, isProcessing: true, error: undefined });
      this.emit("speakingStart", text);

      let audioBuffer: ArrayBuffer;

      switch (this.settings.ttsProvider) {
        case "elevenlabs":
          audioBuffer = await this.elevenLabsTTS(text);
          break;
        case "openai":
          audioBuffer = await this.openaiTTS(text);
          break;
        case "azure":
          audioBuffer = await this.azureTTS(text);
          break;
        case "local":
          audioBuffer = await this.localPiperTTS(text);
          break;
        default:
          throw new Error(`Unknown TTS provider: ${this.settings.ttsProvider}`);
      }

      this.updateState({ isProcessing: false });

      // Return audio data as Buffer for renderer to play
      return Buffer.from(audioBuffer);
    } catch (error) {
      console.error("[VoiceService] TTS error:", error);
      this.updateState({ error: (error as Error).message, isSpeaking: false, isProcessing: false });
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Mark speaking as finished (called by renderer after audio playback)
   */
  finishSpeaking(): void {
    this.updateState({ isSpeaking: false });
    this.emit("speakingEnd");
  }

  /**
   * Stop current speech
   */
  stopSpeaking(): void {
    this.updateState({ isSpeaking: false });
    this.emit("speakingEnd");
  }

  /**
   * Speech-to-Text: Transcribe audio to text
   * Accepts audio data as Buffer from the renderer
   * @param audioData - Audio data as Buffer
   * @param options - Optional settings
   * @param options.force - If true, bypass the enabled check (useful for channel audio messages)
   */
  async transcribe(audioData: Buffer, options?: { force?: boolean }): Promise<string> {
    if (!this.settings.enabled && !options?.force) {
      throw new Error("Voice mode is disabled");
    }

    console.log("[VoiceService] Transcribing audio...");
    // Clear any previous error
    this.updateState({ isProcessing: true, error: undefined });

    try {
      let transcript: string;

      switch (this.settings.sttProvider) {
        case "openai":
          transcript = await this.openaiSTT(audioData);
          break;
        case "azure":
          transcript = await this.azureSTT(audioData);
          break;
        case "local":
          transcript = await this.localWhisperSTT(audioData);
          break;
        case "elevenlabs":
          // ElevenLabs doesn't have an STT API - redirect to OpenAI if key available
          if (this.settings.openaiApiKey) {
            transcript = await this.openaiSTT(audioData);
          } else if (this.settings.azureEndpoint && this.settings.azureApiKey) {
            transcript = await this.azureSTT(audioData);
          } else {
            throw new Error(
              "ElevenLabs does not provide speech-to-text. Please use OpenAI Whisper, Azure, or configure an API key.",
            );
          }
          break;
        default:
          throw new Error(`Unknown STT provider: ${this.settings.sttProvider}`);
      }

      this.emit("transcript", transcript);
      return transcript;
    } catch (error) {
      console.error("[VoiceService] STT error:", error);
      this.updateState({ error: (error as Error).message });
      this.emit("error", error);
      throw error;
    } finally {
      this.updateState({ isProcessing: false });
    }
  }

  /**
   * Get available ElevenLabs voices
   */
  async getElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    const apiKey = this.settings.elevenLabsApiKey;
    if (!apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch voices: ${error}`);
    }

    const data = (await response.json()) as { voices?: ElevenLabsVoice[] };
    return data.voices || [];
  }

  /**
   * Test ElevenLabs connection
   */
  async testElevenLabsConnection(): Promise<{
    success: boolean;
    voiceCount?: number;
    error?: string;
  }> {
    try {
      const voices = await this.getElevenLabsVoices();
      return { success: true, voiceCount: voices.length };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Test OpenAI voice connection
   */
  async testOpenAIConnection(): Promise<{ success: boolean; error?: string }> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) {
      return { success: false, error: "OpenAI API key not configured" };
    }

    try {
      // Test with a minimal TTS request
      const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: "Test",
          voice: "alloy",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Test Azure OpenAI voice connection
   */
  async testAzureConnection(): Promise<{ success: boolean; error?: string }> {
    const endpoint = this.settings.azureEndpoint;
    const apiKey = this.settings.azureApiKey;
    const deploymentName = this.settings.azureTtsDeploymentName;

    if (!endpoint) {
      return { success: false, error: "Azure OpenAI endpoint not configured" };
    }
    if (!apiKey) {
      return { success: false, error: "Azure OpenAI API key not configured" };
    }
    if (!deploymentName) {
      return { success: false, error: "Azure OpenAI TTS deployment name not configured" };
    }

    try {
      const apiVersion = this.settings.azureApiVersion || "2024-02-15-preview";
      const url = `${endpoint}/openai/deployments/${deploymentName}/audio/speech?api-version=${apiVersion}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: deploymentName,
          input: "Test",
          voice: "alloy",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async testLocalTtsConnection(): Promise<{ success: boolean; error?: string; details?: string }> {
    try {
      const { command } = this.resolveLocalCommand(this.settings.localTtsCommand, "piper");
      if (!command) {
        return {
          success: false,
          error: "Local Piper command is not configured",
          details: "Set Piper Command/Shortcut in Voice Settings > Local Voice Runtime.",
        };
      }

      const resolved = await this.resolveWindowsShortcutIfNeeded(command);
      const args = [...resolved.argsPrefix, ...this.parseArgsString(this.settings.localTtsArgs)];
      const hasModelArg = this.hasPiperModelArg(args);
      if (!hasModelArg) {
        const detectedModel = await this.detectPiperModelPath(resolved.command);
        if (detectedModel) {
          return {
            success: true,
            details: `Piper command OK: ${resolved.command} (auto-detected model: ${detectedModel})`,
          };
        }
        return {
          success: false,
          error: "Piper model is missing",
          details: 'Add a model argument in Piper Extra Args, for example: -m "C:\\path\\to\\voice.onnx"',
        };
      }

      await this.runCommand(resolved.command, [...args, "--help"]);
      return { success: true, details: `Piper command OK: ${resolved.command}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async testLocalSttConnection(): Promise<{ success: boolean; error?: string; details?: string }> {
    try {
      const { command } = this.resolveLocalCommand(this.settings.localSttCommand, "whisper");
      if (!command) {
        return {
          success: false,
          error: "Local Whisper command is not configured",
          details: "Set Whisper Command/Shortcut in Voice Settings > Local Voice Runtime.",
        };
      }

      const resolved = await this.resolveWindowsShortcutIfNeeded(command);
      if (!fsSync.existsSync(resolved.command)) {
        return {
          success: false,
          error: `Whisper target does not exist: ${resolved.command}`,
        };
      }
      return { success: true, details: `Whisper command OK: ${resolved.command}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopSpeaking();
    this.removeAllListeners();
  }

  // ============ Private Methods ============

  private updateState(partial: Partial<VoiceState>): void {
    this.state = { ...this.state, ...partial };
    this.emit("stateChange", this.state);
  }

  /**
   * ElevenLabs Text-to-Speech
   */
  private async elevenLabsTTS(text: string): Promise<ArrayBuffer> {
    const apiKey = this.settings.elevenLabsApiKey;
    if (!apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const voiceId = this.settings.elevenLabsVoiceId || DEFAULT_ELEVENLABS_VOICE_ID;

    const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * OpenAI Text-to-Speech
   */
  private async openaiTTS(text: string): Promise<ArrayBuffer> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const voice = this.settings.openaiVoice || "nova";

    const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        speed: this.settings.speechRate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS failed: ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * OpenAI Whisper Speech-to-Text
   */
  private async openaiSTT(audioData: Buffer): Promise<string> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Create a Blob-like object for Node.js fetch
    // Convert Buffer to Uint8Array for BlobPart compatibility
    const uint8Array = new Uint8Array(
      audioData.buffer as ArrayBuffer,
      audioData.byteOffset,
      audioData.byteLength,
    );
    const blob = new Blob([uint8Array], { type: "audio/webm" });

    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    formData.append("model", "whisper-1");
    formData.append("language", this.settings.language.split("-")[0]); // e.g., 'en' from 'en-US'

    const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI STT failed: ${errorText}`);
    }

    const data = (await response.json()) as { text: string };
    return data.text;
  }

  /**
   * Azure OpenAI Text-to-Speech
   */
  private async azureTTS(text: string): Promise<ArrayBuffer> {
    const endpoint = this.settings.azureEndpoint;
    const apiKey = this.settings.azureApiKey;
    const deploymentName = this.settings.azureTtsDeploymentName;

    if (!endpoint) {
      throw new Error("Azure OpenAI endpoint not configured");
    }
    if (!apiKey) {
      throw new Error("Azure OpenAI API key not configured");
    }
    if (!deploymentName) {
      throw new Error("Azure OpenAI TTS deployment name not configured");
    }

    const voice = this.settings.azureVoice || "nova";
    const apiVersion = this.settings.azureApiVersion || "2024-02-15-preview";
    const url = `${endpoint}/openai/deployments/${deploymentName}/audio/speech?api-version=${apiVersion}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deploymentName,
        input: text,
        voice,
        speed: this.settings.speechRate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI TTS failed: ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Azure OpenAI Whisper Speech-to-Text
   */
  private async azureSTT(audioData: Buffer): Promise<string> {
    const endpoint = this.settings.azureEndpoint;
    const apiKey = this.settings.azureApiKey;
    const deploymentName = this.settings.azureSttDeploymentName;

    if (!endpoint) {
      throw new Error("Azure OpenAI endpoint not configured");
    }
    if (!apiKey) {
      throw new Error("Azure OpenAI API key not configured");
    }
    if (!deploymentName) {
      throw new Error("Azure OpenAI STT deployment name not configured");
    }

    const apiVersion = this.settings.azureApiVersion || "2024-02-15-preview";
    const url = `${endpoint}/openai/deployments/${deploymentName}/audio/transcriptions?api-version=${apiVersion}`;

    // Create a Blob-like object for Node.js fetch
    const uint8Array = new Uint8Array(
      audioData.buffer as ArrayBuffer,
      audioData.byteOffset,
      audioData.byteLength,
    );
    const blob = new Blob([uint8Array], { type: "audio/webm" });

    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    formData.append("language", this.settings.language.split("-")[0]);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI STT failed: ${errorText}`);
    }

    const data = (await response.json()) as { text: string };
    return data.text;
  }

  private parseArgsString(raw: string | undefined): string[] {
    const text = String(raw || "").trim();
    if (!text) return [];

    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && /\s/.test(ch)) {
        if (current) {
          result.push(current);
          current = "";
        }
        continue;
      }
      current += ch;
    }

    if (current) result.push(current);
    return result;
  }

  private hasPiperModelArg(args: string[]): boolean {
    for (let i = 0; i < args.length; i += 1) {
      const arg = String(args[i] || "").trim();
      if (arg === "-m" || arg === "--model") {
        const value = String(args[i + 1] || "").trim();
        if (value) return true;
      }
      if (arg.startsWith("--model=")) {
        const value = arg.slice("--model=".length).trim();
        if (value) return true;
      }
    }
    return false;
  }

  private async findFirstOnnxFile(directory: string, depth = 0): Promise<string | undefined> {
    if (depth > 4) return undefined;
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".onnx")) {
          return path.join(directory, entry.name);
        }
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const nested = await this.findFirstOnnxFile(path.join(directory, entry.name), depth + 1);
        if (nested) return nested;
      }
    } catch {
      // Ignore inaccessible folders.
    }
    return undefined;
  }

  private async detectPiperModelPath(resolvedCommand: string): Promise<string | undefined> {
    const commandDir = path.dirname(resolvedCommand);
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const roamingAppData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const candidates = [
      commandDir,
      path.join(commandDir, "models"),
      path.join(os.homedir(), "OneDrive", "Desktop"),
      path.join(os.homedir(), "Desktop"),
      path.join(os.homedir(), "Documents"),
      path.join(os.homedir(), "Downloads"),
      path.join(localAppData, "piper"),
      path.join(localAppData, "piper-voices"),
      path.join(roamingAppData, "piper"),
      path.join(roamingAppData, "Python", "Python312", "site-packages"),
    ];

    for (const candidate of candidates) {
      const model = await this.findFirstOnnxFile(candidate, 0);
      if (model) return model;
    }
    return undefined;
  }

  private resolveLocalCommand(
    configuredPath: string | undefined,
    _defaultLinkName: "piper" | "whisper",
  ): { command: string; args: string[] } {
    const configured = String(configuredPath || "").trim();
    const command = configured;
    return { command, args: [] };
  }

  private async resolveWindowsShortcutIfNeeded(
    command: string,
  ): Promise<{ command: string; argsPrefix: string[] }> {
    if (process.platform !== "win32" || !command.toLowerCase().endsWith(".lnk")) {
      return { command, argsPrefix: [] };
    }

    if (!fsSync.existsSync(command)) {
      return { command, argsPrefix: [] };
    }

    const safePath = command.replace(/'/g, "''");
    const psScript =
      `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${safePath}');` +
      "Write-Output $s.TargetPath;Write-Output $s.Arguments;";
    const { stdout } = await this.runCommand("powershell", ["-NoProfile", "-Command", psScript]);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const targetPath = lines[0] || "";
    const shortcutArgs = this.parseArgsString(lines[1] || "");
    if (!targetPath) {
      return { command, argsPrefix: [] };
    }
    return { command: targetPath, argsPrefix: shortcutArgs };
  }

  private runCommand(
    command: string,
    args: string[],
    options?: { stdinText?: string; cwd?: string },
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const childEnv = {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      };
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: childEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
        }
      });

      if (options?.stdinText && child.stdin?.writable) {
        child.stdin.write(options.stdinText);
      }
      child.stdin?.end();
    });
  }

  private async localPiperTTS(text: string): Promise<ArrayBuffer> {
    const { command } = this.resolveLocalCommand(this.settings.localTtsCommand, "piper");
    if (!command) {
      throw new Error(
        "Local Piper command is not configured. Set it in Voice Settings > Text-to-Speech Provider > System.",
      );
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cowork-piper-"));
    const outPath = path.join(tempDir, "speech.wav");
    const resolved = await this.resolveWindowsShortcutIfNeeded(command);
    const localArgs = this.parseArgsString(this.settings.localTtsArgs);
    const speed = this.settings.speechRate > 0 ? this.settings.speechRate : 1;
    const lengthScale = Math.max(0.5, Math.min(2.0, 1 / speed));
    const args = [
      ...resolved.argsPrefix,
      ...localArgs,
      "-f",
      outPath,
      "--length_scale",
      String(lengthScale),
    ];

    if (!this.hasPiperModelArg(args)) {
      const detectedModel = await this.detectPiperModelPath(resolved.command);
      if (detectedModel) {
        args.unshift(detectedModel);
        args.unshift("-m");
      } else {
        throw new Error(
          "Piper requires a voice model. Set Piper Extra Args with -m \"C:\\path\\to\\voice.onnx\".",
        );
      }
    }

    try {
      await this.runCommand(resolved.command, args, { stdinText: text });
      const audio = await fs.readFile(outPath);
      return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
    } catch (error) {
      throw new Error(`Local Piper TTS failed: ${(error as Error).message}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async localWhisperSTT(audioData: Buffer): Promise<string> {
    const { command } = this.resolveLocalCommand(this.settings.localSttCommand, "whisper");
    if (!command) {
      throw new Error(
        "Local Whisper command is not configured. Set it in Voice Settings > Speech-to-Text Provider > System.",
      );
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cowork-whisper-"));
    const inputPath = path.join(tempDir, "audio.webm");
    const resolved = await this.resolveWindowsShortcutIfNeeded(command);
    await fs.writeFile(inputPath, audioData);

    try {
      const localArgs = this.parseArgsString(this.settings.localSttArgs);
      const { stdout } = await this.runCommand(
        resolved.command,
        [...resolved.argsPrefix, ...localArgs, inputPath],
        { cwd: tempDir },
      );
      const inline = stdout.trim();
      if (inline) return inline;

      const transcriptCandidates = [
        `${inputPath}.txt`,
        path.join(tempDir, "audio.txt"),
      ];
      for (const candidate of transcriptCandidates) {
        try {
          const text = (await fs.readFile(candidate, "utf8")).trim();
          if (text) return text;
        } catch {
          // Continue searching for transcript output.
        }
      }

      throw new Error("Whisper completed but no transcript text was produced");
    } catch (error) {
      throw new Error(`Local Whisper STT failed: ${(error as Error).message}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// Singleton instance
let voiceServiceInstance: VoiceService | null = null;

/**
 * Get or create the VoiceService singleton
 */
export function getVoiceService(options?: VoiceServiceOptions): VoiceService {
  if (!voiceServiceInstance) {
    voiceServiceInstance = new VoiceService(options);
  }
  return voiceServiceInstance;
}

/**
 * Reset the VoiceService singleton (for testing)
 */
export function resetVoiceService(): void {
  if (voiceServiceInstance) {
    voiceServiceInstance.dispose();
    voiceServiceInstance = null;
  }
}
