import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, CornerDownLeft } from "lucide-react";
import type { UserQuestion } from "@whalex/shared";
import { useSessionStore } from "../stores/sessionStore";

/**
 * The agent's question to the user, as a card with one-click options — the
 * counterpart of the permission card, for decisions rather than approvals.
 * A free-text row is always offered so the options never box the user in.
 */
export function QuestionCard({ request }: { request: UserQuestion }) {
  const { t } = useTranslation();
  const answer = useSessionStore((s) => s.answerQuestion);
  const [other, setOther] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const multi = request.multiSelect;

  return (
    <div className="my-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-accent">
        <CircleHelp size={14} />
        {t("question.title")}
      </div>
      <div className="mb-3 text-[13.5px] leading-relaxed">{request.question}</div>

      <div className="flex flex-col gap-1.5">
        {request.options.map((o) => {
          const on = picked.includes(o.label);
          return (
            <button
              key={o.label}
              onClick={() =>
                multi
                  ? setPicked((p) => (on ? p.filter((x) => x !== o.label) : [...p, o.label]))
                  : answer(request.id, o.label)
              }
              className={`rounded-lg border px-3 py-2 text-left ${
                on ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent hover:bg-accent-soft"
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                {multi && (
                  <span className={`inline-block h-3.5 w-3.5 rounded border ${on ? "border-accent bg-accent" : "border-border"}`} />
                )}
                {o.label}
              </span>
              {o.description && (
                <span className="mt-0.5 block text-[11.5px] text-faint">{o.description}</span>
              )}
            </button>
          );
        })}
        {multi && (
          <button
            onClick={() => picked.length && answer(request.id, picked.join(", "))}
            disabled={!picked.length}
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
          if (other.trim()) answer(request.id, other.trim());
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
