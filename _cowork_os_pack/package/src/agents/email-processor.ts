import { ocrImage } from "./ravan-vision-lab";
import { saveOcrDocument } from "../memory/memory-insert";

export async function processEmail(email: {
  id: string;
  subject: string;
  body: string;
  attachments: { id: string; path: string; mime: string }[];
}) {
  for (const att of email.attachments || []) {
    const isImage =
      (att.mime || "").startsWith("image/") ||
      /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(att.path || "");
    const isPdf = (att.mime || "") === "application/pdf" || (att.path || "").endsWith(".pdf");
    if (!isImage && !isPdf) continue;
    try {
      const text = await ocrImage(att.path);
      await saveOcrDocument(text, "email_attachment", att.id);
    } catch {
      // best-effort
    }
  }
}
