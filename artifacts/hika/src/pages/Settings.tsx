import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Monitor, Sliders, CreditCard } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { useLocation } from "wouter";

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
  const [, navigate] = useLocation();
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return "gpt-5.6-sol";
    const stored = window.localStorage.getItem("hika-ai-model");
    if (!stored || stored === "gpt-4o") return "gpt-5.6-sol";
    return stored;
  });
  const [desktopStatus, setDesktopStatus] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hika-ai-model", model);
    }
  }, [model]);

  async function openDesktopApp() {
    const token = await getAccessToken();
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

  const hikaElectron = typeof window !== "undefined" ? window.hikaElectron : undefined;

  useEffect(() => {
    if (typeof window !== "undefined" && hikaElectron) {
      hikaElectron.getAppVersion().then(v => setUpdateState(s => ({ ...s, currentVersion: v })));
      hikaElectron.onUpdateState((payload) => {
        setUpdateState(payload);
      });
    }
  }, [hikaElectron]);

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
          <Section title="AI Intelligence" icon={Sliders}>
            <Row label="AI Model" description="Model used for on-screen answers">
              <Select
                value={model}
                options={[
                  { label: "GPT-5.6 Sol (current answers)", value: "gpt-5.6-sol" },
                  { label: "GPT-4.1", value: "gpt-4.1" },
                  { label: "GPT-4o", value: "gpt-4o" },
                ]}
                onChange={setModel}
              />
            </Row>
          </Section>

          <Section title="Plan & credits" icon={CreditCard}>
            <Row label="Billing" description="Upgrade, see credits, or manage your plan on the website">
              <button onClick={() => navigate("/pricing")} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                Open pricing
              </button>
            </Row>
          </Section>

          <Section title="Overlay & Display" icon={Monitor}>
            <Row label="Desktop app" description="Open the installed app without signing in again">
              <button onClick={openDesktopApp} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                Open desktop app
              </button>
            </Row>
            {desktopStatus && <p className="px-5 pb-3 text-xs text-muted-foreground">{desktopStatus}</p>}
          </Section>

          {hikaElectron && (
            <Section title="Updates & About" icon={Monitor}>
              <Row label="App Version" description="Current installed version">
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-medium text-white">
                    {updateState.currentVersion ? `v${updateState.currentVersion}` : "Checking..."}
                  </span>
                  
                  {updateState.state === "checking" && <span className="text-xs text-muted-foreground">Checking for updates...</span>}
                  {updateState.state === "up-to-date" && <span className="text-xs text-emerald-400">You're up to date!</span>}
                  {updateState.state === "update-available" && (
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs text-amber-400">v{updateState.version} available!</span>
                      <button
                        onClick={() => hikaElectron.downloadUpdate()}
                        className="text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded hover:bg-sky-500/30 transition-colors"
                      >
                        Download Update
                      </button>
                    </div>
                  )}
                  {updateState.state === "downloading" && (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-sky-400">Downloading v{updateState.version}...</span>
                      <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round(updateState.percent || 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{Math.round(updateState.percent || 0)}%</span>
                    </div>
                  )}
                  {updateState.state === "error" && (
                    <span className="text-xs text-red-400">{updateState.message || "Update error"}</span>
                  )}

                  {(updateState.state === "idle" || updateState.state === "up-to-date" || updateState.state === "error") && (
                    <button
                      onClick={() => {
                        hikaElectron.checkForUpdates().then((started) => {
                          if (!started) alert("Could not check for updates right now.");
                        });
                      }}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      Check for Updates
                    </button>
                  )}

                  {updateState.state === "update-downloaded" && (
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs text-emerald-400">v{updateState.version} ready to install!</span>
                      <button
                        onClick={() => hikaElectron.installUpdate()}
                        className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded hover:bg-emerald-500/30 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
                      >
                        Install Update & Restart
                      </button>
                    </div>
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
