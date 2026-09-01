import { useLocation } from "wouter";
import { ArrowLeft, Download, Monitor, Globe, Shield, Zap } from "lucide-react";

export default function Install() {
  const [, navigate] = useLocation();

  const downloads = {
    Windows: {
      url: "/downloads/windows/Hikanest-Setup.exe",
      fileName: "Hikanest-Setup.exe",
      available: true,
    },
    macOS: {
      url: "/downloads/macos/Hika.dmg",
      fileName: "Hikanest.dmg",
      available: false,
    },
    Linux: {
      url: "/downloads/linux/Hika.AppImage",
      fileName: "Hikanest.AppImage",
      available: false,
    },
  } as const;

  function confirmAndDownload(platform: keyof typeof downloads) {
    const item = downloads[platform];
    if (!item.available) {
      window.alert(`${platform} installer is not available in this local build yet.`);
      return;
    }

    const yes = window.confirm(`Download ${platform} installer now?`);
    if (!yes) return;

    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl rounded-[32px] border border-white/10 bg-[#0b0c18]/95 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <ArrowLeft size={16} /> Back to home
          </button>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            Sign in
          </button>
        </div>

        <div className="p-8 sm:p-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)]">
              <Download size={28} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300 mb-2">Desktop app</p>
              <h1 className="text-4xl font-extrabold tracking-tight">Download and install Hikanest</h1>
              <p className="mt-3 text-sm text-white/60 max-w-2xl">
                The desktop app gives you a native window, overlay support, and secure audio capture for meetings.
                Choose your platform below and follow the installer instructions.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: <Monitor size={20} className="text-[#6366f1]" />, title: "Windows",
                description: "Download the official Windows installer (.exe) and install by double-clicking.",
                button: "Download Windows Installer",
              },
              {
                icon: <Globe size={20} className="text-[#8b5cf6]" />, title: "macOS",
                description: "Download the DMG and drag Hikanest into your Applications folder.",
                button: "Download .dmg",
              },
              {
                icon: <Shield size={20} className="text-[#a78bfa]" />, title: "Linux",
                description: "Download the AppImage, make it executable, and launch it.",
                button: "Download AppImage",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
                <div className="inline-flex items-center justify-center rounded-3xl bg-white/5 w-12 h-12">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{item.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => confirmAndDownload(item.title as keyof typeof downloads)}
                  className="inline-flex items-center justify-center w-full rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  {item.button}
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold mb-4">Install instructions</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-sky-300">Windows</p>
                <ol className="list-decimal list-inside text-sm text-white/60 space-y-2">
                  <li>Download <code>Hikanest-Setup.exe</code>.</li>
                  <li>Double-click the installer file.</li>
                  <li>If Windows asks, confirm and continue installation.</li>
                  <li>Launch Hikanest from Start Menu or desktop shortcut.</li>
                </ol>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-sky-300">macOS</p>
                <ol className="list-decimal list-inside text-sm text-white/60 space-y-2">
                  <li>Download the DMG file.</li>
                  <li>Open it and drag Hikanest to Applications.</li>
                  <li>Launch Hikanest from Applications.</li>
                  <li>Allow microphone permissions if requested.</li>
                </ol>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-sky-300">Linux</p>
                <ol className="list-decimal list-inside text-sm text-white/60 space-y-2">
                  <li>Download the AppImage.</li>
                  <li>Run <code>chmod +x Hikanest-*.AppImage</code>.</li>
                  <li>Launch the AppImage file.</li>
                  <li>Grant execute permission if needed.</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            <p className="font-medium text-white mb-3">Need developer build instead?</p>
            <p className="leading-relaxed">
              The desktop app is built from the repository under <code>artifacts/hika-desktop</code>. If you want to run locally, clone the repo and follow the desktop README.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
