import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionMeta, Todo, TranscriptItem } from "@whalex/shared";
import type { ChatMessage } from "../providers/Provider.js";
import type { AssembledToolCall } from "../agent/ToolCallAssembler.js";

export type SessionRecord =
  | { type: "meta"; sessionId: string; cwd: string; createdAt: number; title: string }
  | { type: "user"; id: string; text: string; ts: number }
  | {
      type: "assistant";
      id: string;
      text: string;
      reasoning: string;
      toolCalls: AssembledToolCall[];
      interrupted?: boolean;
      ts: number;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName: string;
      args: unknown;
      ok: boolean;
      denied?: boolean;
      output: string;
      durationMs: number;
      diff?: { path: string; oldText: string; newText: string };
      ts: number;
    }
  | { type: "todos"; todos: Todo[]; ts: number }
  | {
      type: "subagent";
      agentRunId: string;
      agentType: string;
      label: string;
      result: string;
      toolCount: number;
      tokens: number;
      durationMs: number;
      ts: number;
    }
  | {
      type: "artifact";
      artifactId: string;
      title: string;
      artifactKind: string;
      ts: number;
    }
  | { type: "workflow"; workflowId: string; name: string; ts: number }
  | { type: "compaction"; summary: string; upto: number; beforePct: number; afterPct: number; ts: number }
  | { type: "rewind"; boundary: number; ts: number }
  | { type: "title"; title: string; ts: number };

export function whalexHome(): string {
  return path.join(os.homedir(), ".whalex");
}

export function sanitizeCwd(cwd: string): string {
  return path.resolve(cwd).replace(/[^a-zA-Z0-9가-힣]/g, "-");
}

function projectDir(cwd: string): string {
  return path.join(whalexHome(), "projects", sanitizeCwd(cwd));
}

/**
 * Append-only JSONL persistence for one session. The file is never
 * rewritten; resume = replay every line.
 */
export class SessionStore {
  readonly records: SessionRecord[] = [];
  private filePath: string;
  private ephemeral = false;

  private constructor(
    readonly sessionId: string,
    readonly cwd: string,
  ) {
    this.filePath = path.join(projectDir(cwd), `${sessionId}.jsonl`);
  }

  static create(cwd: string): SessionStore {
    const store = new SessionStore(randomUUID(), cwd);
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    store.append({
      type: "meta",
      sessionId: store.sessionId,
      cwd,
      createdAt: Date.now(),
      title: "New session",
    });
    return store;
  }

  /**
   * In-memory session for subagents and workflow agents: keeps the same
   * message/transcript machinery without cluttering the project's session
   * list. Nothing is written to disk.
   */
  static createEphemeral(cwd: string): SessionStore {
    const store = new SessionStore(randomUUID(), cwd);
    store.ephemeral = true;
    return store;
  }

  static async delete(cwd: string, sessionId: string): Promise<void> {
    const file = path.join(projectDir(cwd), `${sessionId}.jsonl`);
    await fsp.rm(file, { force: true });
  }

  static async load(cwd: string, sessionId: string): Promise<SessionStore | null> {
    const store = new SessionStore(sessionId, cwd);
    try {
      const raw = await fsp.readFile(store.filePath, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          store.records.push(JSON.parse(line) as SessionRecord);
        } catch {
          // skip corrupt line rather than losing the whole session
        }
      }
      return store.records.length > 0 ? store : null;
    } catch {
      return null;
    }
  }

  static async list(cwd?: string): Promise<SessionMeta[]> {
    const base = path.join(whalexHome(), "projects");
    const dirs: string[] = [];
    if (cwd) {
      dirs.push(projectDir(cwd));
    } else {
      try {
        for (const d of await fsp.readdir(base)) dirs.push(path.join(base, d));
      } catch {
        return [];
      }
    }
    const metas: SessionMeta[] = [];
    for (const dir of dirs) {
      let files: string[];
      try {
        files = (await fsp.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of files) {
        const full = path.join(dir, file);
        try {
          const raw = await fsp.readFile(full, "utf8");
          const lines = raw.split("\n").filter((l) => l.trim());
          if (lines.length === 0) continue;
          const first = JSON.parse(lines[0]!) as SessionRecord;
          if (first.type !== "meta") continue;
          let title = first.title;
          let messageCount = 0;
          let updatedAt = first.createdAt;
          for (const line of lines) {
            try {
              const rec = JSON.parse(line) as SessionRecord;
              if (rec.type === "title") title = rec.title;
              if (rec.type === "user" || rec.type === "assistant") {
                messageCount++;
                updatedAt = rec.ts;
              }
            } catch {
              // ignore
            }
          }
          if (messageCount === 0) continue;
          metas.push({
            sessionId: first.sessionId,
            cwd: first.cwd,
            title,
            createdAt: first.createdAt,
            updatedAt,
            messageCount,
          });
        } catch {
          // ignore unreadable session
        }
      }
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return metas;
  }

  append(record: SessionRecord): void {
    this.records.push(record);
    if (!this.ephemeral) {
      fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n", "utf8");
    }
    if (record.type === "user" && this.records.filter((r) => r.type === "user").length === 1) {
      const title = record.text.replace(/\s+/g, " ").trim().slice(0, 60);
      this.append({ type: "title", title, ts: Date.now() });
    }
  }

  /**
   * The live record view after applying rewinds. A rewind record truncates
   * the accumulated list to `boundary` entries; subsequent records continue
   * on top, so continued conversation and repeated rewinds compose naturally.
   */
  effectiveRecords(): SessionRecord[] {
    const eff: SessionRecord[] = [];
    for (const rec of this.records) {
      if (rec.type === "rewind") {
        eff.length = Math.min(eff.length, rec.boundary);
      } else {
        eff.push(rec);
      }
    }
    return eff;
  }

  /** Rewind the conversation to keep only the first `boundary` effective records. */
  rewindTo(boundary: number): void {
    this.append({ type: "rewind", boundary, ts: Date.now() });
  }

  /**
   * Records a compaction: everything up to now is replaced by `summary` when
   * building the next request. Append-only — the summarized records stay in
   * the file for the UI and for audit.
   */
  appendCompaction(summary: string, beforePct = 0, afterPct = 0): void {
    this.append({
      type: "compaction",
      summary,
      upto: this.records.length,
      beforePct,
      afterPct,
      ts: Date.now(),
    });
  }

  /**
   * Rebuilds the OpenAI wire-format message list. reasoning_content is
   * deliberately dropped — DeepSeek 400s if it is sent back. If the session
   * has been compacted, records before the last compaction are replaced by
   * the summary.
   */
  messages(): ChatMessage[] {
    const records = this.effectiveRecords();
    const msgs: ChatMessage[] = [];
    let startIndex = 0;
    let lastCompaction: (SessionRecord & { type: "compaction" }) | null = null;
    records.forEach((rec, i) => {
      if (rec.type === "compaction") {
        lastCompaction = rec;
        startIndex = i + 1;
      }
    });
    if (lastCompaction) {
      msgs.push({
        role: "user",
        content: `[Summary of the earlier conversation]\n\n${(lastCompaction as { summary: string }).summary}`,
      });
    }
    for (const rec of records.slice(startIndex)) {
      switch (rec.type) {
        case "user":
          msgs.push({ role: "user", content: rec.text });
          break;
        case "assistant":
          msgs.push({
            role: "assistant",
            content: rec.text || null,
            tool_calls:
              rec.toolCalls.length > 0
                ? rec.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function" as const,
                    function: { name: c.name, arguments: c.argsJson },
                  }))
                : undefined,
          });
          break;
        case "tool_result":
          msgs.push({
            role: "tool",
            tool_call_id: rec.toolCallId,
            content: rec.output,
          });
          break;
        default:
          break;
      }
    }
    // A crash or hard interrupt can leave an assistant tool_calls message
    // without its tool responses; the API rejects such history outright.
    // Synthesize an interrupted-result for every unanswered call.
    const answered = new Set(
      msgs.filter((m) => m.role === "tool").map((m) => (m as { tool_call_id?: string }).tool_call_id),
    );
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i] as { role: string; tool_calls?: Array<{ id: string }> };
      if (m.role !== "assistant" || !m.tool_calls) continue;
      let insertAt = i + 1;
      while (insertAt < msgs.length && msgs[insertAt]?.role === "tool") insertAt++;
      for (const call of m.tool_calls) {
        if (answered.has(call.id)) continue;
        msgs.splice(insertAt, 0, {
          role: "tool",
          tool_call_id: call.id,
          content: "[interrupted — the app closed before this tool finished; no result was recorded]",
        });
        insertAt++;
      }
    }
    return msgs;
  }

  /** Rebuilds the renderer transcript for session resume. */
  transcript(): TranscriptItem[] {
    const items: TranscriptItem[] = [];
    for (const rec of this.effectiveRecords()) {
      switch (rec.type) {
        case "user":
          items.push({ kind: "user", id: rec.id, text: rec.text, ts: rec.ts });
          break;
        case "assistant":
          if (rec.text || rec.reasoning) {
            items.push({
              kind: "assistant",
              id: rec.id,
              text: rec.text,
              reasoning: rec.reasoning,
              streaming: false,
              interrupted: rec.interrupted ?? false,
              ts: rec.ts,
            });
          }
          break;
        case "tool_result":
          items.push({
            kind: "tool",
            id: rec.toolCallId,
            toolName: rec.toolName,
            args: rec.args,
            state: rec.denied ? "denied" : rec.ok ? "ok" : "error",
            output: rec.output,
            durationMs: rec.durationMs,
            diff: rec.diff,
            ts: rec.ts,
          });
          break;
        case "todos":
          items.push({ kind: "todos", id: `todos-${rec.ts}`, todos: rec.todos, ts: rec.ts });
          break;
        case "subagent":
          items.push({
            kind: "subagent",
            id: rec.agentRunId,
            agentType: rec.agentType,
            label: rec.label,
            state: "done",
            toolCount: rec.toolCount,
            tokens: rec.tokens,
            result: rec.result,
            durationMs: rec.durationMs,
            ts: rec.ts,
          });
          break;
        case "artifact":
          items.push({
            kind: "artifact",
            id: rec.artifactId,
            artifactId: rec.artifactId,
            title: rec.title,
            artifactKind: rec.artifactKind,
            ts: rec.ts,
          });
          break;
        case "workflow":
          items.push({
            kind: "workflow",
            id: rec.workflowId,
            workflowId: rec.workflowId,
            name: rec.name,
            ts: rec.ts,
          });
          break;
        case "compaction":
          items.push({
            kind: "compaction",
            id: `compaction-${rec.ts}`,
            beforePct: rec.beforePct,
            afterPct: rec.afterPct,
            ts: rec.ts,
          });
          break;
        default:
          break;
      }
    }
    return items;
  }
}
