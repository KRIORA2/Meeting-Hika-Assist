import { cn } from "@/lib/utils";

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

  const codeSections = (sections ?? []).filter((section) => {
    const type = (section.type || "").toLowerCase();
    const language = (section.language || "").toLowerCase();
    const content = section.content?.trim();
    if (!content) return false;
    return ["code", "sql", "pyspark", "scala", "python", "bash", "hcl", "json"].includes(type)
      || ["sql", "python", "scala", "bash", "hcl", "json"].includes(language);
  });

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "max-w-none whitespace-pre-line text-[15px] leading-relaxed text-slate-100",
          compact ? "text-sm leading-relaxed" : "text-[15px] leading-[1.58]",
          className
        )}
      >
        {answer.trim()}
      </div>

      {codeSections.length > 0 && (
        <div className="space-y-2">
          {codeSections.map((section, index) => {
            const content = section.content?.trim();
            if (!content) return null;
            return (
              <pre
                key={`${section.title || "code"}-${index}`}
                className="text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap font-mono m-0 rounded-lg border border-border/60 bg-black/35 p-3"
              >
                {content}
              </pre>
            );
          })}
        </div>
      )}
    </div>
  );
}
