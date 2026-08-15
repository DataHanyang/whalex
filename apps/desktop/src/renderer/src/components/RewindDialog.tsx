import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { whalex } from "../lib/ipc";

interface Checkpoint {
  boundary: number;
  ts: number;
  label: string;
  fileChanges: number;
}

/**
 * /rewind picker: lists checkpoints (one per user message) and restores the
 * conversation + edited files to the chosen point.
 */
export function RewindDialog({ onClose }: { onClose: () => void }) {
  const sessionId = useSessionStore((s) => s.activeSessionId);
  const rewind = useSessionStore((s) => s.rewind);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  useEffect(() => {
    if (sessionId) void whalex.invoke("checkpoint:list", { sessionId }).then(setCheckpoints);
  }, [sessionId]);

  const doRewind = async (boundary: number) => {
    await rewind(boundary);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="flex items-center gap-2 text-[14px] font-semibold">
            <History size={16} /> 되돌리기
          </span>
          <button onClick={onClose} className="rounded p-1 text-faint hover:text-text">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {checkpoints.length === 0 && (
            <div className="px-2 py-6 text-center text-[12.5px] text-faint">
              되돌릴 지점이 없습니다.
            </div>
          )}
          {checkpoints.map((c, i) => (
            <button
              key={c.boundary}
              onClick={() => void doRewind(c.boundary)}
              className="group mb-1 flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-accent hover:bg-surface-2"
            >
              <span className="shrink-0 text-[11px] text-faint">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{c.label || "(빈 메시지)"}</div>
                {c.fileChanges > 0 && (
                  <div className="text-[11px] text-faint">파일 변경 {c.fileChanges}건</div>
                )}
              </div>
              <RotateCcw size={14} className="shrink-0 text-faint opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <div className="border-t border-border px-5 py-2.5 text-[11.5px] text-faint">
          선택한 지점 이후의 대화와 파일 변경이 되돌려집니다.
        </div>
      </div>
    </div>
  );
}
