import { v4 as uuidv4 } from "uuid";
import { DatabaseManager } from "../electron/database/schema";

export async function saveOcrDocument(
  text: string,
  source: "email_attachment" | "document" | "cctv" | "pos",
  sourceId: string,
) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return;

  const id = `${source}_${Date.now()}_${uuidv4()}`;
  const createdAt = Date.now();

  const db = DatabaseManager.getInstance().getDatabase();
  const stmt = db.prepare(
    `INSERT INTO memory_documents (id, text, source, source_id, source_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  stmt.run(id, cleaned, source, sourceId, "ocr", createdAt);
}
