import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleHelp, CornerDownLeft } from "lucide-react";
import type { UserQuestion } from "@whalex/shared";
import { useSessionStore } from "../stores/sessionStore";

/**
 * The agent's interview card, pinned above the composer. The agent batches up
 * to four questions in one call; the card walks the user through them one at a
 * time — pick (or type) an answer and the next question slides in — and only
 * when the last one is answered does the whole set go back to the agent.
 */
export function QuestionCard({ request }: { request: UserQuestion }) {
  const { t } = useTranslation();
  const answer = useSessionStore((s) => s.answerQuestion);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");

  const total = request.questions.length;
  const q = request.questions[Math.min(step, total - 1)];
  if (!q) return null;

  const submitStep = (value: string) => {
    const next = [...answers, value];
    if (step + 1 >= total) {
      // All answered — hand the full transcript of the interview back.
      const combined = request.questions
        .map((item, i) => `${item.question} → ${next[i] ?? ""}`)
        .join("\n");
      answer(request.id, combined);
    } else {
      setAnswers(next);
      setStep(step + 1);
      setPicked([]);
      setOther("");
    }
  };

  /**
   * Multi-select picks and the free-text "other" field are one answer, not
   * two competing ones — submitting from either the button or the text field
   * sends everything currently selected plus whatever was typed.
   */
  const submitCombined = () => {
    const parts = [...(q.multiSelect ? picked : []), other.trim()].filter(Boolean);
    if (parts.length) submitStep(parts.join(", "));
  };

  return (
    <div className="my-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-accent">
        <CircleHelp size={14} />
        {t("question.title")}
        {total > 1 && (
          <span className="ml-auto flex items-center gap-1.5">
            {request.questions.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i < step ? "w-4 bg-ok" : i === step ? "w-6 bg-accent" : "w-4 bg-border"
                }`}
              />
            ))}
            <span className="ml-1 text-[11px] tabular-nums text-faint">
              {step + 1}/{total}
            </span>
          </span>
        )}
      </div>

      {step > 0 && (
        <div className="mb-2 space-y-0.5">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11.5px] text-faint">
              <Check size={11} className="shrink-0 text-ok" />
              <span className="truncate">
                {request.questions[i]?.question} — <span className="text-muted">{a}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 text-[13.5px] leading-relaxed">{q.question}</div>

      <div className="flex flex-col gap-1.5">
        {q.options.map((o) => {
          const on = picked.includes(o.label);
          return (
            <button
              key={o.label}
              onClick={() =>
                q.multiSelect
                  ? setPicked((p) => (on ? p.filter((x) => x !== o.label) : [...p, o.label]))
                  : submitStep(o.label)
              }
              className={`rounded-lg border px-3 py-2 text-left ${
                on
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface hover:border-accent hover:bg-accent-soft"
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                {q.multiSelect && (
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded border ${
                      on ? "border-accent bg-accent" : "border-border"
                    }`}
                  />
                )}
                {o.label}
              </span>
              {o.description && (
                <span className="mt-0.5 block text-[11.5px] text-faint">{o.description}</span>
              )}
            </button>
          );
        })}
        {q.multiSelect && (
          <button
            onClick={submitCombined}
            disabled={!picked.length && !other.trim()}
            className="mt-1 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {t("question.submit")} {picked.length > 0 && `(${picked.length})`}
          </button>
        )}
      </div>

      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitCombined();
        }}
      >
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder={t("question.other")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!other.trim()}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          <CornerDownLeft size={12} />
        </button>
      </form>
    </div>
  );
}
