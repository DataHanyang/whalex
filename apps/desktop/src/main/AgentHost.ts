import type { BrowserWindow } from "electron";
import {
  AgentLoop,
  OpenAICompatProvider,
  PermissionEngine,
  SessionStore,
  createBuiltinRegistry,
} from "@whalex/core";
import {
  resolveModelInfo,
  type AgentEvent,
  type AgentEventEnvelope,
  type PermissionResponse,
  type TranscriptItem,
} from "@whalex/shared";
import type { SettingsManager } from "./settings.js";
import type { SecretVault } from "./secrets.js";

interface HostedSession {
  store: SessionStore;
  loop: AgentLoop;
  engine: PermissionEngine;
  seq: number;
}

/**
 * Owns core agent instances per session and pumps their event streams to
 * the renderer. High-frequency deltas are micro-batched (~16ms) so the IPC
 * channel isn't flooded at DeepSeek token rates.
 */
export class AgentHost {
  private sessions = new Map<string, HostedSession>();
  private queue: AgentEventEnvelope[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private settings: SettingsManager,
    private vault: SecretVault,
  ) {}

  async start(
    cwd: string,
    resumeSessionId?: string,
  ): Promise<{ sessionId: string; cwd: string; transcript: TranscriptItem[] }> {
    let store: SessionStore | null = null;
    if (resumeSessionId) {
      store = await SessionStore.load(cwd, resumeSessionId);
    }
    store ??= SessionStore.create(cwd);

    const s = this.settings.get();
    const engine = new PermissionEngine(s.permissions, {
      persistRule: (rule) => this.settings.addAllowRule(rule),
    });
    const provider = await this.createProvider();
    const loop = new AgentLoop({
      provider,
      registry: createBuiltinRegistry(),
      permissions: engine,
      session: store,
      modelInfo: resolveModelInfo(s.defaultModel),
      temperature: s.temperature,
    });
    this.sessions.set(store.sessionId, { store, loop, engine, seq: 0 });
    return { sessionId: store.sessionId, cwd, transcript: store.transcript() };
  }

  private async createProvider(): Promise<OpenAICompatProvider> {
    const s = this.settings.get();
    const providerSettings =
      s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0];
    if (!providerSettings) throw new Error("No provider configured.");
    const apiKey = providerSettings.apiKeyRef
      ? this.vault.get(providerSettings.apiKeyRef)
      : null;
    return new OpenAICompatProvider({ baseUrl: providerSettings.baseUrl, apiKey });
  }

  send(sessionId: string, text: string, model: string): void {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) throw new Error(`Unknown session: ${sessionId}`);
    if (hosted.loop.isRunning) throw new Error("Session is already running.");
    hosted.engine.setRules(this.settings.get().permissions);
    hosted.loop.setModel(resolveModelInfo(model));

    void (async () => {
      try {
        for await (const event of hosted.loop.run(text)) {
          this.emit(sessionId, hosted, event);
        }
      } catch (err) {
        this.emit(sessionId, hosted, {
          type: "error",
          code: "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
        this.emit(sessionId, hosted, { type: "done", stopReason: "error" });
      }
    })();
  }

  abort(sessionId: string): void {
    this.sessions.get(sessionId)?.loop.abort();
  }

  respondPermission(response: PermissionResponse): void {
    for (const hosted of this.sessions.values()) {
      if (hosted.engine.resolve(response)) return;
    }
  }

  disposeAll(): void {
    for (const hosted of this.sessions.values()) hosted.loop.abort();
    this.sessions.clear();
  }

  private emit(sessionId: string, hosted: HostedSession, event: AgentEvent): void {
    this.queue.push({ sessionId, seq: hosted.seq++, event });
    // Flush immediately for interactive events; micro-batch the rest.
    if (
      event.type === "permission-request" ||
      event.type === "done" ||
      event.type === "error"
    ) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 16);
    }
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;
    const win = this.getWindow();
    const batch = this.queue;
    this.queue = [];
    if (win && !win.isDestroyed()) {
      for (const envelope of batch) win.webContents.send("agent:event", envelope);
    }
  }
}
