import { BrowserWindow } from "electron";
import { LINKEDIN_PARTITION } from "./session";

const GROW_URL = "https://www.linkedin.com/mynetwork/grow/";

export type AutomationSettings = {
  minDelayMs: number;
  maxDelayMs: number;
  maxConnects: number;
};

export type LogFn = (line: string) => void;

let automationWindow: BrowserWindow | null = null;
let stopRequested = false;

function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms: number, checkStop: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (checkStop()) {
        reject(new Error("stopped"));
        return;
      }
      if (Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

/** Click one visible Connect control in the People-you-may-know grid. */
const CLICK_ONE_CONNECT_SCRIPT = `
(() => {
  const isConnectButton = (el) => {
    if (!el || el.tagName !== "BUTTON") return false;
    const text = (el.innerText || "").trim().toLowerCase();
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    if (text === "connect" || text.startsWith("connect")) return true;
    if (label.includes("connect") && !label.includes("connected")) return true;
    if (text.includes("connect") && !text.includes("connected")) return true;
    return false;
  };

  const buttons = Array.from(document.querySelectorAll("button")).filter(isConnectButton);
  for (const btn of buttons) {
    const rect = btn.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = window.getComputedStyle(btn);
    if (style.visibility === "hidden" || style.display === "none") continue;
    btn.scrollIntoView({ block: "center", behavior: "instant" });
    btn.click();
    const name =
      btn.closest("li, div[data-view-name]")?.querySelector("span[aria-hidden=true]")?.textContent?.trim() ||
      "profile";
    return { clicked: true, name };
  }
  return { clicked: false };
})();
`;

const SCROLL_FEED_SCRIPT = `
(() => {
  window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
  return true;
})();
`;

/** LinkedIn toast when the weekly connection invitation cap is hit. */
const CHECK_WEEKLY_LIMIT_SCRIPT = `
(() => {
  const needles = [
    "reached the weekly limit",
    "weekly limit for connection invitations",
    "was not sent because you have reached",
  ];
  const matchText = (raw) => {
    const lower = (raw || "").toLowerCase();
    return needles.find((n) => lower.includes(n)) ? raw.trim() : null;
  };

  const regions = document.querySelectorAll(
    '[role="alert"], [aria-live="assertive"], [aria-live="polite"], .artdeco-toast-item, [data-test-artdeco-toast-item]'
  );
  for (const el of regions) {
    const hit = matchText(el.innerText || el.textContent || "");
    if (hit) return { detected: true, message: hit.slice(0, 280) };
  }

  const hit = matchText(document.body?.innerText || "");
  if (hit) {
    const lower = hit.toLowerCase();
    const idx = lower.indexOf("reached the weekly limit");
    const start = idx >= 0 ? Math.max(0, idx - 80) : 0;
    return { detected: true, message: hit.slice(start, start + 280) };
  }

  return { detected: false };
})();
`;

export function requestStopAutomation(): void {
  stopRequested = true;
}

export function isAutomationRunning(): boolean {
  return automationWindow !== null && !automationWindow.isDestroyed();
}

type WeeklyLimitCheck = { detected: boolean; message?: string };

async function detectWeeklyLimit(): Promise<WeeklyLimitCheck> {
  if (!automationWindow || automationWindow.isDestroyed()) {
    return { detected: false };
  }
  return automationWindow.webContents.executeJavaScript(CHECK_WEEKLY_LIMIT_SCRIPT, true);
}

async function sleepMonitored(
  ms: number,
  checkStop: () => boolean,
  onWeeklyLimit: (message?: string) => void
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (checkStop()) {
      throw new Error("stopped");
    }
    const limit = await detectWeeklyLimit();
    if (limit.detected) {
      onWeeklyLimit(limit.message);
      stopRequested = true;
      throw new Error("weekly_limit");
    }
    const remaining = ms - (Date.now() - start);
    await new Promise((resolve) => setTimeout(resolve, Math.min(750, remaining)));
  }
}

export async function runConnectAutomation(
  settings: AutomationSettings,
  log: LogFn
): Promise<{ connected: number; stopped: boolean; weeklyLimitReached?: boolean }> {
  if (isAutomationRunning()) {
    throw new Error("Automation is already running.");
  }

  stopRequested = false;
  let connected = 0;
  let weeklyLimitReached = false;

  const handleWeeklyLimit = (message?: string) => {
    weeklyLimitReached = true;
    log("Weekly connection limit detected — auto-stopping.");
    if (message) {
      log(message.replace(/\s+/g, " ").trim());
    }
    log("Try again next week or use LinkedIn manually until the limit resets.");
  };

  automationWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    title: "LinkedIn Connect — automation",
    webPreferences: {
      partition: LINKEDIN_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  automationWindow.webContents.setUserAgent(
    automationWindow.webContents.getUserAgent().replace(/Electron\/[^\s]+\s?/, "")
  );

  const checkStop = () => stopRequested;

  try {
    log("Opening My Network suggestions…");
    await automationWindow.loadURL(GROW_URL);

    await sleepMonitored(4000, checkStop, handleWeeklyLimit);

    const tryClickConnect = async (): Promise<{ clicked: boolean; name?: string }> => {
      return automationWindow!.webContents.executeJavaScript(CLICK_ONE_CONNECT_SCRIPT, true);
    };

    while (connected < settings.maxConnects && !checkStop()) {
      const limitBefore = await detectWeeklyLimit();
      if (limitBefore.detected) {
        handleWeeklyLimit(limitBefore.message);
        break;
      }

      let result = await tryClickConnect();

      if (!result?.clicked) {
        log("No Connect button in view — scrolling for more suggestions…");
        await automationWindow.webContents.executeJavaScript(SCROLL_FEED_SCRIPT, true);
        await sleepMonitored(2500, checkStop, handleWeeklyLimit);
        result = await tryClickConnect();
        if (!result?.clicked) {
          log("No more Connect buttons found. Stopping.");
          break;
        }
      }

      await sleepMonitored(2200, checkStop, handleWeeklyLimit);
      const limitAfterClick = await detectWeeklyLimit();
      if (limitAfterClick.detected) {
        handleWeeklyLimit(limitAfterClick.message);
        break;
      }

      connected += 1;
      log(`Sent connect #${connected}${result.name ? ` (${result.name})` : ""}.`);
      const wait = randomDelay(settings.minDelayMs, settings.maxDelayMs);
      log(`Waiting ${Math.round(wait / 1000)}s before next action…`);
      await sleepMonitored(wait, checkStop, handleWeeklyLimit);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "weekly_limit") {
      log("Automation stopped (weekly limit).");
      return { connected, stopped: true, weeklyLimitReached: true };
    }
    const stopped = checkStop() || (err instanceof Error && err.message === "stopped");
    if (stopped) {
      log("Automation stopped.");
      return { connected, stopped: true, weeklyLimitReached };
    }
    throw err;
  } finally {
    if (automationWindow && !automationWindow.isDestroyed()) {
      automationWindow.close();
    }
    automationWindow = null;
    stopRequested = false;
  }

  if (weeklyLimitReached) {
    log(`Stopped at ${connected} connect(s) this run — weekly invitation limit reached.`);
    return { connected, stopped: true, weeklyLimitReached: true };
  }

  log(`Finished. ${connected} connection request(s) sent this run.`);
  return { connected, stopped: false };
}

export async function openLoginWindow(log: LogFn): Promise<boolean> {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    title: "LinkedIn — sign in",
    webPreferences: {
      partition: LINKEDIN_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setUserAgent(
    win.webContents.getUserAgent().replace(/Electron\/[^\s]+\s?/, "")
  );

  log("Sign in to LinkedIn in the window that opened. Close it when you see your feed.");
  await win.loadURL("https://www.linkedin.com/login");

  return new Promise((resolve) => {
    const onClosed = async () => {
      const { hasLinkedInSession } = await import("./session");
      resolve(await hasLinkedInSession());
    };
    win.on("closed", onClosed);
  });
}
