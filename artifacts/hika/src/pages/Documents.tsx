import { motion } from "framer-motion";
import { ChangeEvent, useRef, useState } from "react";
import { FileText, Plus, Upload, ExternalLink, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { prepareInterviewPersona } from "@/lib/prepare-persona";

type Source = {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  comingSoon?: boolean;
};

const sources: Source[] = [
  { id: "local", name: "Local documents", icon: "📄", description: "Upload PDF, DOCX, TXT, Markdown, JSON, or CSV files", connected: false },
  { id: "gdrive", name: "Google Drive", icon: "🟢", description: "Connect your Drive folders", connected: false, comingSoon: true },
  { id: "notion", name: "Notion", icon: "⬛", description: "Sync pages and databases", connected: false, comingSoon: true },
  { id: "confluence", name: "Confluence", icon: "🔵", description: "Index your team's knowledge base", connected: false, comingSoon: true },
  { id: "github", name: "GitHub", icon: "⚫", description: "Connect repos for code context", connected: false, comingSoon: true },
  { id: "jira", name: "Jira", icon: "🔷", description: "Pull in tickets and sprint context", connected: false, comingSoon: true },
  { id: "sharepoint", name: "SharePoint / OneDrive", icon: "🟦", description: "Connect Microsoft files", connected: false, comingSoon: true },
  { id: "devops", name: "Azure DevOps", icon: "🔶", description: "Pipeline and work item context", connected: false, comingSoon: true },
];

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }

  return btoa(chunks.join(""));
}

export default function Documents() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocs, setUploadedDocs] = useState<{ id: string; name: string }[]>(() => {
    try {
      const stored = window.localStorage.getItem("hika-uploaded-documents");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const removeDocument = async (document: { id: string; name: string }) => {
    setUploadError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api/documents/${encodeURIComponent(document.id)}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok && response.status !== 404) throw new Error("Delete failed");
      setUploadedDocs((current) => {
        const next = current.filter((item) => item.id !== document.id);
        window.localStorage.setItem("hika-uploaded-documents", JSON.stringify(next));
        if (next.length) void prepareInterviewPersona(next);
        return next;
      });
    } catch {
      setUploadError(`${document.name} could not be removed. Please try again.`);
    }
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    setUploadError(null);
    if (files.length > 3) {
      setUploadError("Choose up to 3 files at a time.");
      event.target.value = "";
      return;
    }
    const oversized = Array.from(files).find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setUploadError(`${oversized.name} is larger than 10 MB.`);
      event.target.value = "";
      return;
    }
    if (Array.from(files).reduce((total, file) => total + file.size, 0) > 15 * 1024 * 1024) {
      setUploadError("Combined file size must be under 15 MB.");
      event.target.value = "";
      return;
    }
    setIsUploading(true);
    try {
      const token = await getAccessToken();
      const toUpload = await Promise.all(Array.from(files).map(async (file) => ({
        name: file.name,
        contentBase64: arrayBufferToBase64(await file.arrayBuffer()),
      })));
      const response = await fetch(`${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ files: toUpload }),
      });
      if (!response.ok) throw new Error("Upload failed");

      const body = await response.json() as { files?: { id: string; name: string }[] };
      const added = body.files ?? [];
      const nextDocs = [...uploadedDocs, ...added];
      setUploadedDocs(nextDocs);
      window.localStorage.setItem("hika-uploaded-documents", JSON.stringify(nextDocs));
      void prepareInterviewPersona(nextDocs);
    } catch {
      setUploadError("The files could not be uploaded. Please try again.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect a resume (and optional JD) so Hikanest can answer as you
          </p>
        </div>

        {/* Upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-card-border rounded-xl p-10 text-center hover:border-primary/30 transition-colors cursor-pointer group"
        >
          <Upload size={24} className="mx-auto mb-3 text-muted-foreground/40 group-hover:text-primary/50 transition-colors" />
          <p className="text-sm font-medium mb-1">Upload resume and optional JD</p>
          <p className="text-xs text-muted-foreground">Hika reads them once, learns your skills, then answers as you. PDF, DOCX, TXT, MD — 3 files, 10 MB each</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.json,.csv"
            multiple
            className="hidden"
            onChange={uploadFiles}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click(); }}
            className="mt-4 inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:cursor-wait disabled:opacity-50"
          >
            <Plus size={13} /> {isUploading ? "Uploading..." : "Choose Files"}
          </button>
          {uploadError && <p className="mt-3 text-xs text-destructive">{uploadError}</p>}
        </motion.div>

        {uploadedDocs.length > 0 && (
          <div className="border border-card-border rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Available Context</h2>
            <div className="space-y-2">
              {uploadedDocs.map((document) => (
                <div key={document.id} className="flex items-center gap-2 text-sm">
                  <FileText size={15} className="text-primary" />
                  <span className="truncate flex-1">{document.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${document.name}`}
                    onClick={() => void removeDocument(document)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Integrations */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Integrations
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {sources.map((src, i) => (
              <motion.div
                key={src.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className="bg-card border border-card-border rounded-xl p-4 flex items-start gap-3"
              >
                <div className="text-2xl flex-shrink-0 select-none">{src.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{src.name}</p>
                    {src.comingSoon && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                        soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{src.description}</p>
                </div>
                <div className="flex-shrink-0">
                  {src.connected ? (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                      <CheckCircle2 size={10} /> Connected
                    </div>
                  ) : src.comingSoon ? (
                    <button disabled className="text-[10px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground cursor-not-allowed opacity-50">
                      Coming soon
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> Add files
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Empty state hint */}
        <div className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-xl p-4">
          <AlertCircle size={15} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium mb-0.5">
              {uploadedDocs.length ? `${uploadedDocs.length} document${uploadedDocs.length === 1 ? "" : "s"} ready` : "No sources connected yet"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Once connected, Hikanest will automatically pull relevant context from your documents when answering questions during meetings. This dramatically improves answer accuracy for your team's specific systems and workflows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
