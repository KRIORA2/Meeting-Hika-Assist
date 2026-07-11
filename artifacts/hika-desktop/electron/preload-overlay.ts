import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hikaElectron", {
  getApiUrl: (): Promise<string> =>
    ipcRenderer.invoke("get-api-url"),

  setClickThrough: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke("set-clickthrough", enabled),

  setSize: (width: number, height: number): Promise<void> =>
    ipcRenderer.invoke("set-size", width, height),

  captureScreen: (): Promise<string | null> =>
    ipcRenderer.invoke("capture-screen"),

  hide: () => ipcRenderer.send("overlay-hide"),

  pin: () => ipcRenderer.send("overlay-pin"),

  onMeetingDetected: (cb: (appName: string) => void): void => {
    ipcRenderer.on("meeting-detected", (_event, appName: string) => cb(appName));
  },
});

declare global {
  interface Window {
    hikaElectron: {
      getApiUrl: () => Promise<string>;
      setClickThrough: (enabled: boolean) => Promise<void>;
      setSize: (width: number, height: number) => Promise<void>;
      captureScreen: () => Promise<string | null>;
      hide: () => void;
      pin: () => void;
      onMeetingDetected: (cb: (appName: string) => void) => void;
    };
  }
}
