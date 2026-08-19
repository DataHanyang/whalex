import { RoutineScheduleSchema, type RoutineSchedule } from "@whalex/shared";
import type { OpenAICompatProvider } from "@whalex/core";

/**
 * Turns a natural-language routine instruction into a concrete schedule.
 * The user never picks a date/time in the UI — they write "every morning at
 * 9" in the prompt and the model extracts it here. When the prompt names no
 * time, the schedule is "manual": the routine only runs from "Run now".
 */
export async function parseRoutine(
  prompt: string,
  provider: OpenAICompatProvider,
  model: string,
): Promise<{ name: string; schedule: RoutineSchedule }> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nowStr =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())} (${dayNames[now.getDay()]}), local time`;

  const system =
    "You convert a routine instruction into a run schedule. Reply with JSON only, no prose.";
  const user =
    `Current local time: ${nowStr}.\n` +
    `Routine instruction:\n"""${prompt.slice(0, 2000)}"""\n\n` +
    `Extract WHEN this routine should run and a short title. Reply with JSON only:\n` +
    `{"name":"<2-4 word title>","schedule":<one option below>}\n` +
    `schedule options (times are 24h, local):\n` +
    `- {"kind":"interval","minutes":N}   // "every N minutes/hours" (min 5)\n` +
    `- {"kind":"daily","time":"HH:MM"}\n` +
    `- {"kind":"weekly","weekday":0,"time":"HH:MM"}   // weekday 0=Sunday..6=Saturday\n` +
    `- {"kind":"once","at":"YYYY-MM-DDTHH:MM"}   // a single future moment\n` +
    `- {"kind":"manual"}   // the instruction names no time / not recurring\n` +
    `If there is no explicit timing, use manual.`;

  let text = "";
  try {
    for await (const d of provider.streamChat({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      maxTokens: 200,
      signal: AbortSignal.timeout(20_000),
    })) {
      if (d.type === "text") text += d.text;
    }
  } catch {
    return { name: fallbackName(prompt), schedule: { kind: "manual" } };
  }

  try {
    const m = /\{[\s\S]*\}/.exec(text);
    const obj = JSON.parse(m ? m[0] : text) as { name?: unknown; schedule?: unknown };
    let sched = obj.schedule as Record<string, unknown> | undefined;
    // The model returns a local ISO string for one-shots; store epoch ms.
    if (sched && sched.kind === "once" && typeof sched.at === "string") {
      const ms = new Date(sched.at).getTime();
      sched = Number.isNaN(ms) || ms <= Date.now() ? { kind: "manual" } : { kind: "once", at: ms };
    }
    const parsed = RoutineScheduleSchema.safeParse(sched);
    const schedule: RoutineSchedule = parsed.success ? parsed.data : { kind: "manual" };
    const name =
      typeof obj.name === "string" && obj.name.trim()
        ? obj.name.trim().slice(0, 40)
        : fallbackName(prompt);
    return { name, schedule };
  } catch {
    return { name: fallbackName(prompt), schedule: { kind: "manual" } };
  }
}

function fallbackName(prompt: string): string {
  const words = prompt.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  return words.slice(0, 40) || "Routine";
}
