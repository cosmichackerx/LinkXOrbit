import { contextBridge, ipcRenderer } from "electron";

export type AutomationSettings = {
  minDelayMs: number;
  maxDelayMs: number;
  maxConnects: number;
};

contextBridge.exposeInMainWorld("linkedInConnect", {
  getSessionStatus: () => ipcRenderer.invoke("get-session-status"),
  saveSettings: (settings: AutomationSettings) => ipcRenderer.invoke("save-settings", settings),
  login: () => ipcRenderer.invoke("login"),
  startAutomation: () => ipcRenderer.invoke("start-automation"),
  stopAutomation: () => ipcRenderer.invoke("stop-automation"),
  onLog: (handler: (line: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, line: string) => handler(line);
    ipcRenderer.on("log", listener);
    return () => ipcRenderer.removeListener("log", listener);
  },
});
