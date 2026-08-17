import type { ProviderClient } from "../providers/Provider.js";
import type { SessionStore } from "../session/SessionStore.js";
import { ContextManager } from "./ContextManager.js";

const SUMMARY_PROMPT = `You are compacting a long coding-agent conversation to free up context.
Summarize everything below into a compact but complete brief that lets the agent continue seamlessly. Include:
- The user's overall goal and any specific requirements or constraints
- What has been done so far (files created/edited, commands run and their outcomes)
- Current state: what is working, what is broken, what is in progress
- Key facts learned about the codebase (paths, structure, conventions)
- Any pending todos or next steps

If the input begins with a "[Summary of the conversation before this segment]", fold it into a single updated brief together with the newer activity — do not discard earlier facts.
Be concrete — keep file paths, function names, and decisions. Omit chit-chat. Output only the brief.`;

export interface CompactResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

/**
 * Summarizes the part of a session since the last compaction into a single
 * brief. Returns the summary text; the caller records it (with accurate
 * before/after percentages) via SessionStore.appendCompaction, and
 * SessionStore.messages() then replaces the summarized turns with it.
 *
 * Only the segment *after* the previous compaction is re-summarized (the prior
 * summary is prepended so nothing is lost), so cost stays bounded instead of
 * growing with the whole session. The input is tail-truncated to roughly half
 * the model window so the summary call itself can't overflow — the very
 * failure that triggered compaction.
 */
export async function compactSession(
  provider: ProviderClient,
  session: SessionStore,
  model: string,
  signal: AbortSignal,
  opts: { contextWindow?: number } = {},
): Promise<CompactResult> {
  const transcript = renderTranscriptForSummary(session, opts.contextWindow);
  if (!transcript.trim()) return { ok: false, error: "Nothing new to compact." };

  let summary = "";
  try {
    for await (const delta of provider.streamChat({
      model,
      messages: [
        { role: "system", content: SUMMARY_PROMPT },
        { role: "user", content: transcript },
      ],
      temperature: 0.2,
      maxTokens: 4096,
      signal,
    })) {
      if (delta.type === "text") summary += delta.text;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!summary.trim()) return { ok: false, error: "Summary was empty." };
  return { ok: true, summary };
}

function renderTranscriptForSummary(session: SessionStore, contextWindow = 128_000): string {
  // Honor rewinds (records the user discarded must not resurrect via the
  // summary) and only re-summarize since the last compaction.
  const records = session.effectiveRecords();
  let start = 0;
  let priorSummary = "";
  records.forEach((rec, i) => {
    if (rec.type === "compaction") {
      start = i + 1;
      priorSummary = rec.summary;
    }
  });

  const parts: string[] = [];
  for (const rec of records.slice(start)) {
    switch (rec.type) {
      case "user":
        parts.push(`USER: ${rec.text}`);
        break;
      case "assistant":
        if (rec.text) parts.push(`ASSISTANT: ${rec.text}`);
        for (const c of rec.toolCalls) parts.push(`TOOL_CALL ${c.name}: ${c.argsJson}`);
        break;
      case "tool_result":
        parts.push(`TOOL_RESULT (${rec.ok ? "ok" : "error"}): ${rec.output.slice(0, 2000)}`);
        break;
      default:
        break;
    }
  }
  let body = parts.join("\n\n");
  if (!body.trim()) return "";

  // Tail-truncate the new activity so priorSummary + activity stays within
  // ~half the window; the summary call must not itself overflow.
  const budgetTokens = Math.floor(contextWindow * 0.5);
  const reserve = ContextManager.estimateTokens(priorSummary) + 400;
  const activityBudget = Math.max(1000, budgetTokens - reserve);
  if (ContextManager.estimateTokens(body) > activityBudget) {
    // ~3 chars/token is between the ASCII (4) and CJK (1.5) heuristics — a
    // conservative cap that keeps the most recent activity.
    const keepChars = activityBudget * 3;
    body = "…(earlier activity truncated — see the previous summary)…\n\n" + body.slice(-keepChars);
  }

  return priorSummary
    ? `[Summary of the conversation before this segment]\n${priorSummary}\n\n[Activity since that summary]\n${body}`
    : body;
}
