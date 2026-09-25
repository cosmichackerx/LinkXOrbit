import Store from "electron-store";
import type { AutomationSettings, AutomationMode } from "./automation";

type StoredSettings = Partial<AutomationSettings> & {
  maxConnects?: number;
};

export const defaultSettings: AutomationSettings = {
  mode: "grow",
  minDelayMs: 45_000,
  maxDelayMs: 90_000,
  maxActionsPerRun: 15,
};

export function normalizeSettings(raw: StoredSettings | undefined): AutomationSettings {
  if (!raw) return { ...defaultSettings };
  const mode: AutomationMode = raw.mode === "unfollow" ? "unfollow" : "grow";
  return {
    mode,
    minDelayMs: raw.minDelayMs ?? defaultSettings.minDelayMs,
    maxDelayMs: raw.maxDelayMs ?? defaultSettings.maxDelayMs,
    maxActionsPerRun:
      raw.maxActionsPerRun ?? raw.maxConnects ?? defaultSettings.maxActionsPerRun,
  };
}

export function createSettingsStore(): Store<{ settings: AutomationSettings }> {
  const store = new Store<{ settings: StoredSettings }>({
    defaults: { settings: defaultSettings },
  });
  const normalized = normalizeSettings(store.get("settings"));
  store.set("settings", normalized);
  return store as Store<{ settings: AutomationSettings }>;
}
