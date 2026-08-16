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
  rewindOpen: boolean;
  /** Artifact panel folded to a rail so the transcript gets the width back. */
  artifactCollapsed: boolean;
  mcpStatus: McpStatus[];
  updateStatus: UpdateStatus;
  openSettings(tab?: SettingsTab): void;
  closeSettings(): void;
  openRewind(): void;
  closeRewind(): void;
  toggleArtifactCollapsed(): void;
  listen(): void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  settingsTab: "general",
  artifactCollapsed: false,
  rewindOpen: false,
  mcpStatus: [],
  updateStatus: { state: "idle" },

  openSettings(tab = "general") {
    set({ settingsOpen: true, settingsTab: tab });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  openRewind() {
    set({ rewindOpen: true });
  },
  closeRewind() {
    set({ rewindOpen: false });
  },
  toggleArtifactCollapsed() {
    set((s) => ({ artifactCollapsed: !s.artifactCollapsed }));
  },
  listen() {
    whalex.on("mcp:status", (statuses) => set({ mcpStatus: statuses }));
    whalex.on("update:status", (status) => set({ updateStatus: status }));
    void whalex.invoke("mcp:status", undefined).then((s) => set({ mcpStatus: s }));
  },
}));
