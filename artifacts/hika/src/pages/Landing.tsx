import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { signOut, subscribeAuth } from "@/lib/auth";
import {
  Zap, Mic, Brain, EyeOff, History, Download, ChevronRight,
  CheckCircle, Play, Monitor, Layers, ArrowRight, Star,
  Volume2, FileText, Clock, Shield, Sparkles, X,
} from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function Landing() {
  const [, navigate] = useLocation();
  const [sessionEmail, setSessionEmail] = useState<string>("");
  const isSignedIn = Boolean(sessionEmail);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installBanner, setInstallBanner] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    return subscribeAuth((session) => {
      setSessionEmail(session?.email || "");
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActiveStep((s) => (s + 1) % 3), 3000);
    return () => clearInterval(t);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
    setInstallBanner(false);
  };

  const STEPS = [
    {
      n: "01", icon: Monitor, title: "Start a Session",
      desc: "Name your meeting and pick your platform — Zoom, Teams, Meet, or other.",
      color: "#6366f1",
    },
    {
      n: "02", icon: Mic, title: "Tap Record & Speak",
      desc: "Press the mic button when the client speaks. Your transcript builds live, word by word.",
      color: "#8b5cf6",
    },
    {
      n: "03", icon: Brain, title: "Get Instant AI Answers",
      desc: "Stop recording and Hikanest instantly surfaces answers, suggestions, and key points.",
      color: "#a78bfa",
    },
  ];

  const FEATURES = [
    { icon: Mic, title: "Live Transcription", desc: "Real-time speech-to-text as you record. Every word captured with high accuracy.", color: "#6366f1" },
    { icon: Brain, title: "Instant AI Answers", desc: "AI analyzes what was said and surfaces answers, context, and action items in seconds.", color: "#8b5cf6" },
    { icon: EyeOff, title: "Transparent Overlay", desc: "Floating overlay mode — invisible to screen share, always on top while you meet.", color: "#a78bfa" },
    { icon: History, title: "Session History", desc: "Every meeting saved with full transcript and AI insight timeline for future reference.", color: "#7c3aed" },
    { icon: FileText, title: "Ask Anything", desc: "Type a custom question anytime — Hikanest uses the full conversation context to answer.", color: "#6366f1" },
    { icon: Shield, title: "Privacy First", desc: "Audio is transcribed for the answer and not kept as a recording. Saved session notes stay in your account.", color: "#8b5cf6" },
  ];

  const PLATFORMS = [
    { icon: "🟦", name: "Microsoft Teams" },
    { icon: "🔵", name: "Zoom" },
    { icon: "🟢", name: "Google Meet" },
    { icon: "⚪", name: "Any Platform" },
  ];

  const DOCS = [
    {
      title: "Starting Your First Session",
      steps: [
        'Click "Open App" or "Launch Session" below',
        'Click "Start New Session" in the app',
        'Enter a session name (e.g. "Client Demo")',
        "Choose your meeting platform",
        'Click "Start Session"',
      ],
    },
    {
      title: "Recording & Getting AI Answers",
      steps: [
        "When someone speaks, tap the purple mic button",
        "Watch the live transcript build in real time (left panel)",
        "Tap the red stop button when done speaking",
        "Hikanest instantly analyzes and shows AI answers (right panel)",
        "Repeat for each segment of your meeting",
      ],
    },
    {
      title: "Using Transparent Overlay",
      steps: [
        "Start a session first",
        'Click the "Transparent" button in the top bar',
        "A floating panel appears — drag it anywhere on screen",
        "Expand it with the chevron to see full transcript + AI",
        "It stays on top while you're in your meeting app",
      ],
    },
    {
      title: "Tips & Tricks",
      steps: [
        'Type a custom question in the "Ask Hikanest" box anytime',
        "Past sessions are saved under History in the sidebar",
        "Use the overlay in full-screen meeting mode for best results",
        "Click End to save the session and stop all recording",
        "Install the app for a native desktop experience",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#07070f] text-white font-['Inter',sans-serif] overflow-x-hidden">

      {/* ── Install banner ── */}
      {isSignedIn && installBanner && !installed && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-5 py-3"
          style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)", boxShadow: "0 2px 20px rgba(99,102,241,0.4)" }}>
          <div className="flex items-center gap-3">
            <Download size={16} className="text-white flex-shrink-0" />
            <p className="text-sm font-medium">Install Hikanest for a native desktop experience</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleInstall}
              className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-white text-indigo-600 hover:bg-indigo-50 transition-colors">
              Install Now
            </button>
            <button onClick={() => setInstallBanner(false)} className="text-white/60 hover:text-white p-1">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/[0.06]"
        style={{ paddingTop: isSignedIn && installBanner && !installed ? "4.5rem" : undefined }}>
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon.png" alt="Hikanest" className="w-8 h-8 rounded-xl object-cover shadow-[0_0_16px_rgba(99,102,241,0.5)]" />
          <span className="text-base font-bold tracking-tight">Hikanest</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          {isSignedIn && <button onClick={() => navigate("/install")} className="hover:text-white transition-colors">Desktop App</button>}
          <button onClick={() => navigate("/pricing")} className="hover:text-white transition-colors">Pricing</button>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#docs" className="hover:text-white transition-colors">Docs</a>
        </div>
        <div className="flex items-center gap-3">
          {sessionEmail ? (
            <>
              <button
                onClick={() => navigate("/dashboard")}
                className="hidden sm:block text-sm px-4 py-2 rounded-xl border border-white/15 bg-white/[0.05] text-white/75 hover:text-white hover:bg-white/[0.09] transition-all"
                title={sessionEmail}
              >
                Dashboard
              </button>
              <button
                onClick={() => {
                  void signOut();
                  setSessionEmail("");
                }}
                className="text-sm font-semibold px-4 py-2 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] transition-all"
              >
                Logout
              </button>
              <button onClick={() => navigate("/session")}
                className="flex items-center gap-2.5 text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}>
                Launch App <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate("/login")}
                className="text-sm font-semibold px-3 py-2 text-white/70 hover:text-white transition-colors">
                Sign in
              </button>
              <button onClick={() => navigate("/login?mode=signup")}
                className="text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}>
                Create account
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 overflow-hidden">
        {/* Glow blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20 blur-[100px]"
          style={{ background: "radial-gradient(ellipse, #6366f1 0%, transparent 70%)" }} />
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full opacity-10 blur-[80px]"
          style={{ background: "#8b5cf6" }} />

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold tracking-wide mb-8">
            <Sparkles size={11} />AI-Powered · Real-time · Private
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Your AI Meeting Assistant
            <br />
            <span style={{
              background: "linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #a78bfa 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              for every meeting
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto mb-10">
            Hikanest listens while you meet — building a live transcript and surfacing AI answers
            the moment you need them, inside Zoom, Teams, and Google Meet.
          </p>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
            {PLATFORMS.map((p) => (
              <span key={p.name} className="flex items-center gap-1.5 text-sm text-white/40 border border-white/10 rounded-full px-3 py-1 bg-white/[0.03]">
                <span>{p.icon}</span>{p.name}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => navigate(isSignedIn ? "/session" : "/login?next=%2Fsession")}
              className="flex items-center gap-2.5 text-base font-bold px-8 py-4 rounded-2xl transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shadow-2xl"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 8px 32px rgba(99,102,241,0.45)" }}>
              <Play size={16} fill="white" />{isSignedIn ? "Open App" : "Sign in to start"}
            </button>
            {isSignedIn && installPrompt && !installed ? (
              <button onClick={handleInstall}
                className="flex items-center gap-2.5 text-base font-semibold px-8 py-4 rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                <Download size={16} />Install on Desktop
              </button>
            ) : isSignedIn && installed ? (
              <span className="flex items-center gap-2 text-sm text-emerald-400 border border-emerald-500/25 bg-emerald-500/8 px-6 py-3 rounded-2xl">
                <CheckCircle size={15} />App Installed!
              </span>
            ) : isSignedIn ? (
              <button onClick={() => navigate("/install")}
                className="flex items-center gap-2.5 text-base font-semibold px-8 py-4 rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                <Download size={16} />Install Desktop App
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Live preview mockup ── */}
      <section className="px-6 md:px-16 pb-24">
        <div className="max-w-5xl mx-auto rounded-2xl border border-white/[0.08] overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)" }}>
          {/* Mock top bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.07] bg-white/[0.03]">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-amber-500/60" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/60" />
            </div>
            <div className="flex-1 text-center text-xs text-white/25 font-mono">hikanest.ai/session</div>
          </div>
          {/* Mock session bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.07] bg-white/[0.015]">
            <span className="text-lg">🟦</span>
            <div>
              <p className="text-sm font-semibold">Client Demo — Q3 Review</p>
              <p className="text-[11px] text-white/30 font-mono">0:12:43 · Live</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <Zap size={9} />Thinking…
              </span>
              <span className="text-[11px] text-white/40 border border-white/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <EyeOff size={9} />Transparent
              </span>
            </div>
          </div>
          {/* Mock panels */}
          <div className="flex min-h-0" style={{ height: 260 }}>
            <div className="w-[40%] flex-shrink-0 border-r border-white/[0.07] p-4 space-y-2 overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3 flex items-center gap-1.5">
                <Volume2 size={9} />Transcript
              </p>
              {[
                { q: false, t: "So we've seen 23% growth in the enterprise segment this quarter…" },
                { q: true, t: "What do you think is driving that growth specifically?" },
                { q: false, t: "Mainly the new integrations with Teams and the onboarding improvements." },
              ].map((c, i) => (
                <div key={i} className={`text-[11px] leading-relaxed px-2.5 py-2 rounded-lg ${
                  c.q ? "bg-indigo-500/10 border border-indigo-500/15 text-indigo-200"
                      : "bg-white/[0.03] border border-white/[0.06] text-white/50"}`}>
                  {c.t}
                </div>
              ))}
              <div className="text-[11px] leading-relaxed px-2.5 py-2 rounded-lg bg-red-500/8 border border-red-500/20 text-red-300 animate-pulse">
                <span className="text-[9px] font-bold text-red-500 block mb-0.5">● LIVE</span>
                And the customer success team has been really…
              </div>
            </div>
            <div className="flex-1 p-4 space-y-3 overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3 flex items-center gap-1.5">
                <Brain size={9} />AI Answers
              </p>
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/6 p-3">
                <p className="text-[10px] text-white/30 font-mono mb-1.5">What is driving the enterprise growth?</p>
                <p className="text-[12px] leading-relaxed text-white/80">
                  The 23% enterprise growth is driven by two key factors: new platform integrations (Teams, Meet) that reduce friction, and improved onboarding that cuts time-to-value by ~40%.
                </p>
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06]">
                  <p className="text-[9px] uppercase tracking-widest text-white/25 mb-1.5">Say this</p>
                  <p className="text-[11px] text-white/50"><span className="text-indigo-400 font-mono mr-1">1.</span>Can you share the breakdown between integrations vs. onboarding impact?</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase text-emerald-400 border border-emerald-400/20 bg-emerald-400/5 px-2 py-0.5 rounded">high confidence</span>
                <span className="text-[9px] text-white/20 font-mono ml-auto">12:41 PM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="px-6 md:px-16 py-20 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">Simple · Fast · Powerful</p>
            <h2 className="text-4xl font-extrabold tracking-tight">How Hikanest works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div key={i} onClick={() => setActiveStep(i)}
                className="relative rounded-2xl border p-6 cursor-pointer transition-all"
                style={{
                  borderColor: activeStep === i ? `${step.color}40` : "rgba(255,255,255,0.07)",
                  background: activeStep === i ? `${step.color}0d` : "rgba(255,255,255,0.02)",
                  boxShadow: activeStep === i ? `0 0 32px ${step.color}20` : "none",
                }}>
                <div className="text-4xl font-black tracking-tighter mb-4" style={{ color: `${step.color}40` }}>{step.n}</div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${step.color}20`, border: `1px solid ${step.color}30` }}>
                  <step.icon size={18} style={{ color: step.color }} />
                </div>
                <h3 className="font-bold text-base mb-2">{step.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="px-6 md:px-16 py-20 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">Built for real meetings</p>
            <h2 className="text-4xl font-extrabold tracking-tight">Everything you need</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] p-5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${f.color}18`, border: `1px solid ${f.color}25` }}>
                  <f.icon size={18} style={{ color: f.color }} />
                </div>
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Documentation ── */}
      <section id="docs" className="px-6 md:px-16 py-20 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">User Guide</p>
            <h2 className="text-4xl font-extrabold tracking-tight">How to use Hikanest</h2>
            <p className="text-white/40 mt-3 text-sm">Everything you need to get started and get the most out of every meeting</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {DOCS.map((doc, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] p-6 bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-xs font-black text-indigo-400">
                    {i + 1}
                  </div>
                  <h3 className="font-semibold text-sm">{doc.title}</h3>
                </div>
                <ul className="space-y-3">
                  {doc.steps.map((step, si) => (
                    <li key={si} className="flex items-start gap-3 text-sm text-white/50">
                      <CheckCircle size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Install section ── */}
      {isSignedIn && <section id="install" className="px-6 md:px-16 py-20 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-3xl border border-indigo-500/20 p-10 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)" }}>
            <div className="absolute inset-0 opacity-30 blur-[60px]"
              style={{ background: "radial-gradient(ellipse at 50% 0%, #6366f1 0%, transparent 70%)" }} />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 0 32px rgba(99,102,241,0.5)" }}>
                <Download size={28} className="text-white" />
              </div>
              <h2 className="text-3xl font-extrabold mb-3">Install Hikanest on your laptop</h2>
              <p className="text-white/50 mb-8 text-sm leading-relaxed max-w-lg mx-auto">
                Install Hikanest as a desktop app — no download required. Works like a native app,
                opens in its own window, and keeps your meetings organized.
              </p>

              <div className="grid sm:grid-cols-3 gap-4 mb-8 text-left">
                {[
                  { icon: "🌐", browser: "Chrome / Edge", steps: "Open Hikanest → Click ⊕ in address bar → Install" },
                  { icon: "🦊", browser: "Firefox", steps: "Not supported yet. Use Chrome for install." },
                  { icon: "🍎", browser: "Safari (Mac)", steps: "File menu → Add to Dock → Done" },
                ].map((b) => (
                  <div key={b.browser} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-lg mb-2">{b.icon}</p>
                    <p className="text-xs font-semibold mb-1.5">{b.browser}</p>
                    <p className="text-[11px] text-white/35 leading-snug">{b.steps}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {installPrompt && !installed ? (
                  <button onClick={handleInstall}
                    className="flex items-center gap-2.5 text-base font-bold px-8 py-4 rounded-2xl transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 8px 32px rgba(99,102,241,0.4)" }}>
                    <Download size={16} />Install Hikanest Now
                  </button>
                ) : installed ? (
                  <span className="flex items-center gap-2 text-sm text-emerald-400 border border-emerald-500/25 bg-emerald-500/10 px-6 py-3 rounded-2xl font-semibold">
                    <CheckCircle size={15} />Hikanest is installed!
                  </span>
                ) : (
                  <p className="text-sm text-white/30">Open this page in Chrome or Edge to see the install button</p>
                )}
                <button onClick={() => navigate("/session")}
                  className="flex items-center gap-2 text-sm font-semibold px-6 py-3.5 rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                  Use in Browser <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>}

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] px-6 md:px-16 py-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/icons/icon.png" alt="Hikanest" className="w-7 h-7 rounded-lg object-cover" />
            <span className="text-sm font-bold">Hikanest</span>
            <span className="text-white/20 text-xs">— AI Meeting Assistant</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <a href="#features" className="hover:text-white/60 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white/60 transition-colors">How it works</a>
            <a href="#docs" className="hover:text-white/60 transition-colors">Docs</a>
            <button onClick={() => navigate("/privacy")} className="hover:text-white/60 transition-colors">Privacy</button>
            {isSignedIn && <a href="#install" className="hover:text-white/60 transition-colors">Install</a>}
          </div>
          <button onClick={() => navigate(isSignedIn ? "/session" : "/login?next=%2Fsession")}
            className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            {isSignedIn ? "Launch App →" : "Sign in →"}
          </button>
        </div>
      </footer>
    </div>
  );
}
