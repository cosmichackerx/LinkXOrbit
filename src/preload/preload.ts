import { contextBridge, ipcRenderer } from "electron";

export type AutomationMode = "grow" | "unfollow";

export type AutomationSettings = {
  mode: AutomationMode;
  minDelayMs: number;
  maxDelayMs: number;
  maxActionsPerRun: number;
};

contextBridge.exposeInMainWorld("linkXOrbit", {
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
