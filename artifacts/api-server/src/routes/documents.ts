import { Router } from "express";
import path from "path";
import { randomUUID } from "node:crypto";
import { deleteDocument, saveDocument } from "../lib/store";
import { forgetPersona, ingestDocument } from "../lib/persona";

const router = Router();
const MAX_FILES_PER_UPLOAD = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md", ".json", ".csv"]);

router.post("/documents", async (req, res) => {
  try {
    const body = req.body as { files?: Array<{ name?: string; contentBase64?: string }> };
    if (!body || !Array.isArray(body.files)) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    if (body.files.length < 1 || body.files.length > MAX_FILES_PER_UPLOAD) {
      res.status(400).json({ error: `Upload between 1 and ${MAX_FILES_PER_UPLOAD} files at a time` });
      return;
    }

    const validated: Array<{ name: string; buffer: Buffer }> = [];
    for (const file of body.files) {
      const name = typeof file.name === "string" ? file.name : "file";
      const content = typeof file.contentBase64 === "string" ? file.contentBase64 : "";
      if (!content) {
        res.status(400).json({ error: `${name} is empty` });
        return;
      }
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        const hint = ext === ".doc" ? " Save as .docx or PDF and try again." : "";
        res.status(415).json({ error: `Unsupported document type: ${ext || "unknown"}.${hint}` });
        return;
      }
      const buffer = Buffer.from(content, "base64");
      if (buffer.length < 1 || buffer.length > MAX_FILE_BYTES) {
        res.status(413).json({ error: `Each document must be smaller than ${MAX_FILE_BYTES / 1024 / 1024} MB` });
        return;
      }
      validated.push({ name, buffer });
    }

    if (validated.reduce((total, file) => total + file.buffer.length, 0) > MAX_TOTAL_BYTES) {
      res.status(413).json({ error: "Combined upload must be smaller than 15 MB" });
      return;
    }

    const saved = [];
    for (const file of validated) {
      const stored = await saveDocument(req.authUser!.id, randomUUID(), file.name, file.buffer);
      await ingestDocument(req.authUser!.id, stored.id, stored.name, file.buffer).catch(() => undefined);
      saved.push(stored);
    }
    res.json({ files: saved });
  } catch (err) {
    req.log.error({ err }, "Document upload failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

router.delete("/documents/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  try {
    const deleted = await deleteDocument(req.authUser!.id, id);
    if (!deleted) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    forgetPersona(req.authUser!.id);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Document deletion failed");
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
