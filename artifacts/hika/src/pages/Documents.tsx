import { motion } from "framer-motion";
import { FileText, Plus, Upload, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";

type Source = {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  comingSoon?: boolean;
};

const sources: Source[] = [
  { id: "pdf", name: "PDF / Word / PPTX", icon: "📄", description: "Upload local documents as context", connected: false },
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

export default function Documents() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect documents and tools so Hika can answer with your context
          </p>
        </div>

        {/* Upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-dashed border-card-border rounded-xl p-10 text-center hover:border-primary/30 transition-colors cursor-pointer group"
        >
          <Upload size={24} className="mx-auto mb-3 text-muted-foreground/40 group-hover:text-primary/50 transition-colors" />
          <p className="text-sm font-medium mb-1">Drag & drop files here</p>
          <p className="text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX, TXT — up to 50 MB each</p>
          <button
            className="mt-4 inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus size={13} /> Choose Files
          </button>
        </motion.div>

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
                      Connect
                    </button>
                  ) : (
                    <button className="text-[10px] px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1">
                      <ExternalLink size={10} /> Connect
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
            <p className="text-sm font-medium mb-0.5">No sources connected yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Once connected, Hika will automatically pull relevant context from your documents when answering questions during meetings. This dramatically improves answer accuracy for your team's specific systems and workflows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
