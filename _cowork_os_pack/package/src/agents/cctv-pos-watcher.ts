import { ocrImage } from "./ravan-vision-lab";
import { saveOcrDocument } from "../memory/memory-insert";

export async function runCctvPosWatcher(
  frameProvider: () => Promise<{ id: string; path: string; type: "cctv" | "pos" }[]>,
) {
  const frames = await frameProvider();
  for (const frame of frames) {
    try {
      const text = await ocrImage(frame.path);
      await saveOcrDocument(text, frame.type, frame.id);
    } catch {
      // best-effort
    }
  }
}
