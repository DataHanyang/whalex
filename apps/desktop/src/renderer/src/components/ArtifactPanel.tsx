import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, X , PanelRightClose } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { CodeBlock } from "./CodeBlock";
import { whalex } from "../lib/ipc";

const VIEWPORTS = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

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
          sandbox="allow-scripts"
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
