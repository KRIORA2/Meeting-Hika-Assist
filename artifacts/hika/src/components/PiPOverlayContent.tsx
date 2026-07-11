import { Mic, MicOff, Zap, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";

export type OverlayInsight = {
  question: string;
  answer: string;
  suggestions: string[];
  confidence: string;
  timestamp: string;
};

type Props = {
  insight: OverlayInsight | null;
  isAnalyzing: boolean;
  micActive: boolean;
  transcript: string;
  collapsed: boolean;
  onToggleMic: () => void;
  onCollapse: () => void;
  onClose: () => void;
};

const colors = {
  bg: "#07070f",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.07)",
  primary: "#818cf8",
  primaryGlow: "rgba(129,140,248,0.15)",
  text: "#e2e8f0",
  muted: "#64748b",
  faint: "#1e1e2e",
};

export default function PiPOverlayContent({
  insight, isAnalyzing, micActive, transcript, collapsed, onToggleMic, onCollapse, onClose,
}: Props) {
  const confColor =
    insight?.confidence === "high" ? "#4ade80"
    : insight?.confidence === "medium" ? "#facc15"
    : colors.muted;

  return (
    <div
      style={{
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: colors.bg,
        color: colors.text,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: `1px solid ${colors.border}`,
          background: "rgba(255,255,255,0.02)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        {/* Logo + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 10px rgba(99,102,241,0.4)",
              flexShrink: 0,
            }}
          >
            <Zap size={12} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>Hika</span>
          {isAnalyzing && (
            <span style={{ fontSize: 10, color: colors.primary, display: "flex", alignItems: "center", gap: 3 }}>
              <Sparkles size={9} />
              thinking…
            </span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={onToggleMic}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              border: `1px solid ${micActive ? "rgba(129,140,248,0.3)" : colors.border}`,
              background: micActive ? colors.primaryGlow : "transparent",
              color: micActive ? colors.primary : colors.muted,
              transition: "all 0.15s",
            }}
          >
            {micActive ? (
              <>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: colors.primary, animation: "pip-pulse 1.5s infinite",
                  display: "inline-block",
                }} />
                <Mic size={10} />
                Listening
              </>
            ) : (
              <><MicOff size={10} /> Mic Off</>
            )}
          </button>

          <button onClick={onCollapse} style={iconBtnStyle}>
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          <button onClick={onClose} style={iconBtnStyle}>
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "12px 14px", gap: 10 }}>
          {isAnalyzing ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, color: colors.muted }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: colors.primaryGlow,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Sparkles size={13} color={colors.primary} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: colors.text, margin: "0 0 2px", fontWeight: 500 }}>Analyzing…</p>
                <p style={{ fontSize: 10, color: colors.muted, margin: 0 }}>Processing meeting context</p>
              </div>
            </div>
          ) : insight ? (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Question */}
              <p style={{
                fontSize: 10, fontFamily: "monospace", color: colors.muted,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
              }}>
                {insight.question}
              </p>

              {/* Answer */}
              <div style={{
                flex: 1, overflow: "hidden",
                background: colors.primaryGlow,
                border: `1px solid rgba(129,140,248,0.15)`,
                borderRadius: 10, padding: "10px 12px",
              }}>
                <p style={{
                  fontSize: 13, lineHeight: 1.6, color: colors.text, margin: 0,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: "vertical",
                }}>
                  {insight.answer}
                </p>
              </div>

              {/* Suggestions */}
              {insight.suggestions.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <p style={{
                    fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em",
                    color: colors.muted, fontWeight: 700, margin: "0 0 6px",
                  }}>
                    Say this
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {insight.suggestions.slice(0, 2).map((s, i) => (
                      <li key={i} style={{
                        display: "flex", gap: 6, fontSize: 11, lineHeight: 1.45,
                        color: "#cbd5e1", marginBottom: 4,
                      }}>
                        <span style={{ color: colors.primary, fontFamily: "monospace", fontSize: 10, flexShrink: 0, marginTop: 1 }}>
                          {i + 1}.
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 4,
                  border: `1px solid ${confColor}30`,
                  color: confColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  {insight.confidence}
                </span>
                <span style={{ fontSize: 9, color: colors.faint, marginLeft: "auto", fontFamily: "monospace" }}>
                  {insight.timestamp}
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              textAlign: "center", color: colors.muted, gap: 8,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Zap size={16} color="rgba(255,255,255,0.08)" />
              </div>
              <p style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                {micActive ? "Listening for questions…" : "Enable mic to start"}
              </p>
            </div>
          )}

          {/* Transcript snippet */}
          {transcript && (
            <div style={{
              borderTop: `1px solid ${colors.border}`, paddingTop: 8, flexShrink: 0,
            }}>
              <p style={{
                fontSize: 9, fontFamily: "monospace", color: "#334155", margin: 0,
                lineHeight: 1.4,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {transcript.slice(-180)}
              </p>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pip-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  padding: 5,
  borderRadius: 5,
  cursor: "pointer",
  border: "none",
  background: "transparent",
  color: "#475569",
  display: "flex",
  alignItems: "center",
  transition: "color 0.15s",
};
