import {
  app, BrowserWindow, Tray, Menu, ipcMain,
  nativeImage, screen, desktopCapturer, shell, safeStorage,
} from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import fs from "fs";

const isDev = !app.isPackaged;

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let buildTrayMenu: (() => Menu) | null = null;
let clickThroughEnabled = false;
let pendingDesktopAuthCode: string | null = null;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let updateSessionActive = false;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

type UpdateState = "checking" | "update-available" | "downloading" | "update-downloaded" | "up-to-date" | "error";

type UpdateStatePayload = {
  state: UpdateState;
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
};

function sendUpdateState(payload: Omit<UpdateStatePayload, "currentVersion">) {
  overlayWindow?.webContents.send("update-state", {
    ...payload,
    currentVersion: app.getVersion(),
  } satisfies UpdateStatePayload);
}

function configureAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const prereleaseIdentifier = app.getVersion().match(/^[^+]+-([0-9A-Za-z-]+)/)?.[1];
  if (prereleaseIdentifier) {
    autoUpdater.allowPrerelease = true;
    autoUpdater.channel = prereleaseIdentifier;
  }

  autoUpdater.on("checking-for-update", () => {
    sendUpdateState({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    updateCheckInFlight = false;
    sendUpdateState({ state: "update-available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    updateCheckInFlight = false;
    sendUpdateState({ state: "up-to-date" });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendUpdateState({ state: "downloading", percent: Math.max(0, Math.min(100, progress.percent)) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateCheckInFlight = false;
    updateDownloadInFlight = false;
    sendUpdateState({ state: "update-downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => {
    updateCheckInFlight = false;
    updateDownloadInFlight = false;
    console.warn("Hikanest update check failed:", error instanceof Error ? error.message : error);
    sendUpdateState({
      state: "error",
      message: error instanceof Error ? error.message : "Update service unavailable.",
    });
  });
}

async function checkForUpdates() {
  if (isDev || updateCheckInFlight || updateDownloadInFlight) return false;
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
    return true;
  } catch (error) {
    updateCheckInFlight = false;
    console.warn("Hikanest update check failed:", error instanceof Error ? error.message : error);
    sendUpdateState({ state: "error", message: "Update service unavailable." });
    return false;
  }
}

async function downloadUpdate() {
  if (isDev || updateDownloadInFlight) return false;
  updateDownloadInFlight = true;
  sendUpdateState({ state: "downloading", percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
    return true;
  } catch (error) {
    updateDownloadInFlight = false;
    console.warn("Hikanest update download failed:", error instanceof Error ? error.message : error);
    sendUpdateState({ state: "error", message: "Unable to download the update. Please try again later." });
    return false;
  }
}

function installUpdate() {
  if (isDev || updateSessionActive) return { ok: false, reason: "active-session" };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

function receiveDesktopAuthUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "hikanest:" || url.hostname !== "auth") return;
    const code = url.searchParams.get("code");
    if (!code) return;
    pendingDesktopAuthCode = code;
    overlayWindow?.show();
    overlayWindow?.webContents.send("desktop-auth-code", code);
  } catch {
    // Ignore malformed custom protocol invocations.
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const authUrl = commandLine.find((value) => value.startsWith("hikanest://"));
    if (authUrl) receiveDesktopAuthUrl(authUrl);
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    receiveDesktopAuthUrl(url);
  });
}

const secureStorePath = () => path.join(app.getPath("userData"), "secure-store.json");

function readSecureStore(): Record<string, string> {
  try {
    const file = secureStorePath();
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSecureStore(store: Record<string, string>) {
  fs.writeFileSync(secureStorePath(), JSON.stringify(store, null, 2), "utf8");
}

function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }
  return Buffer.from(value, "utf8").toString("base64");
}

function decryptValue(value: string): string | null {
  try {
    const buffer = Buffer.from(value, "base64");
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

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

  const assetsDir = isDev
    ? path.join(__dirname, "../../assets")
    : path.join(process.resourcesPath, "assets");
  const iconPath = process.platform === "win32"
    ? path.join(assetsDir, "icon.ico")
    : path.join(assetsDir, "icon.png");

  overlayWindow = new BrowserWindow({
    width: 620,
    height: 680,
    x: width - 640,
    y: height - 700,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    movable: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
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

  if (isDev && process.env.HIKA_DESKTOP_OPEN_DEVTOOLS === "1") {
    overlayWindow.webContents.openDevTools({ mode: "detach" });
  }

  overlayWindow.on("closed", () => { overlayWindow = null; });

  // Start meeting auto-detection after window is ready
  overlayWindow.webContents.once("did-finish-load", () => {
    startMeetingDetection();
    overlayWindow?.webContents.send("clickthrough-changed", clickThroughEnabled);
    if (pendingDesktopAuthCode) overlayWindow?.webContents.send("desktop-auth-code", pendingDesktopAuthCode);
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
  const assetsDir = isDev
    ? path.join(__dirname, "../../assets")
    : path.join(process.resourcesPath, "assets");

  const iconCandidates = process.platform === "win32"
    ? ["icon.ico", "icon.png"]
    : process.platform === "darwin"
      ? ["icon.icns", "icon.png"]
      : ["icon.png"];

  const resolvedPath = iconCandidates
    .map((name) => path.join(assetsDir, name))
    .find((candidate) => fs.existsSync(candidate));

  const icon = resolvedPath
    ? nativeImage.createFromPath(resolvedPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Hikanest — AI Meeting Assistant\nInvisible to screen capture");

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
      {
        label: "Click-Through",
        type: "checkbox",
        checked: clickThroughEnabled,
        click: (item) => setClickThrough(item.checked),
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
      { label: "Quit Hikanest", click: () => app.quit() },
    ]);

  buildTrayMenu = buildMenu;
  tray.setContextMenu(buildMenu());
  tray.on("right-click", () => tray?.setContextMenu(buildMenu()));
  tray.on("click", () => {
    if (overlayWindow?.isVisible()) overlayWindow.hide();
    else overlayWindow?.show();
  });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

const PRODUCTION_API_URL = "https://hikanest-api-v1.onrender.com";

// Use the deployed API unless a developer explicitly supplies an override.
ipcMain.handle("get-api-url", () => {
  return process.env.HIKA_API_URL ?? PRODUCTION_API_URL;
});

ipcMain.handle("get-google-client-id", () => {
  return process.env.HIKA_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
});

ipcMain.handle("is-development", () => isDev);

ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("check-for-updates", () => checkForUpdates());
ipcMain.handle("download-update", () => downloadUpdate());
ipcMain.handle("install-update", () => installUpdate());
ipcMain.on("set-update-session-active", (_event, active: boolean) => {
  updateSessionActive = Boolean(active);
});

ipcMain.handle("open-external", async (_event, url: string) => {
  if (!/^https:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

// Toggle click-through mode
ipcMain.handle("set-clickthrough", (_e, enabled: boolean) => {
  setClickThrough(enabled);
});

function setClickThrough(enabled: boolean) {
  clickThroughEnabled = enabled;
  overlayWindow?.setIgnoreMouseEvents(enabled, { forward: true });
  overlayWindow?.webContents.send("clickthrough-changed", enabled);
  if (tray && buildTrayMenu) {
    tray.setContextMenu(buildTrayMenu());
  }
}

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

ipcMain.handle("secure-storage-get", (_e, key: string) => {
  const store = readSecureStore();
  const value = store[key];
  return value ? decryptValue(value) : null;
});

ipcMain.handle("secure-storage-set", (_e, key: string, value: string) => {
  const store = readSecureStore();
  store[key] = encryptValue(value);
  writeSecureStore(store);
});

ipcMain.handle("secure-storage-delete", (_e, key: string) => {
  const store = readSecureStore();
  delete store[key];
  writeSecureStore(store);
});

// Show / hide / pin
ipcMain.on("overlay-hide", () => overlayWindow?.hide());
ipcMain.on("overlay-pin",  () => {
  overlayWindow?.setAlwaysOnTop(true, "screen-saver", 1);
});
ipcMain.on("overlay-close", () => app.quit());

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  configureAutoUpdater();
  app.setAsDefaultProtocolClient("hikanest");
  const authUrl = process.argv.find((value) => value.startsWith("hikanest://"));
  if (authUrl) receiveDesktopAuthUrl(authUrl);
  createOverlay();
  createTray();

  if (!isDev) {
    setTimeout(() => { void checkForUpdates(); }, 5000);
    updateCheckTimer = setInterval(() => { void checkForUpdates(); }, 6 * 60 * 60 * 1000);
  }

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
  if (updateCheckTimer) clearInterval(updateCheckTimer);
});
