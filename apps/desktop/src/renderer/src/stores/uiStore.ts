import { create } from "zustand";
import type { McpStatus, UpdateStatus } from "@whalex/shared";
import { whalex } from "../lib/ipc";

export type SettingsTab =
  | "general"
  | "apikey"
  | "models"
  | "mcp"
  | "skills"
  | "plugins"
  | "appearance"
  | "updates";

interface UiState {
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  mcpStatus: McpStatus[];
  updateStatus: UpdateStatus;
  openSettings(tab?: SettingsTab): void;
  closeSettings(): void;
  listen(): void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  settingsTab: "general",
  mcpStatus: [],
  updateStatus: { state: "idle" },

  openSettings(tab = "general") {
    set({ settingsOpen: true, settingsTab: tab });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  listen() {
    whalex.on("mcp:status", (statuses) => set({ mcpStatus: statuses }));
    whalex.on("update:status", (status) => set({ updateStatus: status }));
    void whalex.invoke("mcp:status", undefined).then((s) => set({ mcpStatus: s }));
  },
}));
