import { create } from "zustand";
import type { ModelInfo, Settings } from "@whalex/shared";
import { whalex } from "../lib/ipc";
import { initI18n, switchLanguage } from "../i18n";

interface AppState {
  ready: boolean;
  version: string;
  settings: Settings | null;
  /** providerId secret ref → masked tail or null. */
  secrets: Record<string, string | null>;
  models: ModelInfo[];
  init(): Promise<void>;
  updateSettings(partial: Partial<Settings>): Promise<void>;
  refreshModels(): Promise<void>;
  applyTheme(theme: Settings["theme"]): void;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  version: "",
  settings: null,
  secrets: {},
  models: [],

  async init() {
    const state = await whalex.invoke("app:getState", undefined);
    initI18n(state.settings.language);
    get().applyTheme(state.settings.theme);
    set({
      ready: true,
      version: state.version,
      settings: state.settings,
      secrets: state.secrets,
    });
    if (state.settings.onboardingComplete) {
      void get().refreshModels();
    }
  },

  async updateSettings(partial) {
    const settings = await whalex.invoke("settings:update", partial);
    if (partial.language) switchLanguage(settings.language);
    if (partial.theme) get().applyTheme(settings.theme);
    set({ settings });
  },

  async refreshModels() {
    const settings = get().settings;
    if (!settings) return;
    try {
      const models = await whalex.invoke("models:list", {
        providerId: settings.activeProviderId,
      });
      if (models.length > 0) set({ models });
    } catch {
      // Offline or key missing — model selector falls back to the default id.
    }
  },

  applyTheme(theme) {
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.dataset.theme = resolved;
  },
}));
