import { create } from "zustand";
import type { McpStatus, UpdateStatus } from "@whalex/shared";
import { whalex } from "../lib/ipc";

export type SettingsTab =
  | "general"
  | "apikey"
  | "models"
  | "mcp"
  | "skills"
  | "routines"
  | "plugins"
  | "appearance"
  | "updates";

interface UiState {
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  rewindOpen: boolean;
  /** A confirm dialog is up — native browser views must yield to it. */
  confirmOpen: boolean;
  /** Artifact panel folded to a rail so the transcript gets the width back. */
  artifactCollapsed: boolean;
  /** Text pushed into the composer by another surface (e.g. plan Revise). */
  composerDraft: string | null;
  /** Side-panel width in px, draggable via the divider. */
  artifactWidth: number;
  mcpStatus: McpStatus[];
  updateStatus: UpdateStatus;
  openSettings(tab?: SettingsTab): void;
  closeSettings(): void;
  openRewind(): void;
  setConfirmOpen(open: boolean): void;
  closeRewind(): void;
  toggleArtifactCollapsed(): void;
  setComposerDraft(text: string | null): void;
  setArtifactWidth(px: number): void;
  listen(): void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  settingsTab: "general",
  artifactCollapsed: false,
  composerDraft: null,
  artifactWidth: 560,
  rewindOpen: false,
  confirmOpen: false,
  mcpStatus: [],
  updateStatus: { state: "idle" },

  openSettings(tab = "general") {
    set({ settingsOpen: true, settingsTab: tab });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  setConfirmOpen(open) {
    set({ confirmOpen: open });
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
  setComposerDraft(text) {
    set({ composerDraft: text });
  },
  setArtifactWidth(px) {
    set({ artifactWidth: Math.max(340, Math.min(940, px)) });
  },
  listen() {
    whalex.on("mcp:status", (statuses) => set({ mcpStatus: statuses }));
    whalex.on("update:status", (status) => set({ updateStatus: status }));
    void whalex.invoke("mcp:status", undefined).then((s) => set({ mcpStatus: s }));
  },
}));
