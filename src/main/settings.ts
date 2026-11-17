import Store from "electron-store";
import type { AutomationSettings, AutomationMode, UnfollowTarget } from "./automation";

type StoredSettings = Partial<AutomationSettings> & {
  maxConnects?: number;
};

export type AutomationStats = {
  totalSucceeded: number;
  growSucceeded: number;
  unfollowSucceeded: number;
};

export type NetworkCounts = {
  followers: number | null;
  following: number | null;
  lastUpdated: string | null;
};

export const defaultSettings: AutomationSettings = {
  mode: "grow",
  unfollowTarget: "followers",
  minDelayMs: 45_000,
  maxDelayMs: 90_000,
  maxActionsPerRun: 15,
};

export const defaultStats: AutomationStats = {
  totalSucceeded: 0,
  growSucceeded: 0,
  unfollowSucceeded: 0,
};

export const defaultNetworkCounts: NetworkCounts = {
  followers: null,
  following: null,
  lastUpdated: null,
};

export function normalizeSettings(raw: StoredSettings | undefined): AutomationSettings {
  if (!raw) return { ...defaultSettings };
  const mode: AutomationMode = raw.mode === "unfollow" ? "unfollow" : "grow";
  const unfollowTarget: UnfollowTarget =
    raw.unfollowTarget === "following" ? "following" : "followers";
  return {
    mode,
    unfollowTarget,
    minDelayMs: raw.minDelayMs ?? defaultSettings.minDelayMs,
    maxDelayMs: raw.maxDelayMs ?? defaultSettings.maxDelayMs,
    maxActionsPerRun:
      raw.maxActionsPerRun ?? raw.maxConnects ?? defaultSettings.maxActionsPerRun,
  };
}

export function createSettingsStore(): Store<{
  settings: AutomationSettings;
  stats: AutomationStats;
  networkCounts: NetworkCounts;
}> {
  const store = new Store<{
    settings: StoredSettings;
    stats: AutomationStats;
    networkCounts: NetworkCounts;
  }>({
    defaults: {
      settings: defaultSettings,
      stats: defaultStats,
      networkCounts: defaultNetworkCounts,
    },
  });
  const normalized = normalizeSettings(store.get("settings"));
  store.set("settings", normalized);
  if (!store.get("stats")) {
    store.set("stats", defaultStats);
  }
  if (!store.get("networkCounts")) {
    store.set("networkCounts", defaultNetworkCounts);
  }
  return store as Store<{
    settings: AutomationSettings;
    stats: AutomationStats;
    networkCounts: NetworkCounts;
  }>;
}

export function getStoredNetworkCounts(store: Store<any>): NetworkCounts {
  return store.get("networkCounts") ?? defaultNetworkCounts;
}

export function saveStoredNetworkCounts(
  store: Store<any>,
  counts: Partial<NetworkCounts>
): NetworkCounts {
  const current = getStoredNetworkCounts(store);
  const updated: NetworkCounts = {
    followers: counts.followers !== undefined ? counts.followers : current.followers,
    following: counts.following !== undefined ? counts.following : current.following,
    lastUpdated: counts.lastUpdated !== undefined ? counts.lastUpdated : new Date().toISOString(),
  };
  store.set("networkCounts", updated);
  return updated;
}
