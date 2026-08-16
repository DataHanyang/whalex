import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardList,
  ExternalLink,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Globe,
  PanelRightClose,
  Presentation,
  RefreshCw,
  X,
} from "lucide-react";
import type { Artifact } from "@whalex/shared";
import { useSessionStore } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";
import { ArtifactBody } from "./ArtifactPanel";
import { whalex } from "../lib/ipc";

function kindIcon(kind: Artifact["kind"]) {
  switch (kind) {
    case "spreadsheet":
      return FileSpreadsheet;
    case "slides":
      return Presentation;
    case "url":
      return Globe;
    case "plan":
      return ClipboardList;
    case "image":
    case "svg":
      return FileImage;
    case "mermaid":
      return GitBranch;
    case "code":
    case "html":
      return FileCode2;
    default:
      return FileText;
  }
}

/** The native in-app browser view, with a real address bar above it. */
function BrowserView({ tabId }: { tabId: string }) {
  const tabs = useSessionStore((s) => s.browser.tabs);
  const tab = tabs.find((t) => t.id === tabId);
  const holderRef = useRef<HTMLDivElement>(null);
  const [addr, setAddr] = useState(tab?.url ?? "");
  const edited = useRef(false);

  // Track navigation unless the user is mid-edit in the address bar.
  useEffect(() => {
    if (!edited.current) setAddr(tab?.url ?? "");
  }, [tab?.url]);

  useEffect(() => {
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
  }, [tabId]);

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          edited.current = false;
          const next = /^(https?|file):/.test(addr) ? addr : `https://${addr}`;
          void whalex.invoke("browser:navigate", { url: next });
        }}
      >
        <Globe size={13} className="shrink-0 text-faint" />
        <input
          value={addr}
          onChange={(e) => {
            edited.current = true;
            setAddr(e.target.value);
          }}
          onBlur={() => {
            edited.current = false;
            setAddr(tab?.url ?? addr);
          }}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11.5px] outline-none focus:border-accent"
        />
      </form>
      {/* The native WebContentsView is overlaid here by the main process. */}
      <div ref={holderRef} className="min-h-0 flex-1 bg-white" />
    </div>
  );
}

/**
 * The right-hand work panel: one tab per artifact, a live agent graph when
 * multi-agent work is running, and one tab per in-app browser page.
 */
export function SidePanel() {
  const { t } = useTranslation();
  const artifacts = useSessionStore((s) => s.artifacts);
  const browser = useSessionStore((s) => s.browser);
  const sideTab = useSessionStore((s) => s.sideTab);
  const selectSideTab = useSessionStore((s) => s.selectSideTab);
  const closeArtifactTab = useSessionStore((s) => s.closeArtifactTab);
  const closeBrowserTab = useSessionStore((s) => s.closeBrowserTab);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeArtifact = sideTab?.startsWith("a:")
    ? artifacts.find((a) => a.artifactId === sideTab.slice(2))
    : undefined;
  const activeBrowserTabId = sideTab?.startsWith("b:") ? sideTab.slice(2) : null;

  if (!sideTab) return null;

  const openExternal = () => {
    const url = activeArtifact?.url ?? browser.tabs.find((tb) => tb.id === activeBrowserTabId)?.url;
    if (url) void whalex.invoke("shell:openExternal", { url });
  };

  const tabBtn = (
    id: string,
    Icon: typeof Globe,
    label: string,
    onClose?: () => void,
    pulse = false,
  ) => (
    <div
      key={id}
      className={`group flex shrink-0 items-center overflow-hidden rounded-md border ${
        sideTab === id
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-transparent text-muted hover:bg-surface-2"
      }`}
    >
      <button
        onClick={() => selectSideTab(id)}
        className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-[12px]"
        style={{ maxWidth: 150 }}
        title={label}
      >
        <Icon size={13} className={`shrink-0 ${pulse ? "animate-pulse text-accent" : ""}`} />
        <span className="truncate">{label}</span>
      </button>
      {onClose && (
        <button
          onClick={onClose}
          className="mr-1 hidden rounded p-0.5 hover:bg-surface-2 group-hover:block"
          title={t("panel.closeTab")}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {artifacts.map((a) =>
            tabBtn(`a:${a.artifactId}`, kindIcon(a.kind), a.title, () =>
              closeArtifactTab(a.artifactId),
            ),
          )}
          {browser.tabs.map((b) =>
            tabBtn(
              `b:${b.id}`,
              Globe,
              b.title || b.url.replace(/^https?:\/\//, "") || t("panel.browser"),
              () => closeBrowserTab(b.id),
            ),
          )}
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded p-1 text-faint hover:text-text"
          title={t("panel.refresh")}
        >
          <RefreshCw size={14} />
        </button>
        {(activeArtifact?.url || activeBrowserTabId) && (
          <button onClick={openExternal} className="rounded p-1 text-faint hover:text-text" title={t("panel.openExternal")}>
            <ExternalLink size={14} />
          </button>
        )}
        <button
          onClick={useUiStore.getState().toggleArtifactCollapsed}
          className="rounded p-1 text-faint hover:text-text"
          title={t("panel.collapse")}
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" key={refreshKey}>
        {activeArtifact && <ArtifactBody artifact={activeArtifact} />}
        {activeBrowserTabId && <BrowserView tabId={activeBrowserTabId} />}
      </div>
    </div>
  );
}
