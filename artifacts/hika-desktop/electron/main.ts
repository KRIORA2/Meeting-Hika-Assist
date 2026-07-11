import {
  app, BrowserWindow, Tray, Menu, ipcMain,
  nativeImage, screen, desktopCapturer, shell,
} from "electron";
import path from "path";
import fs from "fs";

const isDev = !app.isPackaged;

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Meeting apps to auto-detect (window title substrings)
const MEETING_APPS = [
  { match: "zoom",        label: "Zoom" },
  { match: "teams",       label: "Teams" },
  { match: "google meet", label: "Meet" },
  { match: "webex",       label: "Webex" },
  { match: "whereby",     label: "Whereby" },
  { match: "chime",       label: "Chime" },
];

// ── Overlay window ────────────────────────────────────────────────────────────
function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 620,
    height: 680,
    x: width - 640,
    y: height - 700,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-overlay.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // THE KEY CALL — WDA_EXCLUDEFROMCAPTURE on Windows, CGWindowSharingNone on
  // macOS. The OS hides this window from every screen-recording tool, OBS,
  // Teams share, Zoom share, even Win+PrintScreen. Physical display only.
  // ─────────────────────────────────────────────────────────────────────────
  overlayWindow.setContentProtection(true);
  overlayWindow.setAlwaysOnTop(true, "screen-saver", 1);

  const overlayHtml = isDev
    ? path.join(__dirname, "../../overlay/index.html")
    : path.join(process.resourcesPath, "overlay", "index.html");

  overlayWindow.loadFile(overlayHtml);

  if (isDev) {
    overlayWindow.webContents.openDevTools({ mode: "detach" });
  }

  overlayWindow.on("closed", () => { overlayWindow = null; });

  // Start meeting auto-detection after window is ready
  overlayWindow.webContents.once("did-finish-load", () => {
    startMeetingDetection();
  });
}

// ── Meeting auto-detection ────────────────────────────────────────────────────
let detectionInterval: ReturnType<typeof setInterval> | null = null;
let lastDetectedMeeting = "";

function startMeetingDetection() {
  if (detectionInterval) clearInterval(detectionInterval);

  detectionInterval = setInterval(async () => {
    if (!overlayWindow) return;
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 1, height: 1 }, // tiny — we only need titles
      });

      for (const src of sources) {
        const title = src.name.toLowerCase();
        for (const app of MEETING_APPS) {
          if (title.includes(app.match) && lastDetectedMeeting !== app.label) {
            lastDetectedMeeting = app.label;
            overlayWindow?.webContents.send("meeting-detected", app.label);
            break;
          }
        }
      }
    } catch {
      // desktopCapturer may fail without screen permission — ignore silently
    }
  }, 5000);
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(
    isDev
      ? path.join(__dirname, "../../assets")
      : path.join(process.resourcesPath, "assets"),
    process.platform === "win32" ? "icon.ico"
      : process.platform === "darwin" ? "icon.icns"
      : "icon.png",
  );

  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Hika — AI Meeting Assistant\nInvisible to screen capture");

  const buildMenu = () =>
    Menu.buildFromTemplate([
      {
        label: "Show Overlay",
        enabled: !(overlayWindow?.isVisible() ?? false),
        click: () => overlayWindow?.show(),
      },
      {
        label: "Hide Overlay",
        enabled: overlayWindow?.isVisible() ?? false,
        click: () => overlayWindow?.hide(),
      },
      { type: "separator" },
      {
        label: "Always on Top",
        type: "checkbox",
        checked: true,
        click: (item) => {
          const level = item.checked ? "screen-saver" : "normal";
          overlayWindow?.setAlwaysOnTop(item.checked, level as "screen-saver" | "normal", 1);
        },
      },
      { type: "separator" },
      {
        label: "Open Log Folder",
        click: () => shell.openPath(app.getPath("logs")),
      },
      { type: "separator" },
      { label: "Quit Hika", click: () => app.quit() },
    ]);

  tray.setContextMenu(buildMenu());
  tray.on("right-click", () => tray?.setContextMenu(buildMenu()));
  tray.on("click", () => {
    if (overlayWindow?.isVisible()) overlayWindow.hide();
    else overlayWindow?.show();
  });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Renderer asks for the API server base URL
ipcMain.handle("get-api-url", () => {
  return process.env.HIKA_API_URL ?? "http://localhost:5000";
});

// Toggle click-through mode
ipcMain.handle("set-clickthrough", (_e, enabled: boolean) => {
  overlayWindow?.setIgnoreMouseEvents(enabled, { forward: true });
});

// Resize from renderer drag handle
ipcMain.handle("set-size", (_e, width: number, height: number) => {
  overlayWindow?.setSize(Math.round(width), Math.round(height));
});

// Screen capture for AI context
ipcMain.handle("capture-screen", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const primary = sources[0];
    if (!primary) return null;
    return primary.thumbnail.toJPEG(80).toString("base64");
  } catch {
    return null;
  }
});

// Show / hide / pin
ipcMain.on("overlay-hide", () => overlayWindow?.hide());
ipcMain.on("overlay-pin",  () => {
  overlayWindow?.setAlwaysOnTop(true, "screen-saver", 1);
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createOverlay();
  createTray();

  app.on("activate", () => {
    if (!overlayWindow) createOverlay();
  });
});

app.on("window-all-closed", () => {
  // Intentionally not quitting — app lives in system tray
});

app.on("activate", () => {
  if (!overlayWindow) createOverlay();
});

app.on("quit", () => {
  if (detectionInterval) clearInterval(detectionInterval);
});
