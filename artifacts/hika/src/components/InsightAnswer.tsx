import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  answer: string;
  className?: string;
  compact?: boolean;
};

export default function InsightAnswer({ answer, className, compact = false }: Props) {
  if (!answer?.trim()) return null;

  return (
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
  );
}