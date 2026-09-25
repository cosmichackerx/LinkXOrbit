import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "path";
import {
  openLoginWindow,
  requestStopAutomation,
  runAutomation,
  type AutomationSettings,
} from "./automation";
import { hasLinkedInSession } from "./session";
import { createSettingsStore, normalizeSettings } from "./settings";

const store = createSettingsStore();

let mainWindow: BrowserWindow | null = null;

function getSettings(): AutomationSettings {
  return normalizeSettings(store.get("settings"));
}

function sendLog(line: string): void {
  const ts = new Date().toLocaleTimeString();
  mainWindow?.webContents.send("log", `[${ts}] ${line}`);
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 640,
    minWidth: 440,
    minHeight: 520,
    title: "LinkXOrbit",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  ipcMain.handle("get-session-status", async () => ({
    loggedIn: await hasLinkedInSession(),
    settings: getSettings(),
    userDataPath: app.getPath("userData"),
  }));

  ipcMain.handle("save-settings", (_e, settings: AutomationSettings) => {
    const next = normalizeSettings(settings);
    if (next.minDelayMs > next.maxDelayMs) {
      throw new Error("Min delay must be less than or equal to max delay.");
    }
    store.set("settings", next);
    return getSettings();
  });

  ipcMain.handle("login", async () => {
    const ok = await openLoginWindow(sendLog);
    sendLog(ok ? "Session saved. You can start automation." : "No LinkedIn session detected. Try signing in again.");
    return { loggedIn: ok };
  });

  ipcMain.handle("start-automation", async () => {
    const loggedIn = await hasLinkedInSession();
    if (!loggedIn) {
      return { ok: false, error: "Not signed in. Use Sign in to LinkedIn first." };
    }
    const settings = getSettings();
    try {
      const result = await runAutomation(settings, sendLog);
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendLog(`Error: ${message}`);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("stop-automation", () => {
    requestStopAutomation();
    sendLog("Stop requested…");
    return { ok: true };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
