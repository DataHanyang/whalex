import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    // Bundle workspace packages; keep real node deps external.
    plugins: [externalizeDepsPlugin({ exclude: ["@whalex/core", "@whalex/shared"] })],
  },
  preload: {
    // Bundle @whalex/shared (a workspace devDependency) so the preload's
    // channel whitelist, sourced from IPC_INVOKE/IPC_EVENTS, resolves at
    // runtime in packaged builds too.
    plugins: [externalizeDepsPlugin({ exclude: ["@whalex/shared"] })],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
