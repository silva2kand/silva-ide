import { describe, expect, it, vi } from "vitest";

const mockReadFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockLoadSettings = vi.fn();
vi.mock("../electron/agent/llm/provider-factory", () => ({
  LLMProviderFactory: {
    loadSettings: () => mockLoadSettings(),
  },
}));

const mockCreateCompletion = vi.fn();
const mockOpenAIConstructor = vi.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: (...args: unknown[]) => mockCreateCompletion(...args),
    },
  },
}));
vi.mock("openai", () => ({
  default: (...args: unknown[]) => mockOpenAIConstructor(...args),
}));

import { ocrImage } from "./ravan-vision-lab";

describe("ocrImage", () => {
  it("returns extracted text when OpenAI call succeeds", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-image-bytes"));
    mockLoadSettings.mockReturnValue({ openai: { apiKey: "test-key", model: "gpt-4o-mini" } });
    mockCreateCompletion.mockResolvedValue({
      choices: [{ message: { content: "Hello OCR" } }],
    });

    const result = await ocrImage("invoice.png");

    expect(result).toBe("Hello OCR");
    expect(mockOpenAIConstructor).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    const payload = mockCreateCompletion.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.model).toBe("gpt-4o-mini");
    const url = (payload.messages as unknown[] | undefined)?.[0] &&
      ((payload.messages as unknown[])[0] as Record<string, unknown>)?.content &&
      (
        ((payload.messages as unknown[])[0] as Record<string, unknown>).content as unknown[]
      )?.[1] &&
      (
        (
          ((payload.messages as unknown[])[0] as Record<string, unknown>)
            .content as unknown[]
        )[1] as Record<string, unknown>
      )?.image_url &&
      (
        (
          ((payload.messages as unknown[])[0] as Record<string, unknown>)
            .content as unknown[]
        )[1] as Record<string, unknown>
      ).image_url as Record<string, unknown> &&
      (
        (
          (
            ((payload.messages as unknown[])[0] as Record<string, unknown>)
              .content as unknown[]
          )[1] as Record<string, unknown>
        ).image_url as Record<string, unknown>
      ).url as string;
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("returns empty string when api key is missing", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-image-bytes"));
    mockLoadSettings.mockReturnValue({ openai: { apiKey: "" } });

    const result = await ocrImage("invoice.png");

    expect(result).toBe("");
    expect(mockCreateCompletion).toHaveBeenCalledTimes(0);
  });
});
