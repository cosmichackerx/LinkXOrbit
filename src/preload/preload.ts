import { contextBridge, ipcRenderer } from "electron";

export type AutomationMode = "grow" | "unfollow";
export type UnfollowTarget = "following" | "followers";

export type AutomationSettings = {
  mode: AutomationMode;
  unfollowTarget?: UnfollowTarget;
  minDelayMs: number;
  maxDelayMs: number;
  maxActionsPerRun: number;
};

export type ActionSuccessPayload = {
  runCount: number;
  totalCount: number;
  mode: AutomationMode;
  name?: string;
};

export type NetworkCounts = {
  followers: number | null;
  following: number | null;
  lastUpdated: string | null;
};

contextBridge.exposeInMainWorld("linkXOrbit", {
  getSessionStatus: () => ipcRenderer.invoke("get-session-status"),
  saveSettings: (settings: AutomationSettings) => ipcRenderer.invoke("save-settings", settings),
  resetStats: () => ipcRenderer.invoke("reset-stats"),
  refreshNetworkCounts: () => ipcRenderer.invoke("refresh-network-counts"),
  login: () => ipcRenderer.invoke("login"),
  startAutomation: () => ipcRenderer.invoke("start-automation"),
  stopAutomation: () => ipcRenderer.invoke("stop-automation"),
  onLog: (handler: (line: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, line: string) => handler(line);
    ipcRenderer.on("log", listener);
    return () => ipcRenderer.removeListener("log", listener);
  },
  onActionSuccess: (handler: (payload: ActionSuccessPayload) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: ActionSuccessPayload) => handler(payload);
    ipcRenderer.on("action-success", listener);
    return () => ipcRenderer.removeListener("action-success", listener);
  },
  onNetworkCountsUpdated: (handler: (counts: NetworkCounts) => void) => {
    const listener = (_: Electron.IpcRendererEvent, counts: NetworkCounts) => handler(counts);
    ipcRenderer.on("network-counts-updated", listener);
    return () => ipcRenderer.removeListener("network-counts-updated", listener);
  },
});
