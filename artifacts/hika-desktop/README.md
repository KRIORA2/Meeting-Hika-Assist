# Hika Desktop

AI Meeting Assistant — **completely invisible to screen capture**, even when sharing your entire screen.

## How the invisibility works

The app calls `BrowserWindow.setContentProtection(true)` — a single Electron API that maps to:
- **Windows**: `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` — OS-level exclusion
- **macOS**: `CGWindowSharingNone` — system-level capture exclusion

The OS itself hides the Hika window from every screen-recording tool, OBS, Teams share, Zoom share, even "Share entire screen". The user sees it on their physical display. Nobody else sees it.

## Prerequisites

- **Node.js 20+** and **pnpm** installed
- **Hika API server** running (`pnpm --filter @workspace/api-server run dev` — starts on port 5000)
- Windows 10+, macOS 12+, or Linux (Ubuntu 20.04+)

## Development

```bash
cd artifacts/hika-desktop

# Install deps
pnpm install

# Compile TypeScript + launch Electron
pnpm run dev
```

The overlay window opens. `setContentProtection(true)` takes effect immediately.  
Open DevTools are attached in dev mode so you can inspect the overlay renderer.

## Build distributable

### Windows (.exe installer)
```bash
pnpm run build:win
# → release/Hika-Setup-1.0.0.exe
```

### macOS (.dmg)
```bash
pnpm run build:mac
# → release/Hika-1.0.0.dmg
```

### Linux (AppImage)
```bash
pnpm run build:linux
# → release/Hika-1.0.0.AppImage
```

Cross-compilation notes:
- Windows builds can only be signed on Windows (or via CI with code-signing cert)
- macOS builds require macOS and an Apple Developer ID for notarization
- Use GitHub Actions (see `.github/workflows/build.yml`) for CI builds

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `HIKA_API_URL` | `http://localhost:5000` | URL of the Hika API server |

## Architecture

```
electron/
  main.ts           — Main process: creates windows, tray, IPC handlers
  preload-overlay.ts — Safe IPC bridge exposed to overlay renderer as window.hikaElectron

overlay/
  index.html        — Overlay UI shell
  overlay.css       — Dark theme styles (indigo/violet accent)
  overlay.js        — Session management, audio recording, API calls, rendering

assets/
  icon.ico / icon.icns / icon.png  — App icon (replace with your own)
```

## Features

- **🎤 Mic recording** — MediaRecorder API, 8-second rolling chunks sent to Whisper
- **⚡ Auto-analysis** — AI analyzes the last utterance when recording stops
- **💬 Manual ask** — Type any question, get an instant AI answer
- **📋 Code display** — SQL, Python, PySpark, Azure code shown inline (green on black)
- **📌 Always on top** — Floats above Teams, Zoom, Meet at `screen-saver` z-level
- **🖥 Screenshot context** — `desktopCapturer` takes a screenshot for AI visual context
- **🔲 System tray** — Right-click tray → Show/Hide/Quit; click tray to toggle
- **🚫 Screen-capture protected** — `setContentProtection(true)` — invisible to all capture

## Replacing the icon

Put your icon files in `assets/`:
- `icon.ico` — Windows (256×256 recommended)
- `icon.icns` — macOS (512×512 recommended)  
- `icon.png` — Linux (256×256)

Tools: https://www.img2ico.net (ICO), https://cloudconvert.com (ICNS)
