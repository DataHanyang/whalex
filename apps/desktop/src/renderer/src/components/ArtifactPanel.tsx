import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, X , PanelRightClose } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { useTranslation } from "react-i18next";
import { CheckCircle2, PencilLine, XCircle } from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { CodeBlock } from "./CodeBlock";
import { SpreadsheetView, SlidesView } from "./OfficeViews";
import { whalex } from "../lib/ipc";

const VIEWPORTS = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

/**
 * A plan produced in plan mode: the markdown on top, a decision bar below.
 * Accept flips the session out of plan mode and tells the agent to build;
 * Revise opens an inline feedback box; Reject sends the plan back.
 */
function PlanView({ content }: { content: string }) {
  const { t } = useTranslation();
  const send = useSessionStore((s) => s.send);
  const setPermissionMode = useSessionStore((s) => s.setPermissionMode);
  const close = useSessionStore((s) => s.closeArtifact);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <StreamingMarkdown text={content} streaming={false} />
      </div>
      <div className="shrink-0 border-t border-border bg-surface p-3">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!feedback.trim()) return;
              void send(`Revise the plan: ${feedback.trim()}`);
              setEditing(false);
              setFeedback("");
            }}
          >
            <input
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t("plan.revisePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
            />
            <button
              type="submit"
              disabled={!feedback.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-40"
            >
              {t("plan.sendRevision")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-border px-3 py-2 text-[12.5px] text-muted hover:bg-surface-2"
            >
              {t("plan.cancel")}
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPermissionMode("default");
                void send("I accept the plan. Exit plan mode and implement it now.");
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
            >
              <CheckCircle2 size={14} />
              {t("plan.accept")}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-muted hover:bg-surface-2"
            >
              <PencilLine size={14} />
              {t("plan.revise")}
            </button>
            <button
              onClick={() => {
                void send("The plan is rejected. Do not proceed with it.");
                close();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 py-2 text-[13px] text-danger hover:bg-danger/10"
            >
              <XCircle size={14} />
              {t("plan.reject")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders an HTML artifact inside a strictly-sandboxed iframe. */
function HtmlView({ content }: { content: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [vp, setVp] = useState<keyof typeof VIEWPORTS>("desktop");
  useEffect(() => {
    const iframe = ref.current;
    if (iframe) iframe.srcdoc = content;
  }, [content]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        {(Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>).map((k) => (
          <button
            key={k}
            onClick={() => setVp(k)}
            className={`rounded px-2 py-0.5 text-[11px] ${vp === k ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex flex-1 justify-center overflow-auto bg-surface-2 p-2">
        <iframe
          ref={ref}
          title="artifact"
          // allow-same-origin is required for CDN module scripts and textures:
          // an opaque-origin srcdoc breaks three.js-style loads. The content is
          // authored by the local agent, which already writes arbitrary files
          // on this machine — the iframe is not a trust boundary against it.
          sandbox="allow-scripts allow-same-origin"
          className="h-full rounded border border-border bg-white"
          style={{ width: VIEWPORTS[vp], maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}

function MermaidView({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void import("mermaid").then(async (m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",
      });
      try {
        const { svg } = await mermaid.render(`m${Date.now()}`, content);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        if (ref.current) ref.current.textContent = String(err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [content]);
  return <div ref={ref} className="flex justify-center overflow-auto p-4" />;
}

export function ArtifactPanel() {
  const artifacts = useSessionStore((s) => s.artifacts);
  const activeId = useSessionStore((s) => s.activeArtifactId);
  const openArtifact = useSessionStore((s) => s.openArtifact);
  const close = useSessionStore((s) => s.closeArtifact);
  const active = artifacts.find((a) => a.artifactId === activeId);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!active) return null;

  const openExternal = () => {
    if (active.url) void whalex.invoke("shell:openExternal", { url: active.url });
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {artifacts.map((a) => (
            <button
              key={a.artifactId}
              onClick={() => openArtifact(a.artifactId)}
              className={`shrink-0 truncate rounded px-2 py-1 text-[12px] ${a.artifactId === activeId ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"}`}
              style={{ maxWidth: 160 }}
              title={a.title}
            >
              {a.title}
            </button>
          ))}
        </div>
        <button onClick={() => setRefreshKey((k) => k + 1)} className="rounded p-1 text-faint hover:text-text" title="Refresh">
          <RefreshCw size={14} />
        </button>
        {active.url && (
          <button onClick={openExternal} className="rounded p-1 text-faint hover:text-text" title="Open externally">
            <ExternalLink size={14} />
          </button>
        )}
        <button
          onClick={useUiStore.getState().toggleArtifactCollapsed}
          className="rounded p-1 text-faint hover:text-text"
          title="Collapse preview"
        >
          <PanelRightClose size={15} />
        </button>
        <button onClick={close} className="rounded p-1 text-faint hover:text-text" title="Close">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" key={refreshKey}>
        {active.kind === "html" && active.content && <HtmlView content={active.content} />}
        {active.kind === "url" && active.url && (
          <iframe title={active.title} src={active.url} sandbox="allow-scripts allow-same-origin allow-forms" className="h-full w-full bg-white" />
        )}
        {active.kind === "markdown" && active.content && (
          <div className="p-4">
            <StreamingMarkdown text={active.content} streaming={false} />
          </div>
        )}
        {active.kind === "svg" && active.content && (
          <div className="flex justify-center p-4" dangerouslySetInnerHTML={{ __html: active.content }} />
        )}
        {active.kind === "mermaid" && active.content && <MermaidView content={active.content} />}
        {active.kind === "plan" && active.content && <PlanView content={active.content} />}
        {active.kind === "spreadsheet" && active.content && <SpreadsheetView base64={active.content} />}
        {active.kind === "slides" && active.content && <SlidesView base64={active.content} />}
        {active.kind === "image" && active.content && (
          <div className="flex justify-center p-4">
            <img src={active.content} alt={active.title} className="max-w-full" />
          </div>
        )}
        {active.kind === "code" && active.content && (
          <div className="p-3">
            <CodeBlock code={active.content} lang={active.language ?? "text"} stable />
          </div>
        )}
      </div>
    </div>
  );
}
