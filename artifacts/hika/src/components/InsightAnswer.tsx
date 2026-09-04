import { cn } from "@/lib/utils";

type SectionLike = {
  type?: string;
  title?: string;
  content?: string;
  language?: string | null;
};

type CodeBlock = {
  title: string;
  language: string;
  content: string;
};

type TextBlock = {
  title: string;
  content: string;
};

function normalizeLanguage(language?: string | null): string {
  if (!language) return "text";
  const l = language.toLowerCase();
  if (l.includes("sql")) return "sql";
  if (l.includes("py")) return "python";
  if (l.includes("spark")) return "python";
  if (l.includes("bash") || l.includes("shell")) return "bash";
  return l;
}

function isCodeSection(section: SectionLike): boolean {
  const type = (section.type ?? "").toLowerCase();
  const language = normalizeLanguage(section.language);
  return ["code", "sql", "python", "pyspark", "scala", "bash", "hcl", "json"].includes(type)
    || ["sql", "python", "scala", "bash", "hcl", "json"].includes(language);
}

function isLikelyCode(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("```")) return true;
  if (t.includes("\n") && /\b(select|with|from|where|join|group by|order by|import|def|class|spark\.|df\.|for\s+\w+\s+in)\b/i.test(t)) {
    return true;
  }
  return /^(select|with|insert|update|delete|create|alter|drop|import|from\s+\w+\s+import|def\s+\w+\s*\(|class\s+\w+)/i.test(t);
}

function extractFencedCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const re = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null = re.exec(text);
  while (match) {
    const language = normalizeLanguage(match[1]);
    blocks.push({
      title: language === "sql" ? "SQL Query" : "Code",
      language,
      content: match[2].trim(),
    });
    match = re.exec(text);
  }
  return blocks;
}

function getCodeBlocks(answer: string, sections?: SectionLike[]): CodeBlock[] {
  const fromSections = (sections ?? [])
    .filter((s) => isCodeSection(s) && !!s.content?.trim())
    .map((s) => {
      const language = normalizeLanguage(s.language);
      return {
        title: s.title?.trim() || (language === "sql" ? "SQL Query" : "Code"),
        language,
        content: (s.content ?? "").trim(),
      };
    });

  if (fromSections.length > 0) return fromSections;

  const fenced = extractFencedCodeBlocks(answer);
  if (fenced.length > 0) return fenced;

  if (isLikelyCode(answer)) {
    return [{ title: "Code", language: "text", content: answer.trim() }];
  }

  return [];
}

function getTextBlocks(sections?: SectionLike[]): TextBlock[] {
  return (sections ?? [])
    .filter((s) => !isCodeSection(s) && !!s.content?.trim())
    .map((s) => ({
      title: s.title?.trim() || "Details",
      content: (s.content ?? "").trim(),
    }));
}

type Props = {
  answer: string;
  sections?: SectionLike[];
  className?: string;
  compact?: boolean;
};

export default function InsightAnswer({ answer, sections, className, compact = false }: Props) {
  const codeBlocks = getCodeBlocks(answer, sections);
  const textBlocks = getTextBlocks(sections);

  if (codeBlocks.length === 0 && textBlocks.length === 0) {
    return <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", className)}>{answer}</p>;
  }

  const trimmed = answer.trim();
  const firstCode = codeBlocks[0]?.content?.trim() ?? "";
  const showProse = !!trimmed && !trimmed.startsWith("```") && trimmed !== firstCode;

  return (
    <div className="space-y-2">
      {codeBlocks.map((block, i) => (
        <div key={`${block.language}-${i}`} className="rounded-md border border-border overflow-hidden bg-black/50">
          {!compact && (
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/20">
              {block.title}
            </div>
          )}
          <pre className={cn(
            "font-mono text-emerald-300 whitespace-pre-wrap overflow-auto",
            compact ? "text-[11px] max-h-40 p-2" : "text-xs max-h-72 p-3"
          )}>
            {block.content}
          </pre>
        </div>
      ))}
      {showProse && (
        <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", className)}>{answer}</p>
      )}
      {textBlocks.map((block, i) => (
        <div key={`text-${i}`} className="rounded-md border border-border overflow-hidden bg-muted/10">
          {!compact && (
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/20">
              {block.title}
            </div>
          )}
          <div className={cn(compact ? "text-[11px] p-2" : "text-sm p-3", "leading-relaxed whitespace-pre-wrap text-muted-foreground")}>
            {block.content}
          </div>
        </div>
      ))}
    </div>
  );
}