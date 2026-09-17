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
  keyPoints?: string[];
  className?: string;
  compact?: boolean;
};

function isPlaceholderDump(text: string) {
  return /DATABRICKS_INSTANCE|<your-|personal-access-token|preview\/scim/i.test(text);
}

function splitSpoken(spoken: string) {
  const text = spoken.trim();
  const match = text.match(/^(.+?[.!?])\s+([\s\S]+)$/);
  if (match && match[1].length >= 24 && match[1].length <= 240 && match[2].length > 28) {
    return { opener: match[1], rest: match[2] };
  }
  return { opener: text, rest: "" };
}

export default function InsightAnswer({ answer, sections, keyPoints, className, compact = false }: Props) {
  const spoken = isPlaceholderDump(answer || "") ? "" : (answer || "").trim();
  const codeSections = (sections ?? []).filter((section) => {
    const type = (section.type || "").toLowerCase();
    const language = (section.language || "").toLowerCase();
    const content = section.content?.trim();
    if (!content || isPlaceholderDump(content)) return false;
    return ["code", "sql", "pyspark", "scala", "python", "bash", "hcl", "json"].includes(type)
      || ["sql", "python", "scala", "bash", "hcl", "json"].includes(language);
  });
  const points = (keyPoints ?? []).map((point) => point.trim()).filter(Boolean).slice(0, 5);
  const parts = spoken ? splitSpoken(spoken) : { opener: "", rest: "" };

  if (!spoken && !codeSections.length) return null;

  return (
    <div className="space-y-3">
      {codeSections.length > 0 && (
        <div className="space-y-2">
          {codeSections.map((section, index) => {
            const content = section.content?.trim();
            if (!content) return null;
            return (
              <pre
                key={`${section.title || "code"}-${index}`}
                className="m-0 whitespace-pre-wrap rounded-xl border border-emerald-400/20 bg-black/45 p-3.5 font-mono text-[12px] leading-relaxed text-emerald-300"
              >
                {content}
              </pre>
            );
          })}
        </div>
      )}

      {spoken ? (
        <div className={cn("flex gap-3 items-start", compact && "flex-col")}>
          <div
            className={cn(
              "min-w-0 flex-1 max-w-none text-slate-100",
              compact ? "text-sm leading-relaxed" : "text-[15px] leading-[1.62]",
              className
            )}
          >
            <p className="m-0 font-semibold tracking-[0.01em] text-slate-50">{parts.opener}</p>
            {parts.rest ? <p className="mt-2 mb-0 font-medium leading-[1.62] text-slate-100/95">{parts.rest}</p> : null}
            {!compact && !codeSections.length ? (
              <p className="mt-2 mb-0 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400">Ready to speak</p>
            ) : null}
          </div>
          {points.length > 0 && (
            <aside className="w-[140px] shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Key points</p>
              {points.map((point) => (
                <p key={point} className="mb-1 text-[11px] leading-snug text-slate-200">✓ {point}</p>
              ))}
            </aside>
          )}
        </div>
      ) : null}
    </div>
  );
}
