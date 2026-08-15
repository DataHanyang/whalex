import type { ProviderClient } from "../providers/Provider.js";
import type { SessionStore } from "../session/SessionStore.js";

const SUMMARY_PROMPT = `You are compacting a long coding-agent conversation to free up context.
Summarize everything below into a compact but complete brief that lets the agent continue seamlessly. Include:
- The user's overall goal and any specific requirements or constraints
- What has been done so far (files created/edited, commands run and their outcomes)
- Current state: what is working, what is broken, what is in progress
- Key facts learned about the codebase (paths, structure, conventions)
- Any pending todos or next steps

Be concrete — keep file paths, function names, and decisions. Omit chit-chat. Output only the brief.`;

/**
 * Summarizes the older part of a session into a single brief, so the running
 * conversation fits back inside the context window. The summary is recorded
 * as a compaction record in the JSONL; SessionStore.messages() replaces the
 * summarized turns with it on the next request.
 */
export async function compactSession(
  provider: ProviderClient,
  session: SessionStore,
  model: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const transcript = renderTranscriptForSummary(session);
  if (!transcript.trim()) return { ok: false, error: "Nothing to compact." };

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
  session.appendCompaction(summary);
  return { ok: true };
}

function renderTranscriptForSummary(session: SessionStore): string {
  const parts: string[] = [];
  for (const rec of session.records) {
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
  return parts.join("\n\n");
}
