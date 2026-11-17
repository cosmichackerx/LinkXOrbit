import { BrowserWindow } from "electron";
import { LINKEDIN_PARTITION } from "./session";

const GROW_URL = "https://www.linkedin.com/mynetwork/grow/";
const FOLLOWERS_URL =
  "https://www.linkedin.com/mynetwork/network-manager/people-follow/followers/";
const FOLLOWING_URL =
  "https://www.linkedin.com/mynetwork/network-manager/people-follow/following/";

export type AutomationMode = "grow" | "unfollow";
export type UnfollowTarget = "followers" | "following";

export type AutomationSettings = {
  mode: AutomationMode;
  unfollowTarget?: UnfollowTarget;
  minDelayMs: number;
  maxDelayMs: number;
  /** Max connect or unfollow actions per run. */
  maxActionsPerRun: number;
};

export type LogFn = (line: string) => void;
export type ActionSuccessFn = (count: number, name?: string) => void;
export type NetworkCountsAction = {
  action?: "unfollow" | "connect";
  followers?: number | null;
  following?: number | null;
  lastUpdated?: string;
};
export type NetworkCountsFn = (payload: NetworkCountsAction) => void;

let automationWindow: BrowserWindow | null = null;
let stopRequested = false;

function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
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
  window.scrollBy({ top: window.innerHeight * 1.1, behavior: "smooth" });
  return true;
})();
`;

/**
 * Atomic find, click, and confirm unfollow on one member.
 * - Strictly ignores tab navigation buttons (role="tab", .artdeco-tab) so it never leaves the followers page!
 * - Strictly avoids any button marked "Follow" (never follows someone).
 * - Only clicks member buttons marked "Following".
 * - Confirms the alertdialog / artdeco-modal unfollow button.
 */
const UNFOLLOW_ONE_FOLLOWER_SCRIPT = `
(async () => {
  const isExcluded = (b) => {
    if (b.getAttribute("role") === "tab" || b.classList.contains("artdeco-tab")) return true;
    if (b.parentElement && b.parentElement.classList.contains("artdeco-tablist")) return true;
    if (b.closest("aside, .ad-banner, [data-view-name*='promoted'], footer, nav, header, .global-nav")) return true;
    if (b.getAttribute("data-unfollow-attempted") === "true") return true;
    return false;
  };

  const isFollowButton = (b) => {
    const text = (b.innerText || "").trim().toLowerCase();
    const label = (b.getAttribute("aria-label") || "").toLowerCase();
    return (
      text === "follow" ||
      label === "follow" ||
      label.startsWith("follow ") ||
      label.includes("to follow ")
    );
  };

  const isFollowingButton = (b) => {
    if (isExcluded(b)) return false;
    if (isFollowButton(b)) return false; // Strictly avoid any follow button!
    const text = (b.innerText || "").trim().toLowerCase();
    const label = (b.getAttribute("aria-label") || "").toLowerCase();
    return (
      label.includes("stop following") ||
      text === "following" ||
      label.includes("following") ||
      label.includes("unfollow")
    );
  };

  const allButtons = Array.from(document.querySelectorAll("button")).filter(b => !isExcluded(b));
  const followCount = allButtons.filter(isFollowButton).length;
  const followingBtn = allButtons.find(isFollowingButton);

  if (!followingBtn) {
    return { found: false, followButtonsSkipped: followCount };
  }

  // Tag button so we never repeatedly click a failing button in a loop
  followingBtn.setAttribute("data-unfollow-attempted", "true");

  // Get member name
  const rawLabel = followingBtn.getAttribute("aria-label") || "";
  let name = "";
  const match = rawLabel.match(/(?:stop following|unfollow|following)\s+(.+)/i);
  if (match && match[1]) {
    name = match[1].replace(/^(to\s+)/i, "").trim();
  }
  if (!name) {
    const row = followingBtn.closest("li, div[data-view-name], div.entity-result");
    const nameEl =
      row?.querySelector(".artdeco-entity-lockup__title a") ||
      row?.querySelector("a[href*='/in/'] span[aria-hidden='true']") ||
      row?.querySelector(".artdeco-entity-lockup__title") ||
      row?.querySelector("a[href*='/in/']") ||
      row?.querySelector("span[dir='ltr']");
    name = nameEl?.textContent?.replace(/\\s+/g, " ")?.trim() || "profile";
  }

  followingBtn.scrollIntoView({ block: "center", behavior: "instant" });
  followingBtn.click();

  // Wait up to 2.5 seconds for confirmation alertdialog / modal
  let confirmed = false;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 100));
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"], .artdeco-modal');
    if (dialog) {
      const buttons = Array.from(dialog.querySelectorAll("button"));
      const confirmBtn = buttons.find(b => {
        const t = (b.innerText || "").trim().toLowerCase();
        const l = (b.getAttribute("aria-label") || "").toLowerCase();
        return t === "unfollow" || l.includes("unfollow") || b.classList.contains("artdeco-button--primary");
      });
      if (confirmBtn) {
        confirmBtn.click();
        confirmed = true;
        break;
      }
    }
  }

  // Check if button directly transitioned to 'Follow'
  if (!confirmed) {
    const textAfter = (followingBtn.innerText || "").trim().toLowerCase();
    const labelAfter = (followingBtn.getAttribute("aria-label") || "").toLowerCase();
    if (textAfter === "follow" || labelAfter.includes("to follow ")) {
      confirmed = true;
    }
  }

  return {
    found: true,
    name,
    confirmed,
    followButtonsSkipped: followCount
  };
})()
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
  if (automationWindow && !automationWindow.isDestroyed()) {
    try {
      automationWindow.webContents.stop();
    } catch {}
    try {
      automationWindow.destroy();
    } catch {}
    automationWindow = null;
  }
}

export function isAutomationRunning(): boolean {
  return automationWindow !== null && !automationWindow.isDestroyed();
}

/** Script to extract current followers count from page DOM or embedded data */
export const EXTRACT_FOLLOWERS_SCRIPT = `
(() => {
  let followers = null;
  const els = Array.from(document.querySelectorAll("h1, h2, h3, h4, p, span, div, [role='tab']"));
  for (const el of els) {
    const text = (el.innerText || "").trim();
    if (!text || text.length > 100) continue;
    const m1 = text.match(/([0-9][0-9,]*)\\s+people\\s+are\\s+following\\s+you/i);
    if (m1) {
      followers = parseInt(m1[1].replace(/,/g, ""), 10);
      break;
    }
    const m2 = text.match(/([0-9][0-9,]*)\\s+followers\\b/i);
    if (m2) {
      followers = parseInt(m2[1].replace(/,/g, ""), 10);
      break;
    }
    const m3 = text.match(/Followers\\s*\\(?([0-9][0-9,]*)\\)?/i);
    if (m3) {
      followers = parseInt(m3[1].replace(/,/g, ""), 10);
      break;
    }
  }
  if (followers === null) {
    const codes = Array.from(document.querySelectorAll("code"));
    for (const c of codes) {
      const t = c.textContent || "";
      const m = t.match(/"followerCount"\\s*:\\s*(\\d+)/i) || t.match(/"totalFollowers"\\s*:\\s*(\\d+)/i);
      if (m) {
        followers = parseInt(m[1], 10);
        break;
      }
    }
  }
  return followers;
})();
`;

/** Script to extract current following count from page DOM or embedded data */
export const EXTRACT_FOLLOWING_SCRIPT = `
(() => {
  let following = null;
  const els = Array.from(document.querySelectorAll("h1, h2, h3, h4, p, span, div, [role='tab']"));
  for (const el of els) {
    const text = (el.innerText || "").trim();
    if (!text || text.length > 100) continue;
    const m1 = text.match(/(?:You\\s+are\\s+following|following)\\s+([0-9][0-9,]*)\\s*(?:(?:out-of-network\\s+)?people|members|pages|accounts)?/i);
    if (m1) {
      following = parseInt(m1[1].replace(/,/g, ""), 10);
      break;
    }
    const m2 = text.match(/Following\\s*\\(?([0-9][0-9,]*)\\)?/i);
    if (m2) {
      following = parseInt(m2[1].replace(/,/g, ""), 10);
      break;
    }
    const m3 = text.match(/([0-9][0-9,]*)\\s+following\\b/i);
    if (m3) {
      following = parseInt(m3[1].replace(/,/g, ""), 10);
      break;
    }
  }
  if (following === null) {
    const codes = Array.from(document.querySelectorAll("code"));
    for (const c of codes) {
      const t = c.textContent || "";
      const m = t.match(/"followingCount"\\s*:\\s*(\\d+)/i) || t.match(/"totalFollowing"\\s*:\\s*(\\d+)/i);
      if (m) {
        following = parseInt(m[1], 10);
        break;
      }
    }
  }
  return following;
})();
`;

const CLICK_FOLLOWING_TAB_SCRIPT = `
(() => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"], button'));
  const followingTab = tabs.find(t => (t.innerText || "").trim().toLowerCase() === "following");
  if (followingTab) {
    followingTab.click();
    return true;
  }
  return false;
})();
`;

let isFetchingNetworkCounts = false;

export async function fetchLinkedInNetworkCounts(
  log?: LogFn
): Promise<{ followers: number | null; following: number | null; lastUpdated: string }> {
  if (isFetchingNetworkCounts) {
    throw new Error("Already fetching network counts. Please wait a moment.");
  }
  isFetchingNetworkCounts = true;
  let bgWin: BrowserWindow | null = null;

  try {
    // If an automation window is actively on followers or following page, extract directly
    if (isAutomationRunning() && automationWindow && !automationWindow.isDestroyed()) {
      const currentUrl = automationWindow.webContents.getURL() || "";
      let followers: number | null = null;
      let following: number | null = null;

      if (currentUrl.includes("/people-follow/followers")) {
        followers = await safeExecuteScript<number | null>(EXTRACT_FOLLOWERS_SCRIPT, 4000);
      } else if (currentUrl.includes("/people-follow/following")) {
        following = await safeExecuteScript<number | null>(EXTRACT_FOLLOWING_SCRIPT, 4000);
      }
      return {
        followers,
        following,
        lastUpdated: new Date().toISOString(),
      };
    }

    log?.("Fetching real-time followers & following counts from LinkedIn…");

    bgWin = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      title: "LinkXOrbit — Network Stats",
      webPreferences: {
        partition: LINKEDIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    bgWin.webContents.setUserAgent(
      bgWin.webContents.getUserAgent().replace(/Electron\/[^\s]+\s?/, "")
    );

    // 1. Load Followers page
    await safeLoadURL(bgWin, FOLLOWERS_URL, 20000);
    await new Promise((r) => setTimeout(r, 2200));

    if (bgWin.isDestroyed()) {
      throw new Error("Window closed");
    }

    const followers = await bgWin.webContents.executeJavaScript(EXTRACT_FOLLOWERS_SCRIPT, true);

    // 2. Try clicking "Following" tab first for fast SPA switch
    let following: number | null = null;
    const tabClicked = await bgWin.webContents.executeJavaScript(CLICK_FOLLOWING_TAB_SCRIPT, true);
    if (tabClicked) {
      await new Promise((r) => setTimeout(r, 1800));
      if (!bgWin.isDestroyed()) {
        following = await bgWin.webContents.executeJavaScript(EXTRACT_FOLLOWING_SCRIPT, true);
      }
    }

    // Fallback: direct navigation to FOLLOWING_URL if needed
    if (following === null && !bgWin.isDestroyed()) {
      await safeLoadURL(bgWin, FOLLOWING_URL, 20000);
      await new Promise((r) => setTimeout(r, 2200));
      if (!bgWin.isDestroyed()) {
        following = await bgWin.webContents.executeJavaScript(EXTRACT_FOLLOWING_SCRIPT, true);
      }
    }

    const followersText = followers !== null ? Number(followers).toLocaleString() : "—";
    const followingText = following !== null ? Number(following).toLocaleString() : "—";
    log?.(`LinkedIn network stats: ${followersText} followers | ${followingText} following.`);

    return {
      followers,
      following,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== "stopped" && !msg.includes("destroyed")) {
      log?.(`Could not fetch network stats: ${msg}`);
    }
    throw err;
  } finally {
    if (bgWin && !bgWin.isDestroyed()) {
      try {
        bgWin.destroy();
      } catch {}
    }
    isFetchingNetworkCounts = false;
  }
}

type WeeklyLimitCheck = { detected: boolean; message?: string };

async function detectWeeklyLimit(): Promise<WeeklyLimitCheck> {
  if (stopRequested || !automationWindow || automationWindow.isDestroyed()) {
    return { detected: false };
  }
  try {
    return await safeExecuteScript<WeeklyLimitCheck>(CHECK_WEEKLY_LIMIT_SCRIPT, 4000) ?? { detected: false };
  } catch {
    return { detected: false };
  }
}

async function safeExecuteScript<T>(script: string, timeoutMs = 12000): Promise<T | null> {
  if (stopRequested || !automationWindow || automationWindow.isDestroyed()) {
    throw new Error("stopped");
  }

  return Promise.race([
    automationWindow.webContents.executeJavaScript(script, true),
    new Promise<T | null>((_, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (stopRequested || !automationWindow || automationWindow.isDestroyed()) {
          clearInterval(iv);
          reject(new Error("stopped"));
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          reject(new Error("script_timeout"));
        }
      }, 150);
    }),
  ]);
}

async function safeLoadURL(win: BrowserWindow, url: string, timeoutMs = 25000): Promise<void> {
  if (stopRequested || win.isDestroyed()) {
    throw new Error("stopped");
  }

  return new Promise<void>((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      clearInterval(iv);
      clearTimeout(timer);
    };

    const done = () => {
      if (!finished) {
        finished = true;
        cleanup();
        resolve();
      }
    };

    const fail = (err: Error) => {
      if (!finished) {
        finished = true;
        cleanup();
        reject(err);
      }
    };

    const iv = setInterval(() => {
      if (stopRequested || win.isDestroyed()) {
        try { win.webContents.stop(); } catch {}
        fail(new Error("stopped"));
      }
    }, 150);

    const timer = setTimeout(() => {
      try { win.webContents.stop(); } catch {}
      done(); // Page DOM is sufficiently loaded to proceed
    }, timeoutMs);

    win.loadURL(url)
      .then(() => done())
      .catch((err) => {
        if (stopRequested || win.isDestroyed()) {
          fail(new Error("stopped"));
        } else {
          done();
        }
      });
  });
}

async function sleepMonitored(
  ms: number,
  checkStop: () => boolean,
  onWeeklyLimit: (message?: string) => void,
  watchWeeklyLimit = true
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (checkStop() || !automationWindow || automationWindow.isDestroyed()) {
      throw new Error("stopped");
    }
    if (watchWeeklyLimit) {
      const limit = await detectWeeklyLimit();
      if (limit.detected) {
        onWeeklyLimit(limit.message);
        stopRequested = true;
        throw new Error("weekly_limit");
      }
    }
    const remaining = ms - (Date.now() - start);
    await new Promise((resolve) => setTimeout(resolve, Math.min(200, remaining)));
  }
}

function createAutomationWindow(title: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    title,
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

  win.on("close", () => {
    stopRequested = true;
  });

  win.on("closed", () => {
    stopRequested = true;
    if (automationWindow === win) {
      automationWindow = null;
    }
  });

  return win;
}

function closeAutomationWindow(): void {
  if (automationWindow && !automationWindow.isDestroyed()) {
    try {
      automationWindow.close();
    } catch {}
  }
  automationWindow = null;
  stopRequested = false;
}

export async function runConnectAutomation(
  settings: AutomationSettings,
  log: LogFn,
  onSuccess?: ActionSuccessFn,
  onNetworkCounts?: NetworkCountsFn
): Promise<{ connected: number; stopped: boolean; weeklyLimitReached?: boolean }> {
  if (isAutomationRunning()) {
    throw new Error("Automation is already running.");
  }

  stopRequested = false;
  let connected = 0;
  let weeklyLimitReached = false;

  // Refresh counts before run starts
  try {
    const initialCounts = await fetchLinkedInNetworkCounts();
    onNetworkCounts?.({
      followers: initialCounts.followers,
      following: initialCounts.following,
      lastUpdated: initialCounts.lastUpdated,
    });
  } catch {}

  const handleWeeklyLimit = (message?: string) => {
    weeklyLimitReached = true;
    log("Weekly connection limit detected — auto-stopping.");
    if (message) {
      log(message.replace(/\s+/g, " ").trim());
    }
    log("Try again next week or use LinkedIn manually until the limit resets.");
  };

  automationWindow = createAutomationWindow("LinkXOrbit — grow network");
  const checkStop = () => stopRequested || !automationWindow || automationWindow.isDestroyed();

  try {
    log("Opening My Network suggestions…");
    await safeLoadURL(automationWindow, GROW_URL);

    await sleepMonitored(4000, checkStop, handleWeeklyLimit);

    const tryClickConnect = async (): Promise<{ clicked: boolean; name?: string } | null> => {
      return safeExecuteScript<{ clicked: boolean; name?: string }>(CLICK_ONE_CONNECT_SCRIPT);
    };

    while (connected < settings.maxActionsPerRun && !checkStop()) {
      const limitBefore = await detectWeeklyLimit();
      if (limitBefore.detected) {
        handleWeeklyLimit(limitBefore.message);
        break;
      }

      let result = await tryClickConnect();

      if (!result?.clicked) {
        log("No Connect button in view — scrolling for more suggestions…");
        await safeExecuteScript(SCROLL_FEED_SCRIPT);
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
      onSuccess?.(connected, result.name);

      const wait = randomDelay(settings.minDelayMs, settings.maxDelayMs);
      log(`Waiting ${Math.round(wait / 1000)}s before next action…`);
      await sleepMonitored(wait, checkStop, handleWeeklyLimit);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "weekly_limit") {
      log("Automation stopped (weekly limit).");
      return { connected, stopped: true, weeklyLimitReached: true };
    }
    const isStopped =
      checkStop() ||
      (err instanceof Error &&
        (err.message === "stopped" || err.message.includes("Object has been destroyed")));
    if (isStopped) {
      log("Automation stopped.");
      return { connected, stopped: true, weeklyLimitReached };
    }
    throw err;
  } finally {
    closeAutomationWindow();
    try {
      const finalCounts = await fetchLinkedInNetworkCounts();
      onNetworkCounts?.({
        followers: finalCounts.followers,
        following: finalCounts.following,
        lastUpdated: finalCounts.lastUpdated,
      });
    } catch {}
  }

  if (weeklyLimitReached) {
    log(`Stopped at ${connected} connect(s) this run — weekly invitation limit reached.`);
    return { connected, stopped: true, weeklyLimitReached: true };
  }

  log(`Finished. ${connected} connection request(s) sent this run.`);
  return { connected, stopped: false };
}

export async function runUnfollowAutomation(
  settings: AutomationSettings,
  log: LogFn,
  onSuccess?: ActionSuccessFn,
  onNetworkCounts?: NetworkCountsFn
): Promise<{ unfollowed: number; stopped: boolean }> {
  if (isAutomationRunning()) {
    throw new Error("Automation is already running.");
  }

  stopRequested = false;
  let unfollowed = 0;

  automationWindow = createAutomationWindow("LinkXOrbit — unfollow");
  const checkStop = () => stopRequested || !automationWindow || automationWindow.isDestroyed();

  try {
    const targetUrl = settings.unfollowTarget === "following" ? FOLLOWING_URL : FOLLOWERS_URL;
    const targetLabel = settings.unfollowTarget === "following" ? "Following" : "Followers";
    log(`Opening ${targetLabel} list (${targetUrl})…`);
    await safeLoadURL(automationWindow, targetUrl);
    await sleepMonitored(4000, checkStop, () => {}, false);

    // Initial live count from the opened page
    try {
      if (settings.unfollowTarget === "following") {
        const liveFollowing = await safeExecuteScript<number | null>(EXTRACT_FOLLOWING_SCRIPT);
        if (liveFollowing !== null) {
          onNetworkCounts?.({ following: liveFollowing });
        }
      } else {
        const liveFollowers = await safeExecuteScript<number | null>(EXTRACT_FOLLOWERS_SCRIPT);
        if (liveFollowers !== null) {
          onNetworkCounts?.({ followers: liveFollowers });
        }
      }
    } catch {}

    const performUnfollowOne = async () =>
      safeExecuteScript<{
        found: boolean;
        name?: string;
        confirmed?: boolean;
        followButtonsSkipped?: number;
      }>(UNFOLLOW_ONE_FOLLOWER_SCRIPT);

    while (unfollowed < settings.maxActionsPerRun && !checkStop()) {
      let result = await performUnfollowOne();

      // If no "Following" button was visible in the current viewport, perform auto-scrolling
      if (!result?.found) {
        let foundAfterScroll = false;
        let scrollAttempts = 0;
        const maxScrollAttempts = 350; // High limit to allow searching through all 1,835+ followers!
        let lastReportedSkipped = -1;
        let lastSkippedCount = 0;
        let lastScrollHeight = 0;
        let consecutiveNoGrowth = 0;

        while (!foundAfterScroll && scrollAttempts < maxScrollAttempts && !checkStop()) {
          scrollAttempts++;
          const skipped = result?.followButtonsSkipped ?? 0;

          // Report progress so user clearly sees active search through the follower list
          if (
            scrollAttempts === 1 ||
            scrollAttempts % 5 === 0 ||
            (skipped >= lastReportedSkipped + 40 && skipped !== lastReportedSkipped)
          ) {
            const skippedText = skipped > 0 ? ` (${skipped} 'Follow' accounts skipped so far)` : "";
            log(`Searching for accounts marked 'Following'${skippedText} — auto-scrolling down (step ${scrollAttempts})…`);
            lastReportedSkipped = skipped;
          }

          const scrollRes = await safeExecuteScript<{
            scrollHeight: number;
            moreClicked: boolean;
          }>(`
            (() => {
              // Always scroll the page down
              window.scrollBy({ top: 1400, behavior: "instant" });

              // Look for the real pagination button at the bottom of the list
              const loadMoreBtn = Array.from(document.querySelectorAll("button")).find(b => {
                const t = (b.innerText || "").trim().toLowerCase();
                return (
                  t === "show more results" ||
                  b.classList.contains("scaffold-finite-scroll__load-button")
                );
              });
              let moreClicked = false;
              if (loadMoreBtn) {
                try {
                  loadMoreBtn.click();
                  moreClicked = true;
                } catch {}
              }

              return {
                scrollHeight: document.documentElement.scrollHeight,
                moreClicked
              };
            })()
          `);

          await sleepMonitored(1400, checkStop, () => {}, false);

          result = await performUnfollowOne();
          if (result?.found) {
            foundAfterScroll = true;
            break;
          }

          // Check if new accounts or document height have actually stopped growing
          const currentHeight = scrollRes?.scrollHeight ?? 0;
          if (skipped === lastSkippedCount && currentHeight === lastScrollHeight) {
            consecutiveNoGrowth++;
            if (consecutiveNoGrowth >= 10) {
              log(`Reached the very end of the ${targetLabel.toLowerCase()} list (${skipped} total accounts scanned).`);
              break;
            }
          } else {
            consecutiveNoGrowth = 0;
            lastSkippedCount = skipped;
            lastScrollHeight = currentHeight;
          }
        }

        if (!foundAfterScroll || !result?.found) {
          log(`No more accounts marked 'Following' found in ${targetLabel.toLowerCase()} list. Stopping.`);
          break;
        }
      }

      if (result && result.confirmed) {
        unfollowed += 1;
        log(`Unfollowed #${unfollowed}${result.name ? ` (${result.name})` : ""}.`);
        onSuccess?.(unfollowed, result.name);
        onNetworkCounts?.({ action: "unfollow" });

        const wait = randomDelay(settings.minDelayMs, settings.maxDelayMs);
        log(`Waiting ${Math.round(wait / 1000)}s before next action…`);
        await sleepMonitored(wait, checkStop, () => {}, false);
      } else {
        const profileName = result?.name || "profile";
        log(`Could not confirm unfollow for ${profileName} — scrolling down to next account.`);
        await safeExecuteScript(`window.scrollBy({ top: 220, behavior: "smooth" });`);
        await sleepMonitored(1000, checkStop, () => {}, false);
      }
    }
  } catch (err) {
    const isStopped =
      checkStop() ||
      (err instanceof Error &&
        (err.message === "stopped" || err.message.includes("Object has been destroyed")));
    if (isStopped) {
      log("Automation stopped.");
      return { unfollowed, stopped: true };
    }
    throw err;
  } finally {
    closeAutomationWindow();
    try {
      const finalCounts = await fetchLinkedInNetworkCounts();
      onNetworkCounts?.({
        followers: finalCounts.followers,
        following: finalCounts.following,
        lastUpdated: finalCounts.lastUpdated,
      });
    } catch {}
  }

  log(`Finished. ${unfollowed} unfollow action(s) this run.`);
  return { unfollowed, stopped: false };
}

export async function runAutomation(
  settings: AutomationSettings,
  log: LogFn,
  onSuccess?: ActionSuccessFn,
  onNetworkCounts?: NetworkCountsFn
): Promise<{
  mode: AutomationMode;
  actions: number;
  stopped: boolean;
  weeklyLimitReached?: boolean;
}> {
  if (settings.mode === "unfollow") {
    const result = await runUnfollowAutomation(settings, log, onSuccess, onNetworkCounts);
    return { mode: "unfollow", actions: result.unfollowed, stopped: result.stopped };
  }
  const result = await runConnectAutomation(settings, log, onSuccess, onNetworkCounts);
  return {
    mode: "grow",
    actions: result.connected,
    stopped: result.stopped,
    weeklyLimitReached: result.weeklyLimitReached,
  };
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
