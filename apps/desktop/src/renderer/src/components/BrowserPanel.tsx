import { useEffect, useRef } from "react";
import { Globe, X } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { whalex } from "../lib/ipc";

/**
 * The in-app browser is a native WebContentsView owned by main. This panel
 * reserves the layout space and continuously reports its screen bounds so
 * main can position the native view exactly over this box.
 */
export function BrowserPanel() {
  const browser = useSessionStore((s) => s.browser);
  const close = useSessionStore((s) => s.closeBrowser);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!browser.active) return;
    const el = holderRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      void whalex.invoke("browser:setBounds", {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("resize", report);
    const interval = setInterval(report, 500); // catch layout shifts
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      clearInterval(interval);
    };
  }, [browser.active]);

  if (!browser.active) return null;

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Globe size={14} className="text-accent" />
        <span className="truncate text-[12px] text-muted" title={browser.url}>
          {browser.title || browser.url}
        </span>
        <div className="flex-1" />
        <button onClick={close} className="rounded p-1 text-faint hover:text-text" title="Close">
          <X size={15} />
        </button>
      </div>
      {/* The native WebContentsView is overlaid here by the main process. */}
      <div ref={holderRef} className="min-h-0 flex-1 bg-white" />
    </div>
  );
}
