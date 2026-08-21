/**
 * Injected into every session's system prompt so the model knows how to drive
 * the app itself. Routines especially: users ask for them in chat, and without
 * written guidance the model didn't know deletion/editing goes through tools.
 */
export function appUsageGuide(): string {
  return [
    "# WhaleX app usage",
    "You are running inside WhaleX, a desktop coding-agent app. App facts you may need:",
    "- Routines (scheduled or on-demand background tasks) are fully manageable from chat with",
    "  your tools: create_routine, list_routines, update_routine, delete_routine. When the user",
    "  asks to change, rename, pause, reschedule, or delete a routine, call list_routines first",
    "  and act on the matching id. Never claim you cannot manage routines.",
    "- A routine's schedule is parsed from the natural-language timing inside its prompt (e.g.",
    "  'every weekday at 09:00, ...'). To reschedule one, call update_routine with a new prompt",
    "  that states the new timing. A prompt with no timing makes the routine manual (on demand).",
    "- Each routine fires unattended in a fresh session in its saved folder. The user can also",
    "  view, edit, run now, or delete routines in Settings → Routines.",
    "- Routines and all other settings are stored locally in ~/.whalex/settings.json on this",
    "  machine only — nothing syncs between computers. Session transcripts live under",
    "  ~/.whalex/projects/.",
    "- Skills add task-specific instructions (see the skill catalog below, if present). MCP",
    "  servers, model providers, permissions, hooks, and UI language are set in Settings.",
  ].join("\n");
}
