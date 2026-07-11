import { useEffect, useState, useCallback } from "react";
import { Mic, MicOff, Zap, Lightbulb, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Insight = {
  question: string;
  answer: string;
  suggestions: string[];
  confidence: string;
  timestamp: string;
};

type ChannelMsg =
  | { type: "insight"; data: Insight }
  | { type: "analyzing"; value: boolean }
  | { type: "mic"; active: boolean }
  | { type: "transcript"; text: string };

export default function StealthOverlay() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.title = "Hika — Stealth";

    const bc = new BroadcastChannel("hika-stealth");
    bc.onmessage = (e: MessageEvent<ChannelMsg>) => {
      const msg = e.data;
      if (msg.type === "insight") setInsight(msg.data);
      if (msg.type === "analyzing") setIsAnalyzing(msg.value);
      if (msg.type === "mic") setMicActive(msg.active);
      if (msg.type === "transcript") setTranscript(msg.text);
    };
    return () => bc.close();
  }, []);

  const toggleMic = useCallback(() => {
    const bc = new BroadcastChannel("hika-stealth");
    bc.postMessage({ type: "toggle-mic" });
    bc.close();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans select-none">
      {/* Drag bar / header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border bg-card cursor-grab active:cursor-grabbing"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="w-5 h-5 rounded bg-primary flex items-center justify-center shadow-[0_0_8px_rgba(0,255,255,0.4)]">
            <span className="font-mono font-bold text-primary-foreground text-[10px]">H</span>
          </div>
          <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
            Hika Stealth
          </span>
          {isAnalyzing && (
            <span className="flex items-center gap-1 text-primary text-xs animate-pulse">
              <Zap size={11} />
              thinking…
            </span>
          )}
        </div>

        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* Mic toggle */}
          <button
            onClick={toggleMic}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              micActive
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {micActive ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <Mic size={12} />
                On
              </>
            ) : (
              <>
                <MicOff size={12} />
                Off
              </>
            )}
          </button>

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          <button
            onClick={() => window.close()}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Latest answer */}
          {isAnalyzing ? (
            <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
              <Zap size={14} className="text-primary" />
              <span className="text-sm">Analyzing…</span>
            </div>
          ) : insight ? (
            <div className="space-y-2 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <Lightbulb size={13} className="text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono mb-1 leading-tight truncate max-w-[300px]">
                    {insight.question}
                  </p>
                  <p className="text-sm leading-relaxed">{insight.answer}</p>
                </div>
              </div>

              {insight.suggestions.length > 0 && (
                <div className="border-t border-border pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                    Suggested replies
                  </p>
                  <ul className="space-y-1">
                    {insight.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <span className="text-primary font-mono text-[10px] mt-px">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 pt-0.5">
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                    insight.confidence === "high"
                      ? "border-primary/40 text-primary bg-primary/10"
                      : insight.confidence === "medium"
                      ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {insight.confidence} confidence
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">{insight.timestamp}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
              <Zap size={22} className="mb-2 opacity-30" />
              <p className="text-xs">Waiting for Hika to detect context…</p>
              <p className="text-[10px] mt-1 opacity-60">Enable mic or ask a question in the main window</p>
            </div>
          )}

          {/* Live transcript preview */}
          {transcript && (
            <div className="border-t border-border pt-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                Heard
              </p>
              <p className="text-xs text-muted-foreground font-mono line-clamp-2 leading-relaxed">
                {transcript}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
