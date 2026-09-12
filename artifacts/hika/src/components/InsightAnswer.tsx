import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Section = {
  type?: string;
  title?: string;
  content?: string;
  language?: string | null;
};

type Props = {
  answer: string;
  sections?: Section[];
  className?: string;
  compact?: boolean;
};

export default function InsightAnswer({ answer, sections, className, compact = false }: Props) {
  if (!answer?.trim()) return null;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "prose prose-invert max-w-none transition-all",
          "prose-p:leading-relaxed prose-pre:my-2 prose-pre:bg-black/50 prose-pre:border prose-pre:border-border",
          "prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline",
          "prose-code:text-emerald-300 prose-code:bg-emerald-950/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md",
          "prose-headings:font-semibold prose-headings:text-foreground",
          "prose-ul:list-disc prose-ol:list-decimal prose-li:my-0.5",
          compact ? "text-xs prose-p:my-1 prose-headings:my-2" : "text-sm prose-p:my-2 prose-headings:my-3",
          className
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
      </div>

      {sections && sections.length > 0 && (
        <div className="space-y-2">
          {sections.map((section, index) => {
            const content = section.content?.trim();
            if (!content) return null;

            const isCode = ["code", "sql", "pyspark", "scala", "python", "azure"].includes((section.type || "").toLowerCase());

            return (
              <div key={`${section.title || "section"}-${index}`} className="rounded-lg border border-border/60 bg-black/20 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/10 border-b border-border/50">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {section.title || "Detail"}
                  </span>
                  {isCode && <span className="text-[9px] text-emerald-300">code</span>}
                </div>
                <div className={isCode ? "p-3 bg-black/35" : "p-3"}>
                  {isCode ? (
                    <pre className="text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap font-mono m-0">
                      {content}
                    </pre>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap m-0">{content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
