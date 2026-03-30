import * as fs from "node:fs/promises";
import * as path from "node:path";
import OpenAI from "openai";
import mime from "mime-types";
import { LLMProviderFactory } from "../electron/agent/llm/provider-factory";

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath);
  const guessed = mime.lookup(ext) || "application/octet-stream";
  return typeof guessed === "string" ? guessed : "application/octet-stream";
}

export async function ocrImage(imagePath: string): Promise<string> {
  const absPath = path.resolve(imagePath);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absPath);
  } catch {
    return "";
  }

  const settings = LLMProviderFactory.loadSettings();
  const apiKey = settings.openai?.apiKey?.trim();
  if (!apiKey) {
    return "";
  }

  const model = settings.openai?.model?.trim() || "gpt-4o-mini";
  const mimeType = guessMimeType(absPath) || "image/png";
  const base64 = buffer.toString("base64");
  const url = `data:${mimeType};base64,${base64}`;

  const client = new OpenAI({ apiKey });
  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text from this image. Return only the text." },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
    });
    const text = response.choices?.[0]?.message?.content ?? "";
    return String(text || "").trim();
  } catch {
    return "";
  }
}
