import { ocrImage } from "./ravan-vision-lab";
import { saveOcrDocument } from "../memory/memory-insert";

export async function ingestDocument(file: { id: string; path: string; mime?: string }) {
  const mime = file.mime || "";
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.path || "");
  const isPdf = mime === "application/pdf" || (file.path || "").endsWith(".pdf");
  if (!isImage && !isPdf) return;
  try {
    const text = await ocrImage(file.path);
    await saveOcrDocument(text, "document", file.id);
  } catch {
    // best-effort
  }
}
