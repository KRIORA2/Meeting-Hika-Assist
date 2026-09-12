import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Monitor, Volume2, Sliders, Shield, Keyboard, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredSessionToken } from "@/lib/auth";

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/10">
        <Icon size={14} className="text-[#8b5cf6]" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="divide-y divide-white/10">{children}</div>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "relative w-9 h-5 rounded-full transition-colors",
        value ? "bg-primary" : "bg-muted"
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
          value ? "left-4.5" : "left-0.5"
        )}
      />
    </button>
  );
}

function Select({ value, options, onChange }: { value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function Settings() {
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [stealthMode, setStealthMode] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [audioDevice, setAudioDevice] = useState("default");
  const [language, setLanguage] = useState("en");
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return "gpt-4.1";
    return window.localStorage.getItem("hika-ai-model") || "gpt-4.1";
  });
  const [overlayOpacity, setOverlayOpacity] = useState(85);
  const [chunkSize, setChunkSize] = useState(8);
  const [desktopStatus, setDesktopStatus] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hika-ai-model", model);
    }
  }, [model]);

  async function openDesktopApp() {
    const token = getStoredSessionToken();
    if (!token) {
      setDesktopStatus("Please sign in again before opening the desktop app.");
      return;
    }

    setDesktopStatus("Opening Hikanest desktop...");
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiUrl}/api/auth/desktop/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as { handoffUrl?: string; error?: string };
      if (!response.ok || !result.handoffUrl) throw new Error(result.error || "Desktop sign-in is unavailable.");
      window.location.assign(result.handoffUrl);
      setDesktopStatus("Desktop sign-in link opened.");
    } catch (error) {
      setDesktopStatus(error instanceof Error ? error.message : "Desktop sign-in is unavailable.");
    }
  }

  const [updateState, setUpdateState] = useState<{
    state: "checking" | "update-available" | "downloading" | "update-downloaded" | "up-to-date" | "error" | "idle";
    currentVersion?: string;
    version?: string;
    percent?: number;
    message?: string;
  }>({ state: "idle" });

  useEffect(() => {
    if (typeof window !== "undefined" && window.hikaElectron) {
      window.hikaElectron.getAppVersion().then(v => setUpdateState(s => ({ ...s, currentVersion: v })));
      window.hikaElectron.onUpdateState((payload) => {
        setUpdateState(payload);
      });
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6c63ff]/30 bg-[#6c63ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#c8b9ff] mb-3">
            <Sliders size={12} /> Control center
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Settings</h1>
          <p className="text-sm text-white/55 mt-1">Fine-tune Hikanest to feel instant, private, and effortless.</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Section title="Microphone & Audio" icon={Mic}>
            <Row
              label="Input Device"
              description="Select which microphone Hikanest listens to"
            >
              <Select
                value={audioDevice}
                options={[
                  { label: "System Default", value: "default" },
                  { label: "Built-in Microphone", value: "built-in" },
                ]}
                onChange={setAudioDevice}
              />
            </Row>
            <Row
              label="Language"
              description="Language spoken in your meetings"
            >
              <Select
                value={language}
                options={[
                  { label: "English (US)", value: "en" },
                  { label: "English (UK)", value: "en-gb" },
                  { label: "Spanish", value: "es" },
                  { label: "French", value: "fr" },
                  { label: "German", value: "de" },
                ]}
                onChange={setLanguage}
              />
            </Row>
            <Row
              label="Recording chunk size"
              description={`Audio is sent every ${chunkSize} seconds for transcription`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={4}
                  max={15}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground w-8">{chunkSize}s</span>
              </div>
            </Row>
          </Section>

          <Section title="AI Intelligence" icon={Sliders}>
            <Row label="AI Model" description="Model used for analysis">
              <Select
                value={model}
                options={[
                  { label: "GPT-4.1 (most accurate)", value: "gpt-4.1" },
                  { label: "GPT-4o (balanced)", value: "gpt-4o" },
                  { label: "GPT-4o mini (fast)", value: "gpt-4o-mini" },
                ]}
                onChange={setModel}
              />
            </Row>
            <Row
              label="Auto-analyze questions"
              description="Automatically detect and answer questions without pressing a button"
            >
              <Toggle value={autoAnalyze} onChange={setAutoAnalyze} />
            </Row>
          </Section>

          <Section title="Overlay & Display" icon={Monitor}>
            <Row label="Desktop app" description="Open the installed app without signing in again">
              <button onClick={openDesktopApp} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                Open desktop app
              </button>
            </Row>
            {desktopStatus && <p className="px-5 pb-3 text-xs text-muted-foreground">{desktopStatus}</p>}
            <Row label="Private Stealth Mode" description="Use Document Picture-in-Picture so the overlay is invisible to screen share">
              <Toggle value={stealthMode} onChange={setStealthMode} />
            </Row>
            <Row
              label="Overlay opacity"
              description={`${overlayOpacity}% — higher is more visible`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground w-8">{overlayOpacity}%</span>
              </div>
            </Row>
          </Section>

          <Section title="Privacy & Security" icon={Shield}>
            <Row
              label="Notifications"
              description="Show desktop notifications when a question is detected"
            >
              <Toggle value={notifications} onChange={setNotifications} />
            </Row>
            <Row label="Data storage" description="Where session data is stored">
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded">Local DB only</span>
            </Row>
          </Section>

          <Section title="Keyboard Shortcuts" icon={Keyboard}>
            <Row label="Toggle mic" description="Start or stop recording">
              <kbd className="text-xs bg-muted border border-border rounded px-2 py-1 font-mono">⌘ + M</kbd>
            </Row>
            <Row label="Ask Hikanest" description="Manually trigger AI analysis">
              <kbd className="text-xs bg-muted border border-border rounded px-2 py-1 font-mono">⌘ + ↵</kbd>
            </Row>
            <Row label="Toggle stealth overlay" description="Show or hide the floating overlay">
              <kbd className="text-xs bg-muted border border-border rounded px-2 py-1 font-mono">⌘ + ⇧ + H</kbd>
            </Row>
          </Section>

          {typeof window !== "undefined" && window.hikaElectron && (
            <Section title="Updates & About" icon={Monitor}>
              <Row label="App Version" description="Current installed version">
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-medium text-white">
                    {updateState.currentVersion ? `v${updateState.currentVersion}` : "Checking..."}
                  </span>
                  
                  {updateState.state === "checking" && <span className="text-xs text-muted-foreground">Checking for updates...</span>}
                  {updateState.state === "up-to-date" && <span className="text-xs text-emerald-400">You're up to date!</span>}
                  {updateState.state === "downloading" && (
                    <span className="text-xs text-sky-400">Downloading... {Math.round(updateState.percent || 0)}%</span>
                  )}
                  {updateState.state === "error" && (
                    <span className="text-xs text-red-400">{updateState.message || "Update error"}</span>
                  )}

                  {updateState.state !== "checking" && updateState.state !== "downloading" && updateState.state !== "update-downloaded" && (
                    <button
                      onClick={() => {
                        window.hikaElectron.checkForUpdates().then((started) => {
                          if (!started) alert("Could not check for updates right now.");
                        });
                      }}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      Check for Updates
                    </button>
                  )}

                  {updateState.state === "update-downloaded" && (
                    <button
                      onClick={() => window.hikaElectron.installUpdate()}
                      className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded hover:bg-emerald-500/30 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
                    >
                      Install Update & Restart
                    </button>
                  )}
                </div>
              </Row>
            </Section>
          )}
        </motion.div>
      </div>
    </div>
  );
}
