import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSession,
  useUpdateSession,
  useAnalyzeContext,
  useTranscribeAudio,
  useCreateInsight,
  getGetStatsQueryKey,
  getListSessionInsightsQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import {
  Mic, Square, Zap, EyeOff,
  ChevronDown, Cpu, AlertTriangle, Code2, ShieldAlert,
  Lightbulb, CheckCircle, TrendingUp, Radio, X,
  Monitor, Video, Wifi, Clock, ChevronRight, MicOff, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/auth";
import { prepareInterviewPersona } from "@/lib/prepare-persona";
import { isIncompleteQuestion } from "@/lib/question-finalizer";
import InsightAnswer from "@/components/InsightAnswer";
import { acceptsRealtimeResponseEvent, appendRealtimeDelta } from "@/services/realtimeProtocol";

// ── Document PiP type augmentation ────────────────────────────────────────────
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
    };
    hikaElectron?: {
      getAppVersion: () => Promise<string>;
      onUpdateState: (callback: (payload: any) => void) => void;
      downloadUpdate: () => void;
      checkForUpdates: () => Promise<boolean>;
      installUpdate: () => void;
    };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AISection = {
  type: string;
  title: string;
  content: string;
  language?: string | null;
};

type Insight = {
  id: string;
  question: string;
  answer: string;
  domain: string;
  suggestions: string[];
  confidence: string;
  sections: AISection[];
  keyPoints?: string[];
  timestamp: Date;
};

type TranscriptChunk = {
  id: string;
  text: string;
  timestamp: Date;
  isQuestion: boolean;
};

type SessionMode = "interview" | "meeting";
type VoiceStatus = "connecting" | "listening" | "speech_detected" | "understanding" | "answering" | "reconnecting" | "fallback" | "disconnected";

type RealtimeEvent = {
  type?: string;
  delta?: string;
  text?: string;
  transcript?: string;
  response_id?: string;
  response?: { id?: string; status?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function looksLikeQuestion(text: string): boolean {
  if (!text.trim()) return false;
  const t = text.trim();
  if (t.endsWith("?")) return true;
  const last = t.split(/[.!]\s+/).pop()?.trim() ?? t;
  return /^(what|how|when|where|who|why|can|could|would|should|is|are|do|does|did|tell me|explain|describe|show me|walk me through)\b/i.test(last);
}

function extractLatestQuestionCandidate(fullText: string, lastAnalyzedFullText: string): string | null {
  const normalizedFull = (fullText || "").trim();
  const normalizedPrev = (lastAnalyzedFullText || "").trim();
  if (!normalizedFull) return null;

  const delta = normalizedPrev && normalizedFull.startsWith(normalizedPrev)
    ? normalizedFull.slice(normalizedPrev.length).trim()
    : normalizedFull;

  if (!delta) return null;

  const parts = delta
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const segment = parts[i];
    if (looksLikeQuestion(segment)) return segment;
  }

  if (/\?$/.test(delta) || /^(what|how|why|when|where|can|could|would|should|is|are|do|does|did|tell me|explain|walk me through)\b/i.test(delta)) {
    return delta;
  }

  return null;
}

function formatElapsed(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function needsVisualContext(text: string) {
  return /(screen|screenshot|ui|page|window|dialog|button|error on screen|what do you see|visual|table shown|image|chart)/i.test(text);
}

// ── Section card ──────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ElementType> = {
  technical: Cpu, rootCause: AlertTriangle, solution: CheckCircle,
  code: Code2, sql: Code2, pyspark: Code2, azure: Code2,
  bestPractices: ShieldAlert, risks: AlertTriangle,
  businessImpact: TrendingUp, architecture: Lightbulb,
};

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { });
  };
  return (
    <button onClick={handleCopy}
      className={cn(
        "text-[9px] font-bold px-2 py-0.5 rounded border transition-all",
        copied
          ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
          : "text-muted-foreground/50 border-border/50 hover:text-muted-foreground hover:border-border",
        className,
      )}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function SectionCard({ section }: { section: AISection }) {
  const Icon = SECTION_ICONS[section.type] ?? Lightbulb;
  const isCode = ["code", "sql", "pyspark", "scala", "python", "azure"].includes(section.type);
  return (
    <div className="rounded-lg overflow-hidden border border-border/50">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        <Icon size={12} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground flex-1">{section.title}</span>
        {isCode && <CopyButton text={section.content} />}
      </div>
      <div className={isCode ? "bg-black/50 p-3" : "p-3"}>
        {isCode
          ? <pre className="text-xs font-mono text-emerald-300 overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed select-text">{section.content}</pre>
          : <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{section.content}</p>}
      </div>
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const confClass = insight.confidence === "high"
    ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/8"
    : insight.confidence === "medium"
      ? "text-amber-400 border-amber-400/30 bg-amber-400/8"
      : "text-muted-foreground border-border bg-muted/30";

  return (
    <motion.div key={insight.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }} className="flex flex-col gap-3 h-full group">
      {insight.domain === "Live Assist" && insight.question !== "Live question" && (
        <div className="rounded-lg border border-indigo-400/15 bg-indigo-400/[0.05] px-3 py-2">
          <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-300/70">Question</p>
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-300/90">{insight.question}</p>
        </div>
      )}
      <div className="text-sm leading-relaxed whitespace-pre-wrap select-text text-slate-100">
        <InsightAnswer answer={insight.answer} sections={insight.sections} keyPoints={insight.keyPoints} className="text-slate-100" />
      </div>
      <div className="self-end opacity-80 group-hover:opacity-100 transition-opacity">
        <CopyButton text={insight.answer} />
      </div>

      {/* Say this */}
      {insight.suggestions.length > 0 && (
        <div className="flex-shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1.5 px-1">Say this</p>
          {insight.suggestions.slice(0, 1).map((s, i) => (
            <div key={i} className="flex gap-2 items-start px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
              <span className="text-primary font-mono text-xs mt-0.5 flex-shrink-0">→</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{s}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border", confClass)}>
          {insight.confidence} confidence
        </span>
        <span className="text-[10px] text-muted-foreground/40 ml-auto font-mono">{insight.timestamp.toLocaleTimeString()}</span>
      </div>
    </motion.div>
  );
}

// ── Platforms ──────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "teams", label: "Teams", icon: "🟦" },
  { id: "zoom", label: "Zoom", icon: "🔵" },
  { id: "meet", label: "Meet", icon: "🟢" },
  { id: "other", label: "Other", icon: "⚪" },
];

// ── PiP window content (inline styles — no Tailwind dependency) ───────────────

function PiPContent({
  sessionTitle, elapsed, platformIcon,
  micActive, isAnalyzing, isTranscribing, recordingSeconds, micError,
  chunks, liveTranscript, insights,
  manualQ, setManualQ,
  startMicRecording, stopMicRecording, runAnalysis, stopSession, onClose,
}: FloatingPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks, liveTranscript]);

  const S = {
    root: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Inter,system-ui,sans-serif", background: "rgba(7,7,15,0.88)", color: "#f1f5f9", overflow: "hidden", boxSizing: "border-box" } as React.CSSProperties,
    hdr: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", flexShrink: 0 } as React.CSSProperties,
    logo: { width: 20, height: 20, borderRadius: 6, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as React.CSSProperties,
    title: { fontSize: 12, fontWeight: 700, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties,
    mono: { fontSize: 10, fontFamily: "monospace", color: "#64748b", flexShrink: 0 } as React.CSSProperties,
    closeBtn: { background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4, fontSize: 16, lineHeight: 1, flexShrink: 0 } as React.CSSProperties,
    split: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" } as React.CSSProperties,
    txPane: { width: "42%", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" } as React.CSSProperties,
    aiPane: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } as React.CSSProperties,
    paneHdr: { padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 } as React.CSSProperties,
    paneLabel: { fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#64748b" } as React.CSSProperties,
    scroll: { flex: 1, overflowY: "auto" as const, padding: 10, display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
    empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 11, textAlign: "center" as const, gap: 6 } as React.CSSProperties,
    bottom: { flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.07)", padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)" } as React.CSSProperties,
    micStop: { width: 36, height: 36, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "2px solid rgba(239,68,68,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" } as React.CSSProperties,
    micGo: { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(99,102,241,0.4)" } as React.CSSProperties,
    input: { flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#e2e8f0", outline: "none", fontFamily: "inherit" } as React.CSSProperties,
    endBtn: { padding: "6px 10px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", cursor: "pointer", fontSize: 11, color: "#f87171", fontWeight: 600 } as React.CSSProperties,
  };
  const askBtn = (dis: boolean): React.CSSProperties => ({ padding: "6px 10px", borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", cursor: dis ? "not-allowed" : "pointer", fontSize: 11, color: "#fff", fontWeight: 600, opacity: dis ? 0.4 : 1 });

  return (
    <div style={S.root}>
      <div style={S.hdr}>
        <img src="/icons/icon.png" alt="Hikanest" style={{ ...S.logo, objectFit: "cover" }} />
        <span style={S.title}>{sessionTitle}</span>
        <span style={S.mono}>{elapsed}</span>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{platformIcon}</span>
        {micActive ? (
          <span style={{ fontSize: 9, color: "#f87171", flexShrink: 0 }}>● REC</span>
        ) : isAnalyzing ? (
          <span style={{ fontSize: 9, color: "#818cf8", flexShrink: 0 }}>⚡ AI</span>
        ) : (
          <span style={{ fontSize: 9, color: "#34d399", flexShrink: 0 }}>● Live</span>
        )}
        <button style={S.closeBtn} onClick={onClose}>✕</button>
      </div>

      {micError && (
        <div style={{ padding: "6px 12px", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: "#f87171", flexShrink: 0 }}>
          ⚠ {micError}
        </div>
      )}

      <div style={S.split}>
        <div style={S.txPane}>
          <div style={S.paneHdr}>
            <span style={S.paneLabel}>Transcript</span>
            {micActive && <span style={{ fontSize: 9, color: "#f87171" }}>● Recording</span>}
            {isTranscribing && !micActive && <span style={{ fontSize: 9, color: "#818cf8" }}>Processing…</span>}
          </div>
          <div style={S.scroll}>
            {chunks.length === 0 && !liveTranscript && !isTranscribing ? (
              <div style={S.empty}><Mic size={18} style={{ opacity: 0.2 }} /><span>Tap record to start capturing</span></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {chunks.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#6366f1", width: 32, flexShrink: 0, textAlign: "right" as const, paddingTop: 2 }}>Client</span>
                    <span style={{ fontSize: 11, lineHeight: 1.6, color: "#94a3b8", flex: 1 }}>{c.text}</span>
                  </div>
                ))}
                {(liveTranscript || (micActive && !liveTranscript)) && (
                  <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#f87171", width: 32, flexShrink: 0, textAlign: "right" as const, paddingTop: 2 }}>Client</span>
                    <span style={{ fontSize: 11, lineHeight: 1.6, color: "#64748b", fontStyle: "italic", flex: 1 }}>
                      {liveTranscript ?? ""}
                      <span style={{ display: "inline-block", width: 2, height: 12, background: "#f87171", marginLeft: 3, opacity: 0.7, verticalAlign: "middle" }} />
                    </span>
                  </div>
                )}
                {isTranscribing && !micActive && (
                  <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#334155", width: 32, flexShrink: 0, textAlign: "right" as const }}>Client</span>
                    <span style={{ fontSize: 10, color: "#334155" }}>●●●</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <div style={S.aiPane}>
          <div style={S.scroll}>
            {(() => {
              const latest = insights[0];
              const latestQuestion = liveTranscript ?? chunks[chunks.length - 1]?.text ?? latest?.question ?? "";
              const hasQuestion = Boolean(latestQuestion) || micActive || isTranscribing;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: "100%", padding: 12 }}>
                  {hasQuestion && (
                    <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 16, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "#7dd3fc", textTransform: "uppercase" }}>Question</span>
                        <span style={{ fontSize: 9, color: "#94a3b8" }}>
                          {micActive ? "Listening…" : isTranscribing ? "Processing…" : "Transcript"}
                        </span>
                      </div>
                      <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {latestQuestion || "Listening for the next question…"}
                      </div>
                    </div>
                  )}

                  {isAnalyzing && (
                    <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", fontSize: 11, color: "#a5b4fc" }}>
                      ⚡ Preparing an answer...
                    </div>
                  )}

                  {!isAnalyzing && latest && (
                    <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.16)", borderRadius: 16, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "#34d399", textTransform: "uppercase" }}>Answer</span>
                        <span style={{ fontSize: 9, color: "#86efac", background: "rgba(16,185,129,0.14)", padding: "2px 6px", borderRadius: 999, border: "1px solid rgba(16,185,129,0.14)" }}>
                          {latest.confidence} confidence
                        </span>
                      </div>
                      <div style={{ color: "#f8fafc", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {latest.answer}
                      </div>
                      {latest.suggestions.length > 0 && (
                        <div style={{ marginTop: 12, background: "rgba(15,23,42,0.7)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 12, padding: 10 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#cbd5e1", textTransform: "uppercase", marginBottom: 6 }}>Suggested reply</div>
                          <div style={{ color: "#dbeafe", fontSize: 12, lineHeight: 1.6 }}>{latest.suggestions[0]}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {!hasQuestion && !latest && !isAnalyzing && (
                    <div style={S.empty}>
                      <Zap size={18} style={{ opacity: 0.2 }} />
                      <span>Waiting for conversation...</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div style={S.bottom}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
          {micActive ? (
            <button style={S.micStop} onClick={stopMicRecording}><Square size={13} color="#f87171" fill="#f87171" /></button>
          ) : (
            <button style={{ ...S.micGo, opacity: isTranscribing ? 0.5 : 1 }} onClick={startMicRecording} disabled={isTranscribing}><Mic size={16} color="#fff" /></button>
          )}
          <span style={{ fontSize: 9, fontFamily: "monospace", color: micActive ? "#f87171" : "#475569" }}>
            {micActive ? formatSecs(recordingSeconds) : isTranscribing ? "···" : "tap"}
          </span>
        </div>
        <textarea
          value={manualQ}
          onChange={(event) => setManualQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              const question = manualQ.trim();
              if (question && !isAnalyzing) {
                setManualQ("");
                runAnalysis({ question });
              }
            }
          }}
          placeholder="Ask Hikanest anything…"
          rows={1}
          style={{ ...S.input, resize: "none" }}
        />
        <button
          style={askBtn(!manualQ.trim() || isAnalyzing)}
          disabled={!manualQ.trim() || isAnalyzing}
          onClick={() => {
            const question = manualQ.trim();
            if (!question) return;
            setManualQ("");
            runAnalysis({ question });
          }}
        >
          Ask
        </button>
        <button style={S.endBtn} onClick={stopSession}>End</button>
      </div>
    </div>
  );
}

      // ── Floating panel overlay ────────────────────────────────────────────────────

      type FloatingPanelProps = {
        sessionTitle: string;
        elapsed: string;
        platformIcon: string;
        micActive: boolean;
        isAnalyzing: boolean;
        isTranscribing: boolean;
        recordingSeconds: number;
        micError: string | null;
        chunks: TranscriptChunk[];
        liveTranscript: string | null;
        insights: Insight[];
        manualQ: string;
        setManualQ: (q: string) => void;
        startMicRecording: () => void;
        stopMicRecording: () => void;
        runAnalysis: (opts?: { question?: string; transcript?: string }) => void;
        stopSession: () => void;
        onClose: () => void;
        uploadedDocs: { id: string; name: string }[];
        setUploadedDocs: React.Dispatch<React.SetStateAction<{ id: string; name: string }[]>>;
        uploadedDocsRef: React.MutableRefObject<{ id: string; name: string }[]>;
      };

      function FloatingPanel({
  sessionTitle, elapsed, platformIcon,
  micActive, isAnalyzing, isTranscribing, recordingSeconds, micError,
  chunks, liveTranscript, insights,
  manualQ, setManualQ,
  startMicRecording, stopMicRecording, runAnalysis, stopSession, onClose,
  uploadedDocs, setUploadedDocs, uploadedDocsRef,
}: FloatingPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [stealth, setStealth] = useState(false);
  const [screenShareMode, setScreenShareMode] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 560, h: 520 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPos({ x: window.innerWidth - 380, y: window.innerHeight - 60 });
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current && pos) {
        setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        setSize({
          w: Math.max(340, Math.min(860, resizeStart.current.w + dx)),
          h: Math.max(220, Math.min(800, resizeStart.current.h + dy)),
        });
      }
    };
    const onUp = () => {
      dragging.current = false;
      resizing.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "H" || e.key === "h")) {
        e.preventDefault();
        setStealth((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!screenShareMode) return;
    const onBlur = () => setStealth(true);
    const onFocus = () => setStealth(false);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [screenShareMode]);

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!pos) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    resizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    e.preventDefault();
    e.stopPropagation();
  }, [size]);

  if (!pos) return null;
  if (stealth) return null;

  const confClass = (c: string) =>
    c === "high"
      ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
      : c === "medium"
        ? "text-amber-400 border-amber-400/20 bg-amber-400/5"
        : "text-muted-foreground border-border bg-muted/30";

  if (collapsed) {
    return (
      <div
        ref={panelRef}
        onMouseDown={onTitleMouseDown}
        style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, userSelect: "none", cursor: "grab" }}
        className="flex items-center gap-2.5 px-3 py-2 rounded-2xl border border-primary/25 bg-[rgba(10,10,22,0.92)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
      >
        <img src="/icons/icon.png" alt="Hikanest" className="w-6 h-6 rounded-lg object-cover flex-shrink-0 shadow-[0_0_10px_rgba(99,102,241,0.4)]" />
        <span className="text-xs font-semibold text-slate-200 max-w-[110px] truncate">{sessionTitle}</span>
        <span className="text-[10px] font-mono text-slate-500">{elapsed}</span>
        {micActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />}
        {isAnalyzing && <Zap size={10} className="text-primary animate-pulse flex-shrink-0" />}
        {screenShareMode && (
          <span className="text-[9px] font-bold text-emerald-400 border border-emerald-500/30 rounded px-1 flex-shrink-0">SS</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); micActive ? stopMicRecording() : startMicRecording(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn("flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all",
            micActive ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-primary/25 bg-primary/10 text-primary")}>
          {micActive ? <><Square size={10} fill="currentColor" />Stop</> : <><Mic size={10} />Record</>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); setCollapsed(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronDown size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setStealth(true); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Hide from screen share (Ctrl+Shift+H to restore)"
          className="p-1 rounded-md text-slate-500 hover:text-amber-400 transition-colors">
          <EyeOff size={13} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-slate-500 hover:text-slate-200 transition-colors">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 9999, userSelect: "none" }}
      className="flex flex-col rounded-2xl border border-primary/20 bg-[rgba(10,10,22,0.93)] backdrop-blur-xl shadow-[0_12px_48px_rgba(0,0,0,0.6)] overflow-hidden"
    >
      <div onMouseDown={onTitleMouseDown}
        className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.07] bg-white/[0.025] flex-shrink-0 cursor-grab select-none">
        <img src="/icons/icon.png" alt="Hikanest" className="w-5 h-5 rounded-md object-cover flex-shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
        <span className="text-slate-200 font-semibold text-xs truncate flex-1 min-w-0">{sessionTitle}</span>
        <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{elapsed}</span>
        <span className="text-lg flex-shrink-0">{platformIcon}</span>
        {micActive ? (
          <span className="flex items-center gap-1 text-[10px] text-red-400 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />REC
          </span>
        ) : isAnalyzing ? (
          <span className="flex items-center gap-1 text-[10px] text-primary flex-shrink-0">
            <Zap size={9} className="animate-pulse" />AI
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
          </span>
        )}
        <button onClick={() => setCollapsed(true)} onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0">
          <ChevronDown size={13} className="rotate-180" />
        </button>
        <button onClick={() => setStealth(true)} onMouseDown={(e) => e.stopPropagation()}
          title="Hide from screen share — press Ctrl+Shift+H to restore"
          className="p-1 rounded-md text-slate-500 hover:text-amber-400 transition-colors flex-shrink-0">
          <EyeOff size={13} />
        </button>
        <button onClick={onClose} onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
          <X size={13} />
        </button>
      </div>

      <div className={cn(
        "flex items-center gap-2.5 px-3 py-2 border-b flex-shrink-0 transition-colors",
        screenShareMode
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-amber-500/5 border-amber-500/15"
      )}>
        {screenShareMode ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-[10px] text-emerald-400 font-semibold flex-1">
              Screen Share Mode ON — Hikanest auto-hides when you switch to Teams/Zoom
            </span>
            <button onClick={() => { setScreenShareMode(false); setStealth(false); }}
              className="text-[9px] text-emerald-400/70 hover:text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.5 flex-shrink-0 transition-colors">
              Turn off
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] text-amber-400/70 flex-1 leading-tight">
              💡 Sharing entire screen? Enable Screen Share Mode — Hikanest auto-hides when you switch to Teams.
            </span>
            <button onClick={() => setScreenShareMode(true)}
              className="text-[9px] text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 flex-shrink-0 flex-nowrap whitespace-nowrap transition-colors">
              Enable
            </button>
          </>
        )}
      </div>

      {micError && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/8 border-b border-red-500/20 px-3 py-2 flex-shrink-0">
          <MicOff size={11} />{micError}
        </div>
      )}

      

      <div className="flex-shrink-0 border-t border-white/[0.07] px-3 py-3 flex items-center gap-3 bg-white/[0.02]">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
            <Zap size={10} className="text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI Assistant</span>
            {isAnalyzing && (
              <span className="ml-auto flex items-center gap-1 text-[9px] text-primary animate-pulse">
                <Zap size={8} />Thinking…
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-slate-400">Upload resume and JD (optional)</label>
              <input type="file" accept=".pdf,.docx,.txt,.md,.json,.csv" multiple onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                if (
                  files.length > 3 ||
                  Array.from(files).some((file) => file.size > 10 * 1024 * 1024) ||
                  Array.from(files).reduce((total, file) => total + file.size, 0) > 15 * 1024 * 1024
                ) {
                  console.error("Upload supports up to 3 files of 10 MB each.");
                  return;
                }
                const toUpload: Array<{ name: string; contentBase64: string }> = [];
                for (let i = 0; i < files.length; i++) {
                  const f = files[i];
                  const b = await f.arrayBuffer();
                  const bytes = new Uint8Array(b);
                  let binary = "";
                  const chunkSize = 0x8000;
                  for (let j = 0; j < bytes.length; j += chunkSize) {
                    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunkSize)));
                  }
                  const base64 = btoa(binary);
                  toUpload.push({ name: f.name, contentBase64: base64 });
                }
                try {
                  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
                  const token = await getAccessToken();
                  const res = await fetch(`${apiUrl}/api/documents`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ files: toUpload }),
                  });
                  if (!res.ok) throw new Error('upload failed');
                  const j = await res.json();
                  const added = (j.files || []).map((f: any) => ({ id: f.id, name: f.name }));
                  setUploadedDocs((prev) => {
                    const next = [...prev, ...added];
                    uploadedDocsRef.current = next;
                    void prepareInterviewPersona(next);
                    return next;
                  });
                } catch (err) {
                  console.error('upload error', err);
                }
              }} />

              {uploadedDocs.length > 0 && (
                <div className="flex flex-col gap-1 text-[12px] text-slate-300">
                  {uploadedDocs.map(d => <div key={d.id} className="px-2 py-1 bg-white/[0.02] rounded">{d.name}</div>)}
                </div>
              )}
            </div>

            {insights.length === 0 && !isAnalyzing ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
                <Zap size={18} />
                <p className="text-[11px] text-center">AI answers will appear here</p>
              </div>
            ) : (
              <>
                {isAnalyzing && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/15">
                    <Zap size={12} className="text-primary animate-pulse flex-shrink-0" />
                    <p className="text-[11px] text-slate-300">Analyzing meeting context…</p>
                  </div>
                )}
                {insights.length > 0 && (
                  <div className="whitespace-pre-wrap text-[14px] text-slate-100 leading-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <InsightAnswer answer={insights[0].answer} sections={insights[0].sections} keyPoints={insights[0].keyPoints} className="text-slate-100" />
                  </div>
                )}
              </>
              )}

            </div>
            <div className="flex items-end gap-2 border-t border-white/[0.07] pt-3">
              <textarea
                value={manualQ}
                onChange={(event) => setManualQ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    const question = manualQ.trim();
                    if (question && !isAnalyzing) {
                      setManualQ("");
                      runAnalysis({ question });
                    }
                  }
                }}
                rows={2}
                placeholder="Ask a free-form question…"
                className="min-h-10 flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100 outline-none focus:border-primary/50"
              />
              <button
                type="button"
                disabled={!manualQ.trim() || isAnalyzing}
                onClick={() => {
                  const question = manualQ.trim();
                  if (!question) return;
                  setManualQ("");
                  runAnalysis({ question });
                }}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  }

  // Main page component
  export default function MeetingAssistant() {

  const micStreamRef = useRef<MediaStream | null>(null);
  const systemAudioStreamRef = useRef<MediaStream | null>(null);
  const mixedRecordStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const systemAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRecRef = useRef<{ abort: () => void; stop: () => void; onend: (() => void) | null } | null>(null);
  const speechFinalRef = useRef("");
  const allChunksRef = useRef<Blob[]>([]);       // accumulated raw audio for this recording
  const interimBusyRef = useRef(false);             // prevent overlapping interim API calls
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const lastAnalyzedTextRef = useRef<string>("");       // last text we sent to AI — avoid re-analyzing same utterance
  const lastDispatchedAtRef = useRef<number>(0);
  const lastDispatchedQuestionRef = useRef<string>("");
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeDataRef = useRef<RTCDataChannel | null>(null);
  const realtimeAnswerRef = useRef("");
  const realtimeTranscriptRef = useRef("");
  const realtimePartialTranscriptRef = useRef("");
  const realtimeTranscriptFinalizedRef = useRef(false);
  const realtimeResponseIdRef = useRef<string | null>(null);
  const realtimeStopRequestedRef = useRef(false);
  const realtimeResponseRequestedRef = useRef(false);
  const cancelledResponseIdsRef = useRef<Set<string>>(new Set());
  const persistedResponseIdsRef = useRef<Set<string>>(new Set());
  const realtimeGenerationRef = useRef(0);
  const realtimeConnectingRef = useRef(false);
  const realtimeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeReconnectAttemptRef = useRef(0);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const realtimeClosedByUserRef = useRef(false);
  const realtimeFallbackRef = useRef(false);
  const forceHttpFallbackRef = useRef(false);
  const fallbackStarterRef = useRef<(() => void) | null>(null);
  const realtimeMetricsRef = useRef<Record<string, number>>({});
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // UI state (restored)
  const queryClient = useQueryClient();
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Client Call");
  const [sessionGuidance, setSessionGuidance] = useState("");
  const [sessionMode, setSessionMode] = useState<SessionMode>("interview");
  const [elapsed, setElapsed] = useState("0:00:00");
  const [platform, setPlatform] = useState("other");
  const [micActive, setMicActive] = useState(false);
  const micActiveRef = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAnalyzingRef = useRef(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const transcriptRef = useRef<string>("");
  const sessionGuidanceRef = useRef<string>("");
  const [liveTranscript, setLiveTranscript] = useState<string | null>(null);
  const liveTranscriptRef = useRef<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [manualQ, setManualQ] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [showStart, setShowStart] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [answerReady, setAnswerReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("disconnected");

  const [uploadedDocs, setUploadedDocs] = useState<{ id: string; name: string }[]>(() => {
    try {
      const stored = window.localStorage.getItem("hika-uploaded-documents");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const uploadedDocsRef = useRef<{ id: string; name: string }[]>(uploadedDocs);
  const conversationHistoryRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const analyzeContext = useAnalyzeContext();
  const transcribeAudio = useTranscribeAudio();
  const createInsight = useCreateInsight();

  // Session timer
  useEffect(() => {
    if (!sessionStart) return;
    const id = setInterval(() => setElapsed(formatElapsed(Date.now() - sessionStart.getTime())), 1000);
    return () => clearInterval(id);
  }, [sessionStart]);

  // Recording seconds timer
  useEffect(() => {
    if (micActive) {
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } else {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setRecordingSeconds(0);
    }
    return () => { if (recordTimerRef.current) clearInterval(recordTimerRef.current); };
  }, [micActive]);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks, liveTranscript]);

  const latestInsight = insights.find((item) => item.id === selectedHistoryId) ?? insights[0];

  // ── Analysis ──────────────────────────────────────────────────────────────

  const captureScreenshot = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !screenStreamRef.current) return null;
    try {
      const c = document.createElement("canvas");
      c.width = Math.min(v.videoWidth, 1280); c.height = Math.min(v.videoHeight, 720);
      const ctx = c.getContext("2d"); if (!ctx) return null;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.65).split(",")[1] ?? null;
    } catch { return null; }
  }, []);

  const persistInsight = useCallback((insight: Insight) => {
    const sid = sessionIdRef.current;
    if (sid) {
      createInsight.mutate({
        data: {
          sessionId: sid,
          question: insight.question,
          answer: insight.answer,
          confidence: insight.confidence,
        },
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSessionInsightsQueryKey(sid) });
        },
      });
    }
  }, [createInsight, queryClient]);

  const runAnalysis = useCallback(async (opts: { question?: string; transcript?: string; utterance?: string } = {}) => {
    if (isAnalyzingRef.current) return;
    const { question, utterance } = opts;
    // utterance = the single latest thing the client just said (most focused)
    // question  = manual typed question from the user
    // transcript = fallback full text
    const latestText = utterance ?? question ?? opts.transcript ?? transcriptRef.current;
    if (!latestText) return;
    if (isIncompleteQuestion(latestText)) {
      setMicError("That sounded incomplete. Press Listen until they finish the question.");
      return;
    }
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setAnswerReady(false);

    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    setInsights((prev) => {
      const draft: Insight = {
        id: crypto.randomUUID(),
        question: question ?? utterance ?? "Live question",
        answer: "Preparing the best response from live context…",
        domain: "Interview",
        suggestions: [],
        confidence: "medium",
        sections: [],
        timestamp: new Date(),
      };
      return prev.length > 0 ? [draft] : [draft];
    });
    const screenshot = null;
    const recentTranscript = transcriptRef.current
      ? `Transcript summary:\n${transcriptRef.current.slice(-1200)}`
      : "";
    // Build context so the latest prompt is answered directly and the most recent transcript is available for accuracy.
    const profileContext = [
      sessionGuidanceRef.current ? `Session guidance: ${sessionGuidanceRef.current}` : "",
      sessionMode === "interview"
        ? "Interview: answer as the candidate, first person, like a real senior data engineer speaking on the call."
        : "Meeting: answer as this person talking to teammates. Decisive, current, first person.",
      "Every question: think, then answer the exact ask. POINT-WISE if they asked for steps, types, or components. PARAGRAPH-WISE if it is one idea. Never open with job title.",
    ].filter(Boolean).join("\n");

    const ctx = utterance
      ? `ANSWER THIS: "${utterance}"\n${profileContext}\n\n${recentTranscript}`
      : question
        ? `ANSWER THIS: "${question}"\n${profileContext}\n\n${recentTranscript}`
        : `${profileContext}\n${latestText.slice(-400)}`;

    const historyForRequest = conversationHistoryRef.current.slice(-4).map((turn) => ({
      role: turn.role,
      content: String(turn.content || "").slice(0, turn.role === "assistant" ? 140 : 140),
    }));
    const userTurn = latestText.trim();

    try {
      const preferredModel = typeof window !== "undefined"
        ? (window.localStorage.getItem("hika-ai-model") || "gpt-4o")
        : "gpt-4o";

      const result = await analyzeContext.mutateAsync({
        data: {
          transcript: ctx,
          screenshotBase64: screenshot ?? undefined,
          sessionId: sessionIdRef.current ?? undefined,
          uploadedDocs: uploadedDocsRef.current.slice(0, 3),
          model: preferredModel,
          mode: sessionMode,
          history: historyForRequest,
        },
      } as any);

      const answer = result.answer?.trim() ?? "No answer available for the current context.";
      const nextHistory: Array<{ role: "user" | "assistant"; content: string }> = [
        ...conversationHistoryRef.current,
        { role: "user", content: userTurn },
        { role: "assistant", content: answer },
      ].slice(-12) as Array<{ role: "user" | "assistant"; content: string }>;
      conversationHistoryRef.current = nextHistory;

      const insight: Insight = {
        id: crypto.randomUUID(),
        question: result.question ?? utterance ?? question ?? "Client question",
        answer,
        domain: result.domain ?? "General Business",
        suggestions: result.suggestions,
        confidence: result.confidence ?? "low",
        sections: (result.sections as AISection[] | undefined) ?? [],
        keyPoints: Array.isArray((result as { keyPoints?: string[] }).keyPoints)
          ? (result as { keyPoints?: string[] }).keyPoints
          : [],
        timestamp: new Date(),
      };
      persistInsight(insight);
      setSelectedHistoryId(null);
      setInsights((prev) =>
        [insight, ...prev.filter((item) => item.id !== insight.id && item.answer !== "Preparing the best response from live context…")].slice(0, 20),
      );
      setAnswerReady(true);
    } catch (error) {
      if (question) setManualQ(question);
      setMicError(error instanceof Error ? error.message : "Hikanest could not generate an answer. Please try again.");
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, [captureScreenshot, analyzeContext, persistInsight, sessionMode]);

  const recordRealtimeMetric = useCallback((name: string) => {
    const now = performance.now();
    realtimeMetricsRef.current[name] = now;
    const speechEnd = realtimeMetricsRef.current.speech_stopped;
    if (name === "first_answer_delta" && speechEnd) {
      realtimeMetricsRef.current.speech_end_to_first_answer_ms = Math.round(now - speechEnd);
    }
    if (import.meta.env.DEV) {
      console.debug("[hikanest:realtime]", name, Math.round(now), realtimeMetricsRef.current.speech_end_to_first_answer_ms
        ? { speech_end_to_first_answer_ms: realtimeMetricsRef.current.speech_end_to_first_answer_ms }
        : "");
    }
  }, []);

  const stopRealtimeStreaming = useCallback((closedByUser = true) => {
    realtimeClosedByUserRef.current = closedByUser;
    if (realtimeReconnectTimerRef.current) clearTimeout(realtimeReconnectTimerRef.current);
    realtimeReconnectTimerRef.current = null;
    realtimeGenerationRef.current += 1;
    realtimeDataRef.current?.close();
    realtimeDataRef.current = null;
    realtimePeerRef.current?.close();
    realtimePeerRef.current = null;
    realtimeAnswerRef.current = "";
    realtimeTranscriptRef.current = "";
    realtimePartialTranscriptRef.current = "";
    realtimeTranscriptFinalizedRef.current = false;
    realtimeStopRequestedRef.current = false;
    realtimeResponseRequestedRef.current = false;
    realtimePartialTranscriptRef.current = "";
    realtimeResponseIdRef.current = null;
  }, []);

  /**
   * A persistent WebRTC audio track eliminates the repeated upload + full-file
   * transcription round trips used by the legacy recorder below.  Realtime
   * emits transcript and answer deltas as soon as they are available.
   */
  const startRealtimeStreaming = useCallback(async (stream: MediaStream, reconnect = false): Promise<boolean> => {
    if (!window.RTCPeerConnection || realtimeConnectingRef.current) return false;
    if (realtimePeerRef.current?.connectionState === "connected") return true;
    if (stream.getAudioTracks().length === 0) return false;

    if (reconnect && realtimePeerRef.current) {
      realtimeDataRef.current?.close();
      realtimePeerRef.current.close();
      realtimeDataRef.current = null;
      realtimePeerRef.current = null;
    }

    realtimeConnectingRef.current = true;
    realtimeClosedByUserRef.current = false;
    realtimeFallbackRef.current = false;
    realtimeStreamRef.current = stream;
    setVoiceStatus(reconnect ? "reconnecting" : "connecting");
    recordRealtimeMetric(reconnect ? "reconnect_started" : "connection_started");

    const generation = realtimeGenerationRef.current + 1;
    realtimeGenerationRef.current = generation;
    const peer = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
    const events = peer.createDataChannel("oai-events");
    realtimePeerRef.current = peer;
    realtimeDataRef.current = events;
    realtimeAnswerRef.current = "";
    realtimeTranscriptRef.current = "";

    const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
    const token = await getAccessToken();

    const isCurrent = () => realtimeGenerationRef.current === generation && realtimePeerRef.current === peer;
    const appendTranscript = (text: string) => {
      const finalText = text.trim();
      if (!finalText || finalText === realtimeTranscriptRef.current) return;
      realtimeTranscriptRef.current = finalText;
      transcriptRef.current = transcriptRef.current
        ? `${transcriptRef.current} ${finalText}`
        : finalText;
      setLiveTranscript(null);
      setChunks((prev) => [...prev, {
        id: crypto.randomUUID(),
        text: finalText,
        timestamp: new Date(),
        isQuestion: looksLikeQuestion(finalText),
      }]);
      recordRealtimeMetric("transcript_completed");
    };

    const showAnswer = (answer: string, done = false) => {
      const text = answer.trim();
      if (!text) return;
      const insight: Insight = {
        id: `realtime-${generation}`,
        question: realtimeTranscriptRef.current || "Live question",
        answer: text,
        domain: "Live Assist",
        suggestions: [],
        confidence: done ? "high" : "medium",
        sections: [],
        timestamp: new Date(),
      };
      setInsights([insight]);
      setSelectedHistoryId(null);
      const responseKey = realtimeResponseIdRef.current;
      if (done && responseKey && !persistedResponseIdsRef.current.has(responseKey)) {
        if (persistedResponseIdsRef.current.size >= 64) persistedResponseIdsRef.current.clear();
        persistedResponseIdsRef.current.add(responseKey);
        persistInsight(insight);
      }
      setAnswerReady(done);
    };

    events.addEventListener("message", (event) => {
      if (!isCurrent()) return;
      let payload: RealtimeEvent;
      try { payload = JSON.parse(event.data); } catch { return; }

      if (payload.type === "input_audio_buffer.speech_started") {
        recordRealtimeMetric("speech_started");
        if (realtimeResponseIdRef.current) cancelledResponseIdsRef.current.add(realtimeResponseIdRef.current);
        if (cancelledResponseIdsRef.current.size > 64) cancelledResponseIdsRef.current.clear();
        realtimeAnswerRef.current = "";
        realtimeResponseIdRef.current = null;
        setAnswerReady(false);
        setVoiceStatus("speech_detected");
        if (events.readyState === "open") events.send(JSON.stringify({ type: "response.cancel" }));
      } else if (payload.type === "input_audio_buffer.speech_stopped") {
        recordRealtimeMetric("speech_stopped");
        setVoiceStatus("understanding");
      } else if (payload.type === "conversation.item.input_audio_transcription.delta") {
        realtimePartialTranscriptRef.current += payload.delta || "";
        realtimeTranscriptFinalizedRef.current = false;
        setLiveTranscript(realtimePartialTranscriptRef.current || null);
        if (payload.delta) recordRealtimeMetric("first_transcript_delta");
      } else if (payload.type === "conversation.item.input_audio_transcription.completed") {
        realtimePartialTranscriptRef.current = "";
        appendTranscript(payload.transcript || "");
        realtimeTranscriptFinalizedRef.current = true;
        setLiveTranscript(null);
        if (realtimeStopRequestedRef.current && !realtimeResponseRequestedRef.current
          && (payload.transcript || realtimeTranscriptRef.current).trim()) {
          realtimeResponseRequestedRef.current = true;
          if (events.readyState === "open") events.send(JSON.stringify({ type: "response.create" }));
        }
      } else if (payload.type === "response.created") {
        realtimeResponseIdRef.current = payload.response?.id || payload.response_id || null;
        realtimeAnswerRef.current = "";
        setVoiceStatus("answering");
        recordRealtimeMetric("response_created");
      } else if (payload.type === "response.output_text.delta") {
        if (!acceptsRealtimeResponseEvent(realtimeResponseIdRef.current, cancelledResponseIdsRef.current, payload.response_id)) return;
        if (!realtimeAnswerRef.current) recordRealtimeMetric("first_answer_delta");
        realtimeAnswerRef.current = appendRealtimeDelta(realtimeAnswerRef.current, payload.delta || "");
        showAnswer(realtimeAnswerRef.current);
      } else if (payload.type === "response.output_text.done") {
        if (!acceptsRealtimeResponseEvent(realtimeResponseIdRef.current, cancelledResponseIdsRef.current, payload.response_id)) return;
        realtimeAnswerRef.current = payload.text || realtimeAnswerRef.current;
        showAnswer(realtimeAnswerRef.current, true);
      } else if (payload.type === "response.done") {
        if (!acceptsRealtimeResponseEvent(realtimeResponseIdRef.current, cancelledResponseIdsRef.current, payload.response?.id)) return;
        const completedText = payload.response?.output
          ?.flatMap((item) => item.content || [])
          .map((content) => content.text || "")
          .join("") || realtimeAnswerRef.current;
        showAnswer(completedText, true);
        realtimeResponseIdRef.current = null;
        setVoiceStatus("listening");
        recordRealtimeMetric("response_completed");
        if (realtimeStopRequestedRef.current) stopRealtimeStreaming();
      }
    });

    const scheduleReconnect = () => {
      if (!isCurrent() || realtimeClosedByUserRef.current || realtimeFallbackRef.current) return;
      if (realtimeReconnectTimerRef.current) return;
      const attempt = realtimeReconnectAttemptRef.current + 1;
      realtimeReconnectAttemptRef.current = attempt;
      if (attempt > 3) {
        realtimeFallbackRef.current = true;
        forceHttpFallbackRef.current = true;
        stopRealtimeStreaming(false);
        setVoiceStatus("fallback");
        setMicError("Live connection was lost. Hikanest switched to fallback transcription.");
        fallbackStarterRef.current?.();
        return;
      }
      const delay = Math.min(8_000, 500 * 2 ** (attempt - 1));
      setVoiceStatus("reconnecting");
      recordRealtimeMetric("reconnect_scheduled");
      realtimeReconnectTimerRef.current = setTimeout(() => {
        realtimeReconnectTimerRef.current = null;
        if (!realtimeClosedByUserRef.current && realtimeStreamRef.current) {
          void startRealtimeStreaming(realtimeStreamRef.current, true);
        }
      }, delay);
    };

    peer.addEventListener("connectionstatechange", () => {
      if (!isCurrent()) return;
      if (peer.connectionState === "connected") {
        realtimeReconnectAttemptRef.current = 0;
        setVoiceStatus("listening");
        recordRealtimeMetric(reconnect ? "reconnect_completed" : "connection_completed");
      } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        scheduleReconnect();
      }
    });
    events.addEventListener("close", scheduleReconnect);
    events.addEventListener("error", scheduleReconnect);

    try {
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const authorization = await fetch(`${apiUrl}/api/openai/realtime/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sessionGuidance: sessionGuidanceRef.current,
          mode: sessionMode,
          uploadedDocs: uploadedDocsRef.current.slice(0, 3),
        }),
      });
      if (!authorization.ok) throw new Error(`Realtime authorization failed (${authorization.status})`);
      const { clientSecret } = await authorization.json() as { clientSecret?: unknown };
      if (typeof clientSecret !== "string" || !clientSecret.startsWith("ek_")) throw new Error("Realtime authorization response was invalid");

      const form = new FormData();
      form.set("sdp", new Blob([offer.sdp || ""], { type: "application/sdp" }), "offer.sdp");
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${clientSecret}` },
        body: form,
      });
      if (!response.ok) throw new Error(`Realtime connection failed (${response.status})`);
      const answerSdp = await response.text();
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      return true;
    } catch (error) {
      peer.close();
      if (realtimePeerRef.current === peer) {
        realtimePeerRef.current = null;
        realtimeDataRef.current = null;
      }
      console.warn("Realtime voice unavailable; using recording fallback.", error);
      return false;
    } finally {
      realtimeConnectingRef.current = false;
    }
  }, [persistInsight, recordRealtimeMetric, sessionMode, stopRealtimeStreaming]);

  useEffect(() => {
    const recover = () => {
      if (!micActiveRef.current || realtimeFallbackRef.current || !realtimeStreamRef.current) return;
      const state = realtimePeerRef.current?.connectionState;
      if (state !== "connected" && !realtimeConnectingRef.current) {
        void startRealtimeStreaming(realtimeStreamRef.current, true);
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") recover(); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [startRealtimeStreaming]);

  useEffect(() => () => stopRealtimeStreaming(), [stopRealtimeStreaming]);

  // ── Recording ─────────────────────────────────────────────────────────────
  //
  // Strategy:
  //   • recorder.start(3000) sends a data chunk every 3 s while recording.
  //   • ondataavailable accumulates ALL chunks into allChunksRef so the
  //     assembled blob always contains the WebM header (first chunk).
  //   • Each interim chunk triggers a fire-and-forget transcription that
  //     updates `liveTranscript` in the left panel — the user sees text
  //     building up while the mic is still running.
  //   • onstop does the FINAL authoritative transcription of the full blob,
  //     commits the chunk, clears liveTranscript, then immediately fires
  //     analysis — no setTimeout, no wait.

  const stopLiveSpeech = useCallback(() => {
    const rec = speechRecRef.current;
    speechRecRef.current = null;
    if (!rec) return;
    rec.onend = null;
    try { rec.abort(); } catch {
      try { rec.stop(); } catch { /* ignore */ }
    }
  }, []);

  const startLiveSpeech = useCallback(() => {
    const Rec = (window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition
      || (window as Window & { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    stopLiveSpeech();
    speechFinalRef.current = "";
    if (!Rec) return false;
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    rec.onresult = (event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> }) => {
      if (!micActiveRef.current) return;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = String(event.results[index][0]?.transcript || "").replace(/\s+/g, " ").trim();
        if (!piece) continue;
        if (event.results[index].isFinal) {
          const current = speechFinalRef.current;
          speechFinalRef.current = !current ? piece : piece.startsWith(current) ? piece : `${current} ${piece}`.replace(/\s+/g, " ").trim();
        } else {
          interim += `${piece} `;
        }
      }
      const shown = [speechFinalRef.current, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!shown) return;
      liveTranscriptRef.current = shown;
      setLiveTranscript(shown);
    };
    rec.onend = () => {
      if (!micActiveRef.current || speechRecRef.current !== rec) return;
      try { rec.start(); } catch { /* ignore */ }
    };
    try {
      rec.start();
      speechRecRef.current = rec;
      return true;
    } catch {
      speechRecRef.current = null;
      return false;
    }
  }, [stopLiveSpeech]);

  const doInterimTranscription = useCallback(async (blob: Blob, mimeType: string) => {
    if (interimBusyRef.current || liveTranscriptRef.current) return;
    interimBusyRef.current = true;
    try {
      const base64 = await blobToBase64(blob);
      const result = await transcribeAudio.mutateAsync({ data: { audioBase64: base64, mimeType } });
      const text = result.transcript?.trim() ?? "";
      if (micActiveRef.current && text && !liveTranscriptRef.current) {
        liveTranscriptRef.current = text;
        setLiveTranscript(text);
      }
    } catch { /* interim errors are silent */ }
    finally { interimBusyRef.current = false; }
  }, [transcribeAudio]);

  const stopMicRecording = useCallback(() => {
    if (!micActiveRef.current && !recorderRef.current) return;
    stopLiveSpeech();
    if (realtimePeerRef.current?.connectionState === "connected" && realtimeDataRef.current?.readyState === "open") {
      micActiveRef.current = false;
      setMicActive(false);
      realtimeStopRequestedRef.current = true;
      realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
      realtimeDataRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      if (realtimeTranscriptFinalizedRef.current && realtimeTranscriptRef.current.trim()) {
        realtimeResponseRequestedRef.current = true;
        realtimeDataRef.current.send(JSON.stringify({ type: "response.create" }));
      }
      setVoiceStatus("understanding");
      return;
    }
    stopRealtimeStreaming();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop(); // onstop handles everything
    } else {
      micActiveRef.current = false;
      setMicActive(false);
      setLiveTranscript(null);
    }
  }, [stopRealtimeStreaming, stopLiveSpeech]);

  const computeRmsLevel = useCallback((analyser: AnalyserNode | null): number => {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(1, rms * 3.2);
  }, []);

  const startAudioMeters = useCallback(() => {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    const loop = () => {
      setMicLevel(computeRmsLevel(micAnalyserRef.current));
      setSystemLevel(computeRmsLevel(systemAnalyserRef.current));
      meterFrameRef.current = requestAnimationFrame(loop);
    };
    meterFrameRef.current = requestAnimationFrame(loop);
  }, [computeRmsLevel]);

  const stopAuxAudioCapture = useCallback(() => {
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    micAnalyserRef.current = null;
    systemAnalyserRef.current = null;
    setMicLevel(0);
    setSystemLevel(0);

    mixedRecordStreamRef.current?.getTracks().forEach((t) => t.stop());
    mixedRecordStreamRef.current = null;

    systemAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
    systemAudioStreamRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { /* no-op */ });
      audioContextRef.current = null;
    }
  }, []);

  const getOrCreateMicStream = useCallback(async () => {
    if (!micStreamRef.current) {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
    }
    return micStreamRef.current;
  }, []);

  const getSystemAudioTrack = useCallback(async (): Promise<MediaStreamTrack | null> => {
    const existing = systemAudioStreamRef.current?.getAudioTracks()[0];
    if (existing && existing.readyState === "live") return existing;

    if (!navigator.mediaDevices?.getDisplayMedia) return null;

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTrack = display.getAudioTracks()[0] ?? null;
      if (!audioTrack) {
        display.getTracks().forEach((t) => t.stop());
        return null;
      }

      // Keep only audio to reduce capture overhead.
      display.getVideoTracks().forEach((t) => t.stop());
      systemAudioStreamRef.current = display;
      return audioTrack;
    } catch {
      return null;
    }
  }, []);

  const buildRecordingStream = useCallback(async (): Promise<MediaStream> => {
    const micStream = await getOrCreateMicStream();
    const micTrack = micStream.getAudioTracks()[0];
    if (!micTrack) throw new Error("Microphone track unavailable");

    const systemTrack = await getSystemAudioTrack();

    const context = new AudioContext({ sampleRate: 48000 });
    await context.resume();
    const destination = context.createMediaStreamDestination();

    const micSource = context.createMediaStreamSource(new MediaStream([micTrack]));
    const micGain = context.createGain();
    const micAnalyser = context.createAnalyser();
    micAnalyser.fftSize = 1024;
    micGain.gain.value = 1.1;
    micSource.connect(micGain);
    micGain.connect(destination);
    micGain.connect(micAnalyser);
    micAnalyserRef.current = micAnalyser;

    if (systemTrack) {
      const systemSource = context.createMediaStreamSource(new MediaStream([systemTrack]));
      const systemGain = context.createGain();
      const systemAnalyser = context.createAnalyser();
      systemAnalyser.fftSize = 1024;
      systemGain.gain.value = 1.3;
      systemSource.connect(systemGain);
      systemGain.connect(destination);
      systemGain.connect(systemAnalyser);
      systemAnalyserRef.current = systemAnalyser;
    } else {
      systemAnalyserRef.current = null;
    }

    audioContextRef.current = context;
    mixedRecordStreamRef.current = destination.stream;
    startAudioMeters();
    return destination.stream;
  }, [getOrCreateMicStream, getSystemAudioTrack, startAudioMeters]);

  const startMicRecording = useCallback(async () => {
    if (micActiveRef.current) return;
    setMicError(null);
    micActiveRef.current = true;
    setMicActive(true);
    liveTranscriptRef.current = null;
    setLiveTranscript(null);
    try {
      const fallbackMicStream = await getOrCreateMicStream();
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
          : "audio/ogg;codecs=opus";

      allChunksRef.current = [];
      interimBusyRef.current = false;
      lastAnalyzedTextRef.current = "";
      lastDispatchedAtRef.current = 0;
      lastDispatchedQuestionRef.current = "";
      realtimeFallbackRef.current = true;
      setVoiceStatus("fallback");

      const recorder = new MediaRecorder(fallbackMicStream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (!e.data?.size) return;
        allChunksRef.current.push(e.data);
        if (!micActiveRef.current) return;
        if (e.data.size < 500) return;
        doInterimTranscription(e.data, mimeType);
      };

      recorder.onstop = async () => {
        micActiveRef.current = false;
        recorderRef.current = null;
        setMicActive(false);
        stopLiveSpeech();

        const live = (liveTranscriptRef.current || "").replace(/\s+/g, " ").trim();
        liveTranscriptRef.current = null;
        setLiveTranscript(null);

        if (isIncompleteQuestion(live)) {
          setMicError("That sounded incomplete. Press Listen until they finish the question.");
          return;
        }

        if (live.split(/\s+/).filter(Boolean).length >= 6) {
          const updated = transcriptRef.current ? `${transcriptRef.current} ${live}` : live;
          transcriptRef.current = updated;
          setChunks((prev) => [...prev, {
            id: crypto.randomUUID(),
            text: live,
            timestamp: new Date(),
            isQuestion: looksLikeQuestion(live),
          }]);
          runAnalysis({ utterance: live });
          return;
        }

        const blob = new Blob(allChunksRef.current, { type: mimeType });
        if (blob.size < 500) return;

        setIsTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const result = await transcribeAudio.mutateAsync({ data: { audioBase64: base64, mimeType } });
          const finalText = result.transcript?.trim() ?? "";

          if (finalText) {
            if (isIncompleteQuestion(finalText)) {
              setMicError("That sounded incomplete. Press Listen until they finish the question.");
              return;
            }
            const updated = transcriptRef.current ? `${transcriptRef.current} ${finalText}` : finalText;
            transcriptRef.current = updated;
            setChunks((prev) => [...prev, {
              id: crypto.randomUUID(),
              text: finalText,
              timestamp: new Date(),
              isQuestion: looksLikeQuestion(finalText),
            }]);
            runAnalysis({ utterance: finalText });
          }
        } catch (err) {
          console.error("TRANSCRIBE ERROR:", err);
          setMicError("Transcription failed — please try again.");
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.onerror = () => {
        setMicError("Recording error — please try again.");
        micActiveRef.current = false;
        setMicActive(false);
        setLiveTranscript(null);
        stopLiveSpeech();
      };

      recorder.start(400);
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      setMicError(denied ? "Microphone access denied — allow mic permission in your browser settings." : "Could not access microphone or meeting audio.");
      micActiveRef.current = false;
      setMicActive(false);
      stopLiveSpeech();
      stopAuxAudioCapture();
    }
  }, [doInterimTranscription, getOrCreateMicStream, transcribeAudio, runAnalysis, startLiveSpeech, stopLiveSpeech, stopAuxAudioCapture]);

  const toggleMic = useCallback(() => {
    if (micActiveRef.current) stopMicRecording(); else startMicRecording();
  }, [startMicRecording, stopMicRecording]);

  // Rebuild a single legacy audio pipeline only after Realtime has fully
  // stopped. This prevents the same microphone from being sent down both paths.
  fallbackStarterRef.current = () => {
    if (!sessionIdRef.current || recorderRef.current || !micActiveRef.current) return;
    mixedRecordStreamRef.current?.getTracks().forEach((track) => track.stop());
    mixedRecordStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    stopAuxAudioCapture();
    micActiveRef.current = false;
    setMicActive(false);
    window.setTimeout(() => { void startMicRecording(); }, 0);
  };


  // ── Session ───────────────────────────────────────────────────────────────

  const releaseMicStream = useCallback(() => {
    stopLiveSpeech();
    stopRealtimeStreaming();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    stopAuxAudioCapture();
    micActiveRef.current = false;
    setMicActive(false);
    setLiveTranscript(null);
    setVoiceStatus("disconnected");
  }, [stopAuxAudioCapture, stopRealtimeStreaming, stopLiveSpeech]);

  const startSession = useCallback(async (mode?: SessionMode) => {
    const chosenMode = mode ?? sessionMode;
    setMicError(null);
    const normalizedTitle = sessionTitle.trim() || (chosenMode === "interview" ? "Interview Session" : "Meeting Session");
    const modeGuidance = chosenMode === "interview"
      ? "Live interview: think about THIS question and answer it. Resume facts only when they asked about the person. Never open with job title."
      : "Live meeting: short, decisive answers to THIS ask, not a repeated bio.";

    try {
      const session = await createSession.mutateAsync({ data: { title: normalizedTitle, platform } });
      sessionIdRef.current = session.id;
      sessionGuidanceRef.current = [sessionGuidance.trim(), modeGuidance].filter(Boolean).join("\n");
      if (uploadedDocsRef.current.length) {
        void prepareInterviewPersona(uploadedDocsRef.current);
      }
      forceHttpFallbackRef.current = false;
      cancelledResponseIdsRef.current.clear();
      persistedResponseIdsRef.current.clear();
      setShowStart(false);
      setChunks([]); setInsights([]);
      transcriptRef.current = "";
      setSessionStart(new Date());
      setElapsed("0:00:00");
      setSessionActive(true);
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    } catch (error) {
      setMicError(error instanceof Error ? error.message : "Could not start the session. Please try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionTitle, platform, sessionGuidance, sessionMode, createSession, queryClient]);

  const stopSession = useCallback(() => {
    releaseMicStream();
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null; videoRef.current = null;
    if (pipWin) { try { pipWin.close(); } catch { } }
    setPipWin(null);
    setShowOverlay(false);
    const sid = sessionIdRef.current;
    if (sid) updateSession.mutate({ id: sid, data: { status: "ended" } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }),
      onError: () => setMicError("Session closed locally, but history could not be updated."),
    });
    setSessionActive(false); sessionIdRef.current = null; setSessionStart(null);
  }, [releaseMicStream, updateSession, queryClient, pipWin]);

  const exportSession = useCallback(() => {
    const lines: string[] = [];
    lines.push(`# Hikanest Session: ${sessionTitle}`);
    lines.push(`**Date:** ${new Date().toLocaleDateString()}  **Duration:** ${elapsed}`);
    lines.push("");
    if (chunks.length) {
      lines.push("## Transcript");
      chunks.forEach(c => lines.push(`- ${c.text}`));
      lines.push("");
    }
    if (insights.length) {
      lines.push("## AI Answers");
      [...insights].reverse().forEach(ins => {
        const ts = ins.timestamp.toLocaleTimeString();
        lines.push(`### [${ts}] ${ins.question}`);
        lines.push(ins.answer);
        ins.sections.forEach(s => {
          lines.push("");
          lines.push(`**${s.title}**`);
          lines.push("```" + (s.language || ""));
          lines.push(s.content);
          lines.push("```");
        });
        lines.push("");
      });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hikanest-${sessionTitle.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionTitle, elapsed, chunks, insights]);

  const handleTransparent = useCallback(async () => {
    // Exit transparent mode
    if (showOverlay || pipWin) {
      if (pipWin) { try { pipWin.close(); } catch { } setPipWin(null); }
      setShowOverlay(false);
      return;
    }
    // Enter transparent mode — try Document PiP first
    if (window.documentPictureInPicture) {
      try {
        const pip = await window.documentPictureInPicture.requestWindow({ width: 600, height: 500 });
        pip.document.documentElement.style.cssText = "height:100%;margin:0;padding:0;";
        pip.document.body.style.cssText = "margin:0;padding:0;height:100vh;overflow:hidden;";
        setPipWin(pip);
        setShowOverlay(true);
        pip.addEventListener("pagehide", () => {
          setPipWin(null);
          setShowOverlay(false);
        });
        return;
      } catch {
        // PiP blocked (iframe/preview) — fall through to in-page overlay
      }
    }
    // Fallback: in-page dark backdrop overlay
    setShowOverlay(true);
  }, [showOverlay, pipWin]);

  // ── Start screen ──────────────────────────────────────────────────────────

  if (!sessionActive) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_left,_rgba(108,99,255,0.16),_transparent_30%),linear-gradient(135deg,_#06070e_0%,_#090b16_100%)]">
        <AnimatePresence mode="wait">
          {!showStart ? (
            <motion.div key="cta" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }} className="w-full max-w-md rounded-[32px] border border-white/10 bg-[rgba(10,11,20,0.86)] p-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#6c63ff]/30 bg-[#6c63ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#c8b9ff] mb-5">
                <Zap size={12} /> Hikanest live
              </div>
              <img src="/icons/icon.png" alt="Hikanest" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-6 shadow-[0_0_32px_rgba(108,99,255,0.32)]" />
              <h1 className="text-2xl font-semibold mb-2 tracking-tight text-white">Ready to assist</h1>
              <p className="text-sm text-white/55 leading-relaxed mb-8">
                Start a session and let Hikanest capture the conversation, surface the best reply, and keep the experience effortless.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-8 text-xs text-white/60">
                {[{ icon: Mic, label: "Record" }, { icon: Video, label: "Screen" }, { icon: EyeOff, label: "Stealth" }, { icon: Wifi, label: "Live AI" }].map(({ icon: Icon, label }) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                      <Icon size={15} className="text-[#8b5cf6]" />
                    </div>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setSessionMode("interview"); setShowStart(true); }}
                  className="py-3 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #6c63ff, #00e5ff)", boxShadow: "0 8px 24px rgba(108,99,255,0.28)" }}
                >
                  Start Interview
                </button>
                <button
                  onClick={() => { setSessionMode("meeting"); setShowStart(true); }}
                  className="py-3 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #0ea5e9, #22d3ee)", boxShadow: "0 8px 24px rgba(34,211,238,0.24)" }}
                >
                  Start Meeting
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="w-full max-w-md">
              <div className="rounded-[28px] border border-white/10 bg-[rgba(10,11,20,0.88)] p-6 space-y-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">Session Setup</h2>
                  <button onClick={() => setShowStart(false)} className="text-white/50 hover:text-white"><X size={16} /></button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/45 uppercase tracking-wider">Session Name</label>
                  <input className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                    value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="e.g. Client Demo" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/45 uppercase tracking-wider">Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSessionMode("interview")}
                      className={cn(
                        "py-2.5 rounded-xl border text-xs font-semibold transition-all",
                        sessionMode === "interview"
                          ? "border-[#6c63ff]/45 bg-[#6c63ff]/14 text-[#d7ccff]"
                          : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white",
                      )}
                    >
                      Interview
                    </button>
                    <button
                      onClick={() => setSessionMode("meeting")}
                      className={cn(
                        "py-2.5 rounded-xl border text-xs font-semibold transition-all",
                        sessionMode === "meeting"
                          ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-200"
                          : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white",
                      )}
                    >
                      Meeting
                    </button>
                  </div>

                  <label className="text-xs font-semibold text-white/45 uppercase tracking-wider">Platform</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PLATFORMS.map((p) => (
                      <button key={p.id} onClick={() => setPlatform(p.id)}
                        className={cn("flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all",
                          platform === p.id ? "border-[#6c63ff]/40 bg-[#6c63ff]/12 text-[#c8b9ff]" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white")}> 
                        <span className="text-xl">{p.icon}</span>{p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/45 uppercase tracking-wider">Session Guidance (Optional)</label>
                  <textarea
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#6c63ff] min-h-[84px]"
                    value={sessionGuidance}
                    onChange={(e) => setSessionGuidance(e.target.value)}
                    placeholder="e.g. Interview for Azure Data Admin role. Answer as a confident 6 years experienced candidate."
                  />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/55 space-y-2">
                  <p className="font-semibold text-white text-xs">How it works</p>
                  <p>🎙 Tap the mic — transcript appears <strong>live</strong> while the client speaks. Capture does not start until you press Listen.</p>
                  <p>⏹ Tap to stop — AI answer appears <strong>immediately</strong>.</p>
                  <p>👁 <strong>Transparent</strong> pops Hikanest into a floating overlay window.</p>
                </div>
                {micError && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                    <MicOff size={13} className="flex-shrink-0" />{micError}
                  </div>
                )}
                <button onClick={() => startSession(sessionMode)} disabled={createSession.isPending}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #6c63ff, #00e5ff)" }}>
                  <Monitor size={15} />
                  {createSession.isPending ? "Starting…" : sessionMode === "interview" ? "Start Interview" : "Start Meeting"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Active session ────────────────────────────────────────────────────────

  const platformInfo = PLATFORMS.find((p) => p.id === platform);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(108,99,255,0.12),_transparent_30%),linear-gradient(135deg,_#06070e_0%,_#090b16_100%)]">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 flex-shrink-0 bg-[rgba(10,11,20,0.72)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="text-lg select-none">{platformInfo?.icon ?? "⚪"}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{sessionTitle}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock size={10} />{elapsed}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
              </span>
              <span>·</span>
              <span className="capitalize" aria-live="polite">{voiceStatus.replace(/_/g, " ")}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAnalyzing && (
            <div className="flex items-center gap-1.5 text-xs text-[#c8b9ff] bg-[#6c63ff]/10 border border-[#6c63ff]/20 rounded-lg px-3 py-1.5">
              <Zap size={11} className="animate-pulse" />Thinking…
            </div>
          )}
          <button onClick={exportSession}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
            title="Export session as Markdown">
            <Download size={13} />Export
          </button>
          <button onClick={handleTransparent}
            className={cn("flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all",
              (showOverlay || pipWin) ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            <EyeOff size={13} />{(showOverlay || pipWin) ? "Exit Transparent" : "Transparent"}
          </button>
          <button onClick={stopSession}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all">
            <Square size={13} />End
          </button>
        </div>
      </div>

      {/* Mic error banner */}
      <AnimatePresence>
        {micError && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/8 border-b border-destructive/20 px-5 py-2.5">
              <MicOff size={13} className="flex-shrink-0" />{micError}
              <button onClick={() => setMicError(null)} className="ml-auto"><X size={13} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main conversation panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-[#8b5cf6]" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Conversation</h2>
              {answerReady && !isAnalyzing && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-400/20">
                  Answer ready
                </span>
              )}
            </div>
            {insights.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {insights.length} insight{insights.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            <div className="space-y-4">
              {(() => {
                const displayedQuestion = selectedHistoryId
                  ? latestInsight?.question ?? ""
                  : liveTranscript ?? chunks[chunks.length - 1]?.text ?? insights[0]?.question ?? "";
                const hasQuestion = Boolean(displayedQuestion) || micActive || isTranscribing;

                return (
                  <>
                    {hasQuestion && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.2)]">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Question</span>
                          <span className="text-[10px] text-slate-400">
                            {micActive ? "Listening…" : isTranscribing ? "Processing…" : "Transcript"}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
                          {displayedQuestion || "Listening for the next question…"}
                        </p>
                      </motion.div>
                    )}

                    {isAnalyzing && (
                      <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-3 text-sm text-muted-foreground rounded-2xl border border-primary/15 bg-primary/5 p-4">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "hsl(238 84% 67% / 0.12)" }}>
                          <Zap size={14} className="text-primary animate-pulse" />
                        </div>
                        <span>Preparing the best answer…</span>
                      </motion.div>
                    )}

                    {!isAnalyzing && latestInsight && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 shadow-[0_10px_30px_rgba(16,185,129,0.08)]">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Answer</span>
                          <span className="text-[10px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                            {latestInsight.confidence} confidence
                          </span>
                        </div>
                        <div className="text-sm leading-relaxed text-slate-100">
                          <InsightAnswer answer={latestInsight.answer} sections={latestInsight.sections} keyPoints={latestInsight.keyPoints} className="text-slate-100" />
                        </div>
                        {latestInsight.suggestions.length > 0 && (
                          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 mb-2">Suggested reply</p>
                            <p className="text-sm leading-relaxed text-slate-200">{latestInsight.suggestions[0]}</p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {!hasQuestion && !latestInsight && !isAnalyzing && (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center h-full text-center text-white/55 pb-8 min-h-[280px]">
                        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-white/10 bg-white/[0.04]" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                          <Zap size={22} className="text-[#8b5cf6]" />
                        </div>
                        <p className="text-sm font-medium mb-1 text-white/70">AI answers appear here</p>
                        <p className="text-xs text-white/45 leading-relaxed max-w-44">
                          Stop recording and the answer arrives instantly
                        </p>
                      </motion.div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {insights.length > 1 && (
            <div className="flex-shrink-0 border-t border-border/50 px-4 py-2 space-y-0.5 max-h-32 overflow-y-auto" style={{ background: "hsl(var(--muted)/0.2)" }}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Previous</p>
              {insights.slice(1).map((ins) => (
                <button
                  key={ins.id}
                  type="button"
                  onClick={() => setSelectedHistoryId(ins.id)}
                  className={cn(
                    "flex w-full items-center gap-2 py-0.5 text-left rounded px-1",
                    selectedHistoryId === ins.id ? "bg-white/10 text-slate-100" : "hover:bg-white/5",
                  )}
                >
                  <span className="text-[10px] text-muted-foreground/50 font-mono flex-shrink-0">
                    {ins.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 truncate">{ins.question}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Full-width bottom bar ── */}
      <div className="flex-shrink-0 border-t border-white/10 bg-[rgba(10,11,20,0.72)] px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-5 max-w-3xl mx-auto">

          {/* Large centered mic toggle */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <AnimatePresence mode="wait">
              {micActive ? (
                <motion.button key="stop" initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.85 }}
                  transition={{ duration: 0.15 }} onClick={stopMicRecording}
                  className="relative w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  style={{ background: "hsl(0 84% 60% / 0.12)", border: "2px solid hsl(0 84% 60% / 0.4)" }}>
                  <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "hsl(0 84% 60% / 0.12)" }} />
                  <Square size={18} className="text-red-400" fill="currentColor" />
                </motion.button>
              ) : (
                <motion.button key="start" initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.85 }}
                  transition={{ duration: 0.15 }} onClick={startMicRecording}
                  disabled={isTranscribing}
                  className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))", boxShadow: "0 0 20px hsla(238,84%,67%,0.35)" }}>
                  <Mic size={22} className="text-white" />
                </motion.button>
              )}
            </AnimatePresence>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 min-w-[2.5rem] text-center">
              {micActive ? <span className="text-red-400">{formatSecs(recordingSeconds)}</span>
                : isTranscribing ? <span className="text-primary animate-pulse">···</span>
                  : "tap"}
            </span>
          </div>

          <div className="w-36 flex-shrink-0 space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Mic</span>
                <span>{Math.round(micLevel * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-100"
                  style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Client</span>
                <span>{Math.round(systemLevel * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-100"
                  style={{ width: `${Math.max(4, Math.round(systemLevel * 100))}%` }}
                />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground/70 leading-tight">
              Keep Client above 15% while Teams speaker is talking.
            </p>
          </div>

          <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-xs font-semibold text-white/75">Live Assist Mode</p>
            <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
              No manual prompts needed. Hikanest listens, understands interviewer intent, and prepares your next answer automatically.
            </p>
          </div>
        </div>
      </div>

      {/* ── PiP window portal (renders PiPContent into the OS-level floating window) ── */}
      {pipWin && createPortal(
        <PiPContent
          sessionTitle={sessionTitle}
          elapsed={elapsed}
          platformIcon={platformInfo?.icon ?? "⚪"}
          micActive={micActive}
          isAnalyzing={isAnalyzing}
          isTranscribing={isTranscribing}
          recordingSeconds={recordingSeconds}
          micError={micError}
          chunks={chunks}
          liveTranscript={liveTranscript}
          insights={insights}
          manualQ={manualQ}
          setManualQ={setManualQ}
          startMicRecording={startMicRecording}
          stopMicRecording={stopMicRecording}
          runAnalysis={runAnalysis}
          stopSession={stopSession}
          onClose={() => { try { pipWin.close(); } catch { } setPipWin(null); setShowOverlay(false); }}
          uploadedDocs={uploadedDocs}
          setUploadedDocs={setUploadedDocs}
          uploadedDocsRef={uploadedDocsRef}
        />,
        pipWin.document.body
      )}

      {/* ── Fallback: in-page overlay when PiP not available (e.g. Replit preview) ── */}
      {showOverlay && !pipWin && (
        <>
          <div className="fixed inset-0 z-[9998] bg-[rgba(7,7,15,0.18)] backdrop-blur-sm" />
          <FloatingPanel
            sessionTitle={sessionTitle}
            elapsed={elapsed}
            platformIcon={platformInfo?.icon ?? "⚪"}
            micActive={micActive}
            isAnalyzing={isAnalyzing}
            isTranscribing={isTranscribing}
            recordingSeconds={recordingSeconds}
            micError={micError}
            chunks={chunks}
            liveTranscript={liveTranscript}
            insights={insights}
            manualQ={manualQ}
            setManualQ={setManualQ}
            startMicRecording={startMicRecording}
            stopMicRecording={stopMicRecording}
            runAnalysis={runAnalysis}
            stopSession={stopSession}
            onClose={() => setShowOverlay(false)}
            uploadedDocs={uploadedDocs}
            setUploadedDocs={setUploadedDocs}
            uploadedDocsRef={uploadedDocsRef}
          />
        </>
      )}
    </div>
  );
}
