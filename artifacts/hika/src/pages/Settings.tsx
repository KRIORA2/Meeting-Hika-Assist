import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Monitor, Volume2, Sliders, Shield, Keyboard, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-card-border">
        <Icon size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-card-border">{children}</div>
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
  const [model, setModel] = useState("gpt-4o-mini");
  const [overlayOpacity, setOverlayOpacity] = useState(85);
  const [chunkSize, setChunkSize] = useState(8);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure Hika to match your workflow</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Section title="Microphone & Audio" icon={Mic}>
            <Row
              label="Input Device"
              description="Select which microphone Hika listens to"
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
                  { label: "GPT-4o mini (fast)", value: "gpt-4o-mini" },
                  { label: "GPT-4o (accurate)", value: "gpt-4o" },
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
            <Row label="Ask Hika" description="Manually trigger AI analysis">
              <kbd className="text-xs bg-muted border border-border rounded px-2 py-1 font-mono">⌘ + ↵</kbd>
            </Row>
            <Row label="Toggle stealth overlay" description="Show or hide the floating overlay">
              <kbd className="text-xs bg-muted border border-border rounded px-2 py-1 font-mono">⌘ + ⇧ + H</kbd>
            </Row>
          </Section>
        </motion.div>
      </div>
    </div>
  );
}
