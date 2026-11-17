import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "path";
import {
  fetchLinkedInNetworkCounts,
  openLoginWindow,
  requestStopAutomation,
  runAutomation,
  type AutomationSettings,
} from "./automation";
import { hasLinkedInSession } from "./session";
import {
  createSettingsStore,
  defaultStats,
  getStoredNetworkCounts,
  normalizeSettings,
  saveStoredNetworkCounts,
  type AutomationStats,
  type NetworkCounts,
} from "./settings";

const store = createSettingsStore();

let mainWindow: BrowserWindow | null = null;

function getSettings(): AutomationSettings {
  return normalizeSettings(store.get("settings"));
}

function getStats(): AutomationStats {
  return store.get("stats") ?? defaultStats;
}

function sendLog(line: string): void {
  const ts = new Date().toLocaleTimeString();
  mainWindow?.webContents.send("log", `[${ts}] ${line}`);
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 820,
    minHeight: 600,
    title: "LinkXOrbit",
    backgroundColor: "#0b0f14",
    icon: path.join(__dirname, "../assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.webContents.once("did-finish-load", async () => {
    const loggedIn = await hasLinkedInSession();
    if (loggedIn) {
      setTimeout(async () => {
        try {
          const counts = await fetchLinkedInNetworkCounts();
          const saved = saveStoredNetworkCounts(store, counts);
          mainWindow?.webContents.send("network-counts-updated", saved);
        } catch {}
      }, 1500);
    }
  });

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
    stats: getStats(),
    networkCounts: getStoredNetworkCounts(store),
    userDataPath: app.getPath("userData"),
  }));

  ipcMain.handle("refresh-network-counts", async () => {
    const loggedIn = await hasLinkedInSession();
    if (!loggedIn) {
      sendLog("Please sign in to LinkedIn first to view follower counts.");
      return getStoredNetworkCounts(store);
    }
    try {
      const counts = await fetchLinkedInNetworkCounts(sendLog);
      const saved = saveStoredNetworkCounts(store, counts);
      mainWindow?.webContents.send("network-counts-updated", saved);
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendLog(`Could not refresh counts: ${message}`);
      return getStoredNetworkCounts(store);
    }
  });

  ipcMain.handle("save-settings", (_e, settings: AutomationSettings) => {
    const next = normalizeSettings(settings);
    if (next.minDelayMs > next.maxDelayMs) {
      throw new Error("Min delay must be less than or equal to max delay.");
    }
    store.set("settings", next);
    return getSettings();
  });

  ipcMain.handle("reset-stats", () => {
    store.set("stats", { ...defaultStats });
    return getStats();
  });

  ipcMain.handle("login", async () => {
    const ok = await openLoginWindow(sendLog);
    sendLog(ok ? "Session saved. You can start automation." : "No LinkedIn session detected. Try signing in again.");
    if (ok) {
      setTimeout(async () => {
        try {
          const counts = await fetchLinkedInNetworkCounts(sendLog);
          const saved = saveStoredNetworkCounts(store, counts);
          mainWindow?.webContents.send("network-counts-updated", saved);
        } catch {}
      }, 1000);
    }
    return { loggedIn: ok };
  });

  ipcMain.handle("start-automation", async () => {
    const loggedIn = await hasLinkedInSession();
    if (!loggedIn) {
      return { ok: false, error: "Not signed in. Use Sign in to LinkedIn first." };
    }
    const settings = getSettings();
    try {
      const result = await runAutomation(
        settings,
        sendLog,
        (runCount, name) => {
          const stats = getStats();
          stats.totalSucceeded += 1;
          if (settings.mode === "unfollow") {
            stats.unfollowSucceeded += 1;
          } else {
            stats.growSucceeded += 1;
          }
          store.set("stats", stats);
          mainWindow?.webContents.send("action-success", {
            runCount,
            totalCount: stats.totalSucceeded,
            mode: settings.mode,
            name,
          });
        },
        (networkPayload) => {
          if (networkPayload.action === "unfollow") {
            const current = getStoredNetworkCounts(store);
            if (current.following !== null && current.following > 0) {
              const updated = saveStoredNetworkCounts(store, {
                following: current.following - 1,
              });
              mainWindow?.webContents.send("network-counts-updated", updated);
            }
          } else if (
            networkPayload.followers !== undefined ||
            networkPayload.following !== undefined
          ) {
            const updated = saveStoredNetworkCounts(store, {
              followers: networkPayload.followers,
              following: networkPayload.following,
              lastUpdated: networkPayload.lastUpdated,
            });
            mainWindow?.webContents.send("network-counts-updated", updated);
          }
        }
      );
      return { ok: true, stats: getStats(), ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendLog(`Error: ${message}`);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("stop-automation", () => {
    requestStopAutomation();
    sendLog("Stop requested — closing automation window…");
    return { ok: true };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
