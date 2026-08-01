import { Router } from "express";
import fs from "fs";
import path from "path";

// Lightweight id generator to avoid runtime dependency on 'nanoid' during build
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Accept JSON { files: [{ name, contentBase64 }] }
router.post("/documents", async (req, res) => {
  try {
    const body = req.body as any;
    if (!body || !Array.isArray(body.files)) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const saved: Array<{ id: string; name: string; path: string }> = [];
    for (const f of body.files) {
      const name = typeof f.name === "string" ? f.name : "file";
      const content = typeof f.contentBase64 === "string" ? f.contentBase64 : "";
      if (!content) continue;
      const id = generateId();
      const ext = path.extname(name) || "";
      const filename = `${id}${ext}`;
      const outPath = path.join(UPLOAD_DIR, filename);
      await fs.promises.writeFile(outPath, Buffer.from(content, "base64"));
      saved.push({ id, name, path: outPath });
    }

    res.json({ files: saved.map(s => ({ id: s.id, name: s.name })) });
  } catch (err: any) {
    console.error("documents upload error", err);
    res.status(500).json({ error: err?.message ?? "upload failed" });
  }
});

export default router;
