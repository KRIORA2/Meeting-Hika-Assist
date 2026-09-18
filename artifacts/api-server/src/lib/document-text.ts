import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractDocumentTextFromBuffer(fileName: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".txt" || ext === ".md" || ext === ".json" || ext === ".csv") {
    return buffer.toString("utf8");
  }

  if (ext === ".pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (ext === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }

  return "";
}
