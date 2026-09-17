import { contextBridge, ipcRenderer } from "electron";

type UpdateStatePayload = {
  state: "checking" | "update-available" | "downloading" | "update-downloaded" | "up-to-date" | "error";
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
};

contextBridge.exposeInMainWorld("hikaElectron", {
  getApiUrl: (): Promise<string> =>
    ipcRenderer.invoke("get-api-url"),

  getWebAppUrl: (): Promise<string> =>
    ipcRenderer.invoke("get-web-app-url"),

  isDevelopment: (): Promise<boolean> =>
    ipcRenderer.invoke("is-development"),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke("get-app-version"),

  checkForUpdates: (): Promise<boolean> =>
    ipcRenderer.invoke("check-for-updates"),

  downloadUpdate: (): Promise<boolean> =>
    ipcRenderer.invoke("download-update"),

  installUpdate: (): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke("install-update"),

  setUpdateSessionActive: (active: boolean): void => {
    ipcRenderer.send("set-update-session-active", active);
  },

  onUpdateState: (cb: (payload: UpdateStatePayload) => void): void => {
    ipcRenderer.on("update-state", (_event, payload: UpdateStatePayload) => cb(payload));
  },

  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("open-external", url),

  setClickThrough: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke("set-clickthrough", enabled),

  setSize: (width: number, height: number): Promise<void> =>
    ipcRenderer.invoke("set-size", width, height),

  captureScreen: (): Promise<string | null> =>
    ipcRenderer.invoke("capture-screen"),

  getLoopbackSource: (): Promise<{ id: string; name: string } | null> =>
    ipcRenderer.invoke("get-loopback-source"),

  getSecureItem: (key: string): Promise<string | null> =>
    ipcRenderer.invoke("secure-storage-get", key),

  setSecureItem: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke("secure-storage-set", key, value),

  removeSecureItem: (key: string): Promise<void> =>
    ipcRenderer.invoke("secure-storage-delete", key),

  hide: () => ipcRenderer.send("overlay-hide"),

  close: () => ipcRenderer.send("overlay-close"),

  pin: () => ipcRenderer.send("overlay-pin"),

  onMeetingDetected: (cb: (appName: string) => void): void => {
    ipcRenderer.on("meeting-detected", (_event, appName: string) => cb(appName));
  },

  onClickThroughChanged: (cb: (enabled: boolean) => void): void => {
    ipcRenderer.on("clickthrough-changed", (_event, enabled: boolean) => cb(enabled));
  },

  onDesktopAuthCode: (cb: (code: string) => void): void => {
    ipcRenderer.on("desktop-auth-code", (_event, code: string) => cb(code));
  },
});

declare global {
  interface Window {
    hikaElectron: {
      getApiUrl: () => Promise<string>;
      getWebAppUrl: () => Promise<string>;
      isDevelopment: () => Promise<boolean>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<boolean>;
      downloadUpdate: () => Promise<boolean>;
      installUpdate: () => Promise<{ ok: boolean; reason?: string }>;
      setUpdateSessionActive: (active: boolean) => void;
      onUpdateState: (cb: (payload: UpdateStatePayload) => void) => void;
      openExternal: (url: string) => Promise<boolean>;
      setClickThrough: (enabled: boolean) => Promise<void>;
      setSize: (width: number, height: number) => Promise<void>;
      captureScreen: () => Promise<string | null>;
      getLoopbackSource: () => Promise<{ id: string; name: string } | null>;
      getSecureItem: (key: string) => Promise<string | null>;
      setSecureItem: (key: string, value: string) => Promise<void>;
      removeSecureItem: (key: string) => Promise<void>;
      hide: () => void;
      close: () => void;
      pin: () => void;
      onMeetingDetected: (cb: (appName: string) => void) => void;
      onClickThroughChanged: (cb: (enabled: boolean) => void) => void;
      onDesktopAuthCode: (cb: (code: string) => void) => void;
    };
  }
}
