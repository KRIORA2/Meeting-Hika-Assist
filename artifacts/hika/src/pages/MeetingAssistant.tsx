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
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import {
  Mic, Square, Zap, EyeOff, Send,
  ChevronDown, Cpu, AlertTriangle, Code2, ShieldAlert,
  Lightbulb, CheckCircle, TrendingUp, Radio, X,
  Monitor, Video, Wifi, Clock, ChevronRight, MicOff, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Document PiP type augmentation ────────────────────────────────────────────
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
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
  suggestions: string[];
  confidence: string;
  sections: AISection[];
  timestamp: Date;
};

type TranscriptChunk = {
  id: string;
  text: string;
  timestamp: Date;
  isQuestion: boolean;
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

function formatElapsed(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
    }).catch(() => {});
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
      transition={{ duration: 0.25 }} className="flex flex-col gap-3 h-full">
      {/* Question label */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "hsl(238 84% 67% / 0.15)" }}>
          <Zap size={11} className="text-primary" />
        </div>
        <span className="text-xs font-semibold text-foreground/70 flex-1">{insight.question}</span>
        <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border flex-shrink-0", confClass)}>{insight.confidence}</span>
      </div>

      {/* Answer */}
      <div className="rounded-xl p-4 border flex-shrink-0 relative group" style={{ background: "hsl(238 84% 67% / 0.06)", borderColor: "hsl(238 84% 67% / 0.18)" }}>
        <p className="text-sm leading-relaxed select-text">{insight.answer}</p>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={insight.answer} />
        </div>
      </div>

      {/* Code / sections — always expanded, no accordion */}
      {insight.sections.length > 0 && (
        <div className="space-y-2 flex-shrink-0">
          {insight.sections.map((s, i) => <SectionCard key={i} section={s} />)}
        </div>
      )}

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
  { id: "zoom",  label: "Zoom",  icon: "🔵" },
  { id: "meet",  label: "Meet",  icon: "🟢" },
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
    root:    { display:"flex", flexDirection:"column", height:"100vh", fontFamily:"Inter,system-ui,sans-serif", background:"#07070f", color:"#f1f5f9", overflow:"hidden", boxSizing:"border-box" } as React.CSSProperties,
    hdr:     { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.025)", flexShrink:0 } as React.CSSProperties,
    logo:    { width:20, height:20, borderRadius:6, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 } as React.CSSProperties,
    title:   { fontSize:12, fontWeight:700, color:"#e2e8f0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" } as React.CSSProperties,
    mono:    { fontSize:10, fontFamily:"monospace", color:"#64748b", flexShrink:0 } as React.CSSProperties,
    closeBtn:{ background:"none", border:"none", color:"#64748b", cursor:"pointer", padding:4, fontSize:16, lineHeight:1, flexShrink:0 } as React.CSSProperties,
    split:   { flex:1, display:"flex", minHeight:0, overflow:"hidden" } as React.CSSProperties,
    txPane:  { width:"42%", flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.07)", overflow:"hidden" } as React.CSSProperties,
    aiPane:  { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" } as React.CSSProperties,
    paneHdr: { padding:"6px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 } as React.CSSProperties,
    paneLabel:{ fontSize:9, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:"#64748b" } as React.CSSProperties,
    scroll:  { flex:1, overflowY:"auto" as const, padding:10, display:"flex", flexDirection:"column", gap:8 } as React.CSSProperties,
    empty:   { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#334155", fontSize:11, textAlign:"center" as const, gap:6 } as React.CSSProperties,
    live:    { fontSize:11, lineHeight:1.6, padding:"6px 10px", borderRadius:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", color:"#fca5a5" } as React.CSSProperties,
    liveTag: { fontSize:9, fontWeight:700, color:"#ef4444", display:"block", marginBottom:4 } as React.CSSProperties,
    aiBody:  { padding:"8px 10px" } as React.CSSProperties,
    aiQ:     { fontSize:10, fontFamily:"monospace", color:"#64748b", marginBottom:6, whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis" } as React.CSSProperties,
    aiA:     { fontSize:12, lineHeight:1.6, color:"#e2e8f0" } as React.CSSProperties,
    aiSub:   { borderTop:"1px solid rgba(255,255,255,0.06)", padding:"6px 10px" } as React.CSSProperties,
    aiSubLbl:{ fontSize:9, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:"#475569", fontWeight:700, marginBottom:6 } as React.CSSProperties,
    aiSugg:  { fontSize:10, color:"#94a3b8", lineHeight:1.5, marginBottom:4 } as React.CSSProperties,
    aiNum:   { color:"#818cf8", fontFamily:"monospace", marginRight:6 } as React.CSSProperties,
    aiMeta:  { borderTop:"1px solid rgba(255,255,255,0.06)", padding:"4px 10px", display:"flex", alignItems:"center" } as React.CSSProperties,
    bottom:  { flexShrink:0, borderTop:"1px solid rgba(255,255,255,0.07)", padding:"8px 10px", display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.02)" } as React.CSSProperties,
    micStop: { width:36, height:36, borderRadius:"50%", background:"rgba(239,68,68,0.12)", border:"2px solid rgba(239,68,68,0.4)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" } as React.CSSProperties,
    micGo:   { width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 14px rgba(99,102,241,0.4)" } as React.CSSProperties,
    input:   { flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#e2e8f0", outline:"none", fontFamily:"inherit" } as React.CSSProperties,
    endBtn:  { padding:"6px 10px", borderRadius:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", cursor:"pointer", fontSize:11, color:"#f87171", fontWeight:600 } as React.CSSProperties,
  };
  const txChunk = (q: boolean): React.CSSProperties => ({ fontSize:11, lineHeight:1.6, padding:"6px 10px", borderRadius:8, background: q ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)", border: q ? "1px solid rgba(99,102,241,0.15)" : "1px solid rgba(255,255,255,0.06)", color: q ? "#c7d2fe" : "#94a3b8" });
  const aiCard  = (first: boolean): React.CSSProperties => ({ borderRadius:10, border: first ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.06)", background: first ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.02)", overflow:"hidden" });
  const confSty = (c: string): React.CSSProperties => ({ fontSize:9, fontWeight:700, textTransform:"uppercase", color: c==="high"?"#34d399":c==="medium"?"#fbbf24":"#94a3b8", border:"1px solid", borderColor: c==="high"?"rgba(52,211,153,0.2)":c==="medium"?"rgba(251,191,36,0.2)":"rgba(148,163,184,0.2)", padding:"1px 6px", borderRadius:4 });
  const askBtn  = (dis: boolean): React.CSSProperties => ({ padding:"6px 10px", borderRadius:8, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", border:"none", cursor: dis?"not-allowed":"pointer", fontSize:11, color:"#fff", fontWeight:600, opacity: dis ? 0.4 : 1 });

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.hdr}>
        <div style={S.logo}><Zap size={10} color="#fff" fill="#fff" /></div>
        <span style={S.title}>{sessionTitle}</span>
        <span style={S.mono}>{elapsed}</span>
        <span style={{ fontSize:16, flexShrink:0 }}>{platformIcon}</span>
        {micActive
          ? <span style={{ fontSize:9, color:"#f87171", flexShrink:0 }}>● REC</span>
          : isAnalyzing
          ? <span style={{ fontSize:9, color:"#818cf8", flexShrink:0 }}>⚡ AI</span>
          : <span style={{ fontSize:9, color:"#34d399", flexShrink:0 }}>● Live</span>}
        <button style={S.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Mic error */}
      {micError && (
        <div style={{ padding:"6px 12px", background:"rgba(239,68,68,0.08)", borderBottom:"1px solid rgba(239,68,68,0.2)", fontSize:11, color:"#f87171", flexShrink:0 }}>
          ⚠ {micError}
        </div>
      )}

      {/* Split panels */}
      <div style={S.split}>
        {/* Transcript */}
        <div style={S.txPane}>
          <div style={S.paneHdr}>
            <span style={S.paneLabel}>Transcript</span>
            {micActive && <span style={{ fontSize:9, color:"#f87171" }}>● Recording</span>}
            {isTranscribing && !micActive && <span style={{ fontSize:9, color:"#818cf8" }}>Processing…</span>}
          </div>
          <div style={S.scroll}>
            {chunks.length === 0 && !liveTranscript && !isTranscribing
              ? <div style={S.empty}><Mic size={18} style={{ opacity:0.2 }} /><span>Tap record to start capturing</span></div>
              : <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {chunks.map(c => (
                    <div key={c.id} style={{ display:"flex", gap:8, padding:"2px 0" }}>
                      <span style={{ fontSize:9, fontWeight:700, color:"#6366f1", width:32, flexShrink:0, textAlign:"right" as const, paddingTop:2 }}>Client</span>
                      <span style={{ fontSize:11, lineHeight:1.6, color:"#94a3b8", flex:1 }}>{c.text}</span>
                    </div>
                  ))}
                  {(liveTranscript || (micActive && !liveTranscript)) && (
                    <div style={{ display:"flex", gap:8, padding:"2px 0" }}>
                      <span style={{ fontSize:9, fontWeight:700, color:"#f87171", width:32, flexShrink:0, textAlign:"right" as const, paddingTop:2 }}>Client</span>
                      <span style={{ fontSize:11, lineHeight:1.6, color:"#64748b", fontStyle:"italic", flex:1 }}>
                        {liveTranscript ?? ""}
                        <span style={{ display:"inline-block", width:2, height:12, background:"#f87171", marginLeft:3, opacity:0.7, verticalAlign:"middle" }} />
                      </span>
                    </div>
                  )}
                  {isTranscribing && !micActive && (
                    <div style={{ display:"flex", gap:8, padding:"2px 0" }}>
                      <span style={{ fontSize:9, fontWeight:700, color:"#334155", width:32, flexShrink:0, textAlign:"right" as const }}>Client</span>
                      <span style={{ fontSize:10, color:"#334155" }}>●●●</span>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
            }
          </div>
        </div>

        {/* AI Answers */}
        <div style={S.aiPane}>
          <div style={S.paneHdr}>
            <span style={S.paneLabel}>⚡ AI Answers</span>
            {isAnalyzing && <span style={{ fontSize:9, color:"#818cf8" }}>Thinking…</span>}
          </div>
          <div style={S.scroll}>
            {insights.length === 0 && !isAnalyzing
              ? <div style={S.empty}><Zap size={18} style={{ opacity:0.2 }} /><span>AI answers will appear here</span></div>
              : <>
                  {isAnalyzing && (
                    <div style={{ padding:"8px 12px", borderRadius:10, background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.15)", fontSize:11, color:"#a5b4fc" }}>
                      ⚡ Analyzing meeting context…
                    </div>
                  )}
                  {insights.map((ins, i) => (
                    <div key={ins.id} style={aiCard(i === 0)}>
                      <div style={S.aiBody}>
                        <p style={S.aiQ}>{ins.question}</p>
                        <p style={S.aiA}>{ins.answer}</p>
                      </div>
                      {ins.suggestions.length > 0 && (
                        <div style={S.aiSub}>
                          <p style={S.aiSubLbl}>Say this</p>
                          {ins.suggestions.slice(0,2).map((s, si) => (
                            <p key={si} style={S.aiSugg}><span style={S.aiNum}>{si+1}.</span>{s}</p>
                          ))}
                        </div>
                      )}
                      <div style={S.aiMeta}>
                        <span style={confSty(ins.confidence)}>{ins.confidence}</span>
                        <span style={{ fontSize:9, color:"#334155", fontFamily:"monospace", marginLeft:"auto" }}>
                          {ins.timestamp.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
            }
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={S.bottom}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flexShrink:0 }}>
          {micActive
            ? <button style={S.micStop} onClick={stopMicRecording}><Square size={13} color="#f87171" fill="#f87171" /></button>
            : <button style={{ ...S.micGo, opacity: isTranscribing ? 0.5 : 1 }} onClick={startMicRecording} disabled={isTranscribing}><Mic size={16} color="#fff" /></button>}
          <span style={{ fontSize:9, fontFamily:"monospace", color: micActive?"#f87171":"#475569" }}>
            {micActive ? formatSecs(recordingSeconds) : isTranscribing ? "···" : "tap"}
          </span>
        </div>
        <input style={S.input} value={manualQ} placeholder="Ask Hika…"
          onChange={e => setManualQ(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey && manualQ.trim()) { e.preventDefault(); const q=manualQ; setManualQ(""); runAnalysis({question:q}); } }} />
        <button style={askBtn(!manualQ.trim()||isAnalyzing)} disabled={!manualQ.trim()||isAnalyzing}
          onClick={() => { if (!manualQ.trim()) return; const q=manualQ; setManualQ(""); runAnalysis({question:q}); }}>Ask</button>
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
};

function FloatingPanel({
  sessionTitle, elapsed, platformIcon,
  micActive, isAnalyzing, isTranscribing, recordingSeconds, micError,
  chunks, liveTranscript, insights,
  manualQ, setManualQ,
  startMicRecording, stopMicRecording, runAnalysis, stopSession, onClose,
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

  // Set default position bottom-right on mount
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
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [pos]);

  // Ctrl+Shift+H toggles stealth mode globally
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

  // Screen Share Mode: auto-hide when browser loses focus, restore on return
  useEffect(() => {
    if (!screenShareMode) return;
    const onBlur  = () => setStealth(true);
    const onFocus = () => setStealth(false);
    window.addEventListener("blur",  onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur",  onBlur);
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

  // Stealth mode — completely invisible, Ctrl+Shift+H to restore
  if (stealth) return null;

  const confClass = (c: string) =>
    c === "high" ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
    : c === "medium" ? "text-amber-400 border-amber-400/20 bg-amber-400/5"
    : "text-muted-foreground border-border bg-muted/30";

  // ── Collapsed pill ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        ref={panelRef}
        onMouseDown={onTitleMouseDown}
        style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, userSelect: "none", cursor: "grab" }}
        className="flex items-center gap-2.5 px-3 py-2 rounded-2xl border border-primary/25 bg-[rgba(10,10,22,0.92)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
      >
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 0 10px rgba(99,102,241,0.4)" }}>
          <Zap size={12} color="#fff" fill="#fff" />
        </div>
        <span className="text-xs font-semibold text-slate-200 max-w-[110px] truncate">{sessionTitle}</span>
        <span className="text-[10px] font-mono text-slate-500">{elapsed}</span>
        {micActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />}
        {isAnalyzing && <Zap size={10} className="text-primary animate-pulse flex-shrink-0" />}
        {screenShareMode && (
          <span className="text-[9px] font-bold text-emerald-400 border border-emerald-500/30 rounded px-1 flex-shrink-0">SS</span>
        )}
        {/* Mic toggle */}
        <button onClick={(e) => { e.stopPropagation(); micActive ? stopMicRecording() : startMicRecording(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn("flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all",
            micActive ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-primary/25 bg-primary/10 text-primary")}>
          {micActive ? <><Square size={10} fill="currentColor" />Stop</> : <><Mic size={10} />Record</>}
        </button>
        {/* Expand */}
        <button onClick={(e) => { e.stopPropagation(); setCollapsed(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronDown size={14} />
        </button>
        {/* Stealth — hide from screen share */}
        <button onClick={(e) => { e.stopPropagation(); setStealth(true); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Hide from screen share (Ctrl+Shift+H to restore)"
          className="p-1 rounded-md text-slate-500 hover:text-amber-400 transition-colors">
          <EyeOff size={13} />
        </button>
        {/* Close overlay */}
        <button onClick={(e) => { e.stopPropagation(); onClose(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-slate-500 hover:text-slate-200 transition-colors">
          <X size={13} />
        </button>
      </div>
    );
  }

  // ── Expanded panel ──────────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 9999, userSelect: "none" }}
      className="flex flex-col rounded-2xl border border-primary/20 bg-[rgba(10,10,22,0.93)] backdrop-blur-xl shadow-[0_12px_48px_rgba(0,0,0,0.6)] overflow-hidden"
    >
      {/* ── Title bar (drag handle) ── */}
      <div onMouseDown={onTitleMouseDown}
        className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.07] bg-white/[0.025] flex-shrink-0 cursor-grab select-none">
        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 0 8px rgba(99,102,241,0.4)" }}>
          <Zap size={10} color="#fff" fill="#fff" />
        </div>
        <span className="text-slate-200 font-semibold text-xs truncate flex-1 min-w-0">{sessionTitle}</span>
        <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{elapsed}</span>
        <span className="text-lg flex-shrink-0">{platformIcon}</span>
        {/* status */}
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
        {/* Stealth — hide from screen share */}
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

      {/* ── Screen Share Mode banner ── */}
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
              Screen Share Mode ON — Hika auto-hides when you switch to Teams/Zoom
            </span>
            <button onClick={() => { setScreenShareMode(false); setStealth(false); }}
              className="text-[9px] text-emerald-400/70 hover:text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.5 flex-shrink-0 transition-colors">
              Turn off
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] text-amber-400/70 flex-1 leading-tight">
              💡 Sharing entire screen? Enable Screen Share Mode — Hika auto-hides when you switch to Teams.
            </span>
            <button onClick={() => setScreenShareMode(true)}
              className="text-[9px] text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 flex-shrink-0 flex-nowrap whitespace-nowrap transition-colors">
              Enable
            </button>
          </>
        )}
      </div>

      {/* ── Mic error ── */}
      {micError && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/8 border-b border-red-500/20 px-3 py-2 flex-shrink-0">
          <MicOff size={11} />{micError}
        </div>
      )}

      {/* ── Split panels ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* LEFT: Transcript */}
        <div className="w-[42%] flex-shrink-0 flex flex-col border-r border-white/[0.07] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Radio size={10} className="text-slate-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Transcript</span>
            </div>
            {micActive && (
              <span className="flex items-center gap-1 text-[9px] text-red-400">
                <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />Recording
              </span>
            )}
            {isTranscribing && !micActive && (
              <span className="flex items-center gap-1 text-[9px] text-primary animate-pulse">
                <span className="w-1 h-1 rounded-full bg-primary" />Processing…
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            {chunks.length === 0 && !liveTranscript && !isTranscribing ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
                <Mic size={18} />
                <p className="text-[11px] text-center">Tap record to start capturing</p>
              </div>
            ) : (
              <>
                {chunks.map((c) => (
                  <div key={c.id} className="flex gap-2 py-0.5">
                    <span className="text-[9px] font-semibold text-primary/60 w-10 flex-shrink-0 pt-0.5 text-right">Client</span>
                    <span className="text-[11px] text-slate-300 leading-relaxed flex-1">{c.text}</span>
                  </div>
                ))}
                {(liveTranscript || (micActive && !liveTranscript)) && (
                  <div className="flex gap-2 py-0.5">
                    <span className="text-[9px] font-semibold text-red-400/70 w-10 flex-shrink-0 pt-0.5 text-right">Client</span>
                    <span className="text-[11px] text-slate-400 italic leading-relaxed flex-1">
                      {liveTranscript ?? ""}
                      <span className="inline-block w-0.5 h-3 bg-red-400/60 ml-0.5 animate-pulse align-middle" />
                    </span>
                  </div>
                )}
                {isTranscribing && !micActive && (
                  <div className="flex gap-2 py-0.5">
                    <span className="text-[9px] font-semibold text-slate-600 w-10 flex-shrink-0 text-right">Client</span>
                    <span className="text-[10px] text-slate-600 animate-pulse">●●●</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: AI answers */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
            <Zap size={10} className="text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI Answers</span>
            {isAnalyzing && (
              <span className="ml-auto flex items-center gap-1 text-[9px] text-primary animate-pulse">
                <Zap size={8} />Thinking…
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                {insights.map((ins, i) => (
                  <div key={ins.id} className={cn("rounded-xl border overflow-hidden",
                    i === 0 ? "border-primary/20 bg-primary/6" : "border-white/[0.06] bg-white/[0.02]")}>
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] font-mono text-slate-500 truncate mb-1.5">{ins.question}</p>
                      <p className="text-[12px] leading-relaxed text-slate-200">{ins.answer}</p>
                    </div>
                    {ins.suggestions.length > 0 && (
                      <div className="border-t border-white/[0.06] px-3 py-2">
                        <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1.5">Say this</p>
                        {ins.suggestions.slice(0, 2).map((s, si) => (
                          <p key={si} className="text-[10px] text-slate-400 leading-relaxed mb-1">
                            <span className="text-primary font-mono mr-1.5">{si + 1}.</span>{s}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="border-t border-white/[0.06] px-3 py-1.5 flex items-center gap-2">
                      <span className={cn("text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", confClass(ins.confidence))}>
                        {ins.confidence}
                      </span>
                      <span className="text-[9px] text-slate-700 ml-auto font-mono">
                        {ins.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom bar: mic + ask ── */}
      <div className="flex-shrink-0 border-t border-white/[0.07] px-3 py-3 flex items-center gap-3 bg-white/[0.02]">
        {/* Mic button */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          {micActive ? (
            <button onClick={stopMicRecording}
              className="relative w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "hsl(0 84% 60% / 0.12)", border: "2px solid hsl(0 84% 60% / 0.4)" }}>
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "hsl(0 84% 60% / 0.1)" }} />
              <Square size={14} className="text-red-400" fill="currentColor" />
            </button>
          ) : (
            <button onClick={startMicRecording} disabled={isTranscribing}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))", boxShadow: "0 0 16px hsla(238,84%,67%,0.3)" }}>
              <Mic size={16} className="text-white" />
            </button>
          )}
          <span className="text-[9px] font-mono text-slate-600 min-w-[2rem] text-center">
            {micActive ? <span className="text-red-400">{formatSecs(recordingSeconds)}</span>
              : isTranscribing ? <span className="text-primary animate-pulse">···</span>
              : "tap"}
          </span>
        </div>

        {/* Ask input */}
        <div className="flex-1 flex gap-2">
          <input value={manualQ} onChange={(e) => setManualQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && manualQ.trim()) {
                e.preventDefault(); const q = manualQ; setManualQ(""); runAnalysis({ question: q });
              }
            }}
            placeholder="Ask Hika anything…"
            className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary/40" />
          <button onClick={() => { if (!manualQ.trim()) return; const q = manualQ; setManualQ(""); runAnalysis({ question: q }); }}
            disabled={!manualQ.trim() || isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))" }}>
            <Send size={11} />Ask
          </button>
        </div>

        {/* End session */}
        <button onClick={stopSession}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-2 rounded-lg border border-red-500/25 bg-red-500/8 text-red-400 hover:bg-red-500/15 transition-all flex-shrink-0">
          <Square size={10} />End
        </button>
      </div>

      {/* ── Resize handle (bottom-right corner) ── */}
      <div onMouseDown={onResizeMouseDown}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 opacity-30 hover:opacity-70 transition-opacity"
        style={{ zIndex: 1 }}>
        <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-primary/60 rounded-br-sm" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MeetingAssistant() {
  const queryClient = useQueryClient();

  const [showStart, setShowStart] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Client Meeting");
  const [platform, setPlatform] = useState("teams");
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("0:00:00");

  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const transcriptRef = useRef("");

  // Live (in-progress) transcript shown while mic is recording
  const [liveTranscript, setLiveTranscript] = useState<string | null>(null);
  const liveTranscriptRef = useRef<string | null>(null); // sync-readable mirror of liveTranscript

  const [insights, setInsights] = useState<Insight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAnalyzingRef = useRef(false);

  const [micActive, setMicActive] = useState(false);
  const micActiveRef = useRef(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [manualQ, setManualQ] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);
  const [pipWin, setPipWin] = useState<Window | null>(null);

  const screenStreamRef    = useRef<MediaStream | null>(null);
  const micStreamRef       = useRef<MediaStream | null>(null);
  const recorderRef        = useRef<MediaRecorder | null>(null);
  const allChunksRef       = useRef<Blob[]>([]);       // accumulated raw audio for this recording
  const interimBusyRef     = useRef(false);             // prevent overlapping interim API calls
  const recordTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef           = useRef<HTMLVideoElement | null>(null);
  const sessionIdRef       = useRef<number | null>(null);
  const transcriptEndRef   = useRef<HTMLDivElement | null>(null);
  const lastAnalyzedTextRef = useRef<string>("");       // last text we sent to AI — avoid re-analyzing same utterance

  const createSession  = useCreateSession();
  const updateSession  = useUpdateSession();
  const analyzeContext = useAnalyzeContext();
  const transcribeAudio = useTranscribeAudio();
  const createInsight  = useCreateInsight();

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

  const latestInsight = insights[0];

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

  const addInsight = useCallback((insight: Insight) => {
    setInsights((prev) => [insight, ...prev]);
    const sid = sessionIdRef.current;
    if (sid) createInsight.mutate({ data: { sessionId: sid, question: insight.question, answer: insight.answer, confidence: insight.confidence } });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
  }, [createInsight, queryClient]);

  const runAnalysis = useCallback(async (opts: { question?: string; transcript?: string; utterance?: string } = {}) => {
    if (isAnalyzingRef.current) return;
    const { question, utterance } = opts;
    // utterance = the single latest thing the client just said (most focused)
    // question  = manual typed question from the user
    // transcript = fallback full text
    const latestText = utterance ?? question ?? opts.transcript ?? transcriptRef.current;
    if (!latestText) return;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    const screenshot = captureScreenshot();
    // Build context: put the latest utterance prominently so AI can't miss it
    const ctx = utterance
      ? `ANSWER THIS: "${utterance}"`
      : question
        ? `ANSWER THIS: "${question}"`
        : latestText.slice(-400);
    try {
      const result = await analyzeContext.mutateAsync({ data: { transcript: ctx, screenshotBase64: screenshot ?? undefined, sessionId: sessionIdRef.current ?? undefined } });
      addInsight({
        id: crypto.randomUUID(),
        question: result.question ?? utterance ?? question ?? "Client question",
        answer: result.answer,
        suggestions: result.suggestions,
        confidence: result.confidence ?? "low",
        sections: (result.sections as AISection[] | undefined) ?? [],
        timestamp: new Date(),
      });
    } catch (err) { console.error("Analysis failed:", err); }
    finally { isAnalyzingRef.current = false; setIsAnalyzing(false); }
  }, [captureScreenshot, analyzeContext, addInsight]);

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

  const doInterimTranscription = useCallback(async (blob: Blob, mimeType: string) => {
    if (interimBusyRef.current || blob.size < 1000) return;
    interimBusyRef.current = true;
    try {
      const base64 = await blobToBase64(blob);
      const result = await transcribeAudio.mutateAsync({ data: { audioBase64: base64, mimeType } });
      const text = result.transcript?.trim() ?? "";
      if (micActiveRef.current && text) {
        liveTranscriptRef.current = text;
        setLiveTranscript(text);

        // ── Instant analysis (Parakeet-style) ─────────────────────────────
        // Fire analysis immediately as each live transcription chunk arrives.
        // Only fire if the text changed meaningfully (>25 new chars) from the
        // last thing we already analyzed — prevents spam-calling the AI on
        // unchanged or near-identical utterances.
        const lastAnalyzed = lastAnalyzedTextRef.current;
        const newChars = text.length - lastAnalyzed.length;
        const endsWithPause = /[.?!,;]\s*$/.test(text) || text.length > 40;
        if (!isAnalyzingRef.current && endsWithPause && newChars > 20) {
          lastAnalyzedTextRef.current = text;
          runAnalysis({ utterance: text }); // fire-and-forget
        }
      }
    } catch { /* interim errors are silent */ }
    finally { interimBusyRef.current = false; }
  }, [transcribeAudio, runAnalysis]);

  const stopMicRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop(); // onstop handles everything
    } else {
      micActiveRef.current = false;
      setMicActive(false);
      setLiveTranscript(null);
    }
  }, []);

  const startMicRecording = useCallback(async () => {
    if (micActiveRef.current) return;
    setMicError(null);
    try {
      if (!micStreamRef.current) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const stream = micStreamRef.current!;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : "audio/ogg;codecs=opus";

      allChunksRef.current = [];
      interimBusyRef.current = false;
      lastAnalyzedTextRef.current = "";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (!e.data?.size) return;
        allChunksRef.current.push(e.data);

        // Fire interim transcription while mic is still active (fire-and-forget)
        if (micActiveRef.current) {
          const snapshot = new Blob(allChunksRef.current, { type: mimeType });
          doInterimTranscription(snapshot, mimeType);
        }
      };

      recorder.onstop = async () => {
        micActiveRef.current = false;
        recorderRef.current = null;
        setMicActive(false);

        // Grab the latest live text before clearing — use it to start analysis NOW
        const latestLive = liveTranscriptRef.current;
        liveTranscriptRef.current = null;
        setLiveTranscript(null); // clear live preview immediately

        const blob = new Blob(allChunksRef.current, { type: mimeType });
        if (blob.size < 500) return;

        // ── Parallel strategy for minimum latency ──────────────────────────
        // 1. Fire AI analysis immediately using the live transcript we already
        //    have — the user sees the answer in ~1–1.5 s (just the AI call).
        // 2. Run the final authoritative transcription in parallel — once done,
        //    it commits the permanent chunk to the left panel.
        //    If no live text was available yet, analysis fires after transcription.

        if (latestLive) {
          runAnalysis({ utterance: latestLive }); // fire-and-forget — only the latest utterance
        }

        setIsTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const result = await transcribeAudio.mutateAsync({ data: { audioBase64: base64, mimeType } });
          const finalText = result.transcript?.trim() ?? "";

          if (finalText) {
            const updated = transcriptRef.current ? `${transcriptRef.current} ${finalText}` : finalText;
            transcriptRef.current = updated;
            setChunks((prev) => [...prev, {
              id: crypto.randomUUID(),
              text: finalText,
              timestamp: new Date(),
              isQuestion: looksLikeQuestion(finalText),
            }]);
            // If no live text was available, fire analysis now with the final utterance
            if (!latestLive) runAnalysis({ utterance: finalText });
          }
        } catch {
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
      };

      // 1 s timeslice — live preview updates every second
      recorder.start(1000);
      micActiveRef.current = true;
      setMicActive(true);
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      setMicError(denied ? "Microphone access denied — allow mic permission in your browser settings." : "Could not access microphone.");
    }
  }, [doInterimTranscription, transcribeAudio, runAnalysis]);

  const toggleMic = useCallback(() => {
    if (micActiveRef.current) stopMicRecording(); else startMicRecording();
  }, [startMicRecording, stopMicRecording]);


  // ── Session ───────────────────────────────────────────────────────────────

  const releaseMicStream = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micActiveRef.current = false;
    setMicActive(false);
    setLiveTranscript(null);
  }, []);

  const startSession = useCallback(async () => {
    setMicError(null);
    const session = await createSession.mutateAsync({ data: { title: sessionTitle, platform } });
    sessionIdRef.current = session.id;
    setShowStart(false);
    setChunks([]); setInsights([]);
    transcriptRef.current = "";
    setSessionStart(new Date());
    setElapsed("0:00:00");
    setSessionActive(true);
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionTitle, platform, createSession, queryClient]);

  const stopSession = useCallback(() => {
    releaseMicStream();
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null; videoRef.current = null;
    if (pipWin) { try { pipWin.close(); } catch {} }
    setPipWin(null);
    setShowOverlay(false);
    const sid = sessionIdRef.current;
    if (sid) updateSession.mutate({ id: sid, data: { status: "ended" } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }),
    });
    setSessionActive(false); sessionIdRef.current = null; setSessionStart(null);
  }, [releaseMicStream, updateSession, queryClient, pipWin]);

  const exportSession = useCallback(() => {
    const lines: string[] = [];
    lines.push(`# Hika Session: ${sessionTitle}`);
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `hika-${sessionTitle.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionTitle, elapsed, chunks, insights]);

  const handleTransparent = useCallback(async () => {
    // Exit transparent mode
    if (showOverlay || pipWin) {
      if (pipWin) { try { pipWin.close(); } catch {} setPipWin(null); }
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
      <div className="h-full flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {!showStart ? (
            <motion.div key="cta" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }} className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))", boxShadow: "0 0 32px hsla(238,84%,67%,0.3)" }}>
                <Zap size={28} className="text-white" fill="white" />
              </div>
              <h1 className="text-2xl font-semibold mb-2 tracking-tight">Ready to assist</h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                Tap the mic when the client speaks — transcript builds live, AI answers the moment you stop.
              </p>
              <div className="flex justify-center gap-6 mb-10 text-xs text-muted-foreground">
                {[{ icon: Mic, label: "Record" }, { icon: Video, label: "Screen" }, { icon: EyeOff, label: "Stealth" }, { icon: Wifi, label: "Live AI" }].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center">
                      <Icon size={15} className="text-primary" />
                    </div>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowStart(true)}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))", boxShadow: "0 4px 24px hsla(238,84%,67%,0.3)" }}>
                Start New Session
              </button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="w-full max-w-md">
              <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Session Setup</h2>
                  <button onClick={() => setShowStart(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Session Name</label>
                  <input className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="e.g. Client Demo" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PLATFORMS.map((p) => (
                      <button key={p.id} onClick={() => setPlatform(p.id)}
                        className={cn("flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all",
                          platform === p.id ? "border-primary/50 bg-primary/8 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
                        <span className="text-xl">{p.icon}</span>{p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-muted/40 border border-border/50 rounded-xl p-4 text-xs text-muted-foreground space-y-2">
                  <p className="font-semibold text-foreground text-xs">How it works</p>
                  <p>🎙 Tap the mic — transcript appears <strong>live</strong> while the client speaks.</p>
                  <p>⏹ Tap to stop — AI answer appears <strong>immediately</strong>.</p>
                  <p>👁 <strong>Transparent</strong> pops Hika into a floating overlay window.</p>
                </div>
                {micError && (
                  <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <MicOff size={13} className="flex-shrink-0" />{micError}
                  </div>
                )}
                <button onClick={startSession} disabled={createSession.isPending || !sessionTitle.trim()}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))" }}>
                  <Monitor size={15} />
                  {createSession.isPending ? "Starting…" : "Start Session"}
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
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0 bg-card/40">
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
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAnalyzing && (
            <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
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

      {/* Two-panel split */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* LEFT: Transcript 40% */}
        <div className="w-[40%] flex-shrink-0 flex flex-col border-r border-border overflow-hidden" style={{ background: "hsl(var(--sidebar))" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Radio size={12} className="text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transcript</h2>
            </div>
            <div className="flex items-center gap-2">
              {micActive && (
                <span className="flex items-center gap-1.5 text-[10px] text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />Recording
                </span>
              )}
              {isTranscribing && !micActive && (
                <span className="flex items-center gap-1.5 text-[10px] text-primary animate-pulse">
                  <span className="w-1 h-1 rounded-full bg-primary" />Processing…
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
            {chunks.length === 0 && !liveTranscript && !isTranscribing ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Mic size={28} className="mb-3 opacity-15" />
                <p className="text-xs leading-relaxed opacity-60 max-w-36">Tap the mic below when the client speaks</p>
              </div>
            ) : (
              <>
                {chunks.map((chunk) => (
                  <div key={chunk.id} className="flex gap-3 py-1 group">
                    <span className="text-[11px] font-semibold text-primary/70 w-14 flex-shrink-0 pt-0.5 text-right">Client</span>
                    <span className="text-sm text-foreground/85 leading-relaxed flex-1">{chunk.text}</span>
                  </div>
                ))}
                {(liveTranscript || (micActive && !liveTranscript)) && (
                  <div className="flex gap-3 py-1">
                    <span className="text-[11px] font-semibold text-red-400/80 w-14 flex-shrink-0 pt-0.5 text-right flex items-start justify-end gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mt-1 flex-shrink-0" />
                      Client
                    </span>
                    <span className="text-sm text-foreground/60 leading-relaxed flex-1 italic">
                      {liveTranscript ?? ""}
                      <span className="inline-block w-0.5 h-3.5 bg-red-400/70 ml-0.5 animate-pulse align-middle" />
                    </span>
                  </div>
                )}
                {isTranscribing && !micActive && (
                  <div className="flex gap-3 py-1">
                    <span className="text-[11px] font-semibold text-muted-foreground/40 w-14 flex-shrink-0 pt-0.5 text-right">Client</span>
                    <span className="text-sm text-muted-foreground/30 italic">
                      <span className="animate-pulse">● </span>
                      <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>● </span>
                      <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
                    </span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>
        </div>

        {/* RIGHT: AI 60% */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Assistant</h2>
            </div>
            {insights.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {insights.length} insight{insights.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Latest answer — fills the panel */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            <AnimatePresence mode="wait">
              {isAnalyzing && (
                <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "hsl(238 84% 67% / 0.12)" }}>
                    <Zap size={14} className="text-primary animate-pulse" />
                  </div>
                  <span>Analyzing…</span>
                </motion.div>
              )}
              {insights.length === 0 && !isAnalyzing && (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full text-center text-muted-foreground pb-8">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "hsl(238 84% 67% / 0.08)" }}>
                    <Zap size={22} className="text-primary/40" />
                  </div>
                  <p className="text-sm font-medium mb-1 text-foreground/50">AI answers appear here</p>
                  <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-44">
                    Stop recording and the answer arrives instantly
                  </p>
                </motion.div>
              )}
              {insights.length > 0 && !isAnalyzing && (
                <InsightCard key={insights[0].id} insight={insights[0]} />
              )}
            </AnimatePresence>
          </div>

          {/* History strip — previous questions, compact */}
          {insights.length > 1 && (
            <div className="flex-shrink-0 border-t border-border/50 px-4 py-2 space-y-0.5 max-h-32 overflow-y-auto" style={{ background: "hsl(var(--muted)/0.2)" }}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Previous</p>
              {insights.slice(1).map((ins) => (
                <div key={ins.id} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] text-muted-foreground/50 font-mono flex-shrink-0">
                    {ins.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 truncate">{ins.question}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Full-width bottom bar ── */}
      <div className="flex-shrink-0 border-t border-border bg-card/30 px-6 py-4">
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

          {/* Text input */}
          <div className="flex-1 flex gap-2">
            <input value={manualQ} onChange={(e) => setManualQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && manualQ.trim()) {
                  e.preventDefault(); const q = manualQ; setManualQ(""); runAnalysis({ question: q });
                }
              }}
              placeholder="Or type a question and ask Hika…"
              className="flex-1 bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={() => { if (!manualQ.trim()) return; const q = manualQ; setManualQ(""); runAnalysis({ question: q }); }}
              disabled={!manualQ.trim() || isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))" }}>
              <Send size={13} />Ask
            </button>
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
          onClose={() => { try { pipWin.close(); } catch {} setPipWin(null); setShowOverlay(false); }}
        />,
        pipWin.document.body
      )}

      {/* ── Fallback: in-page overlay when PiP not available (e.g. Replit preview) ── */}
      {showOverlay && !pipWin && (
        <>
          <div className="fixed inset-0 z-[9998] bg-[#07070f]" />
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
          />
        </>
      )}
    </div>
  );
}
