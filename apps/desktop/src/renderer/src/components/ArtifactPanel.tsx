import { useEffect, useRef, useState } from "react";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { CodeBlock } from "./CodeBlock";
import { SpreadsheetView, SlidesView } from "./OfficeViews";

const VIEWPORTS = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

/** A web artifact with a real, editable address bar above the page. */
function UrlView({ title, url }: { title: string; url: string }) {
  const [addr, setAddr] = useState(url);
  const [src, setSrc] = useState(url);
  useEffect(() => {
    setAddr(url);
    setSrc(url);
  }, [url]);
  return (
    <div className="flex h-full flex-col">
      <form
        className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const next = /^(https?|file):/.test(addr) ? addr : `https://${addr}`;
          setAddr(next);
          setSrc(next);
        }}
      >
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11.5px] outline-none focus:border-accent"
        />
      </form>
      <iframe
        title={title}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms"
        className="min-h-0 w-full flex-1 bg-white"
      />
    </div>
  );
}

/** Renders an HTML artifact inside a strictly-sandboxed iframe. */
function HtmlView({ artifactId, content }: { artifactId: string; content: string }) {
  const [vp, setVp] = useState<keyof typeof VIEWPORTS>("desktop");
  // Served from the whalex-artifact:// origin (main-process protocol handler)
  // rather than srcdoc, so the page escapes the app's strict CSP and CDN
  // scripts/textures load. The version query busts the iframe cache when the
  // agent re-presents the same id with new content. allow-same-origin keeps
  // the doc non-opaque (module scripts / fetch work); it stays cross-origin
  // from the renderer, so it cannot reach window.parent.whalex.
  const src = `whalex-artifact://artifacts/${encodeURIComponent(artifactId)}?v=${content.length}`;
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
          title="artifact"
          src={src}
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

export function ArtifactBody({ artifact }: { artifact: import("@whalex/shared").Artifact }) {
  const active = artifact;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {active.kind === "html" && active.content && (
        <HtmlView artifactId={active.artifactId} content={active.content} />
      )}
      {active.kind === "url" && active.url && <UrlView title={active.title} url={active.url} />}
      {active.kind === "markdown" && active.content && (
        <div className="p-4">
          <StreamingMarkdown text={active.content} streaming={false} />
        </div>
      )}
      {active.kind === "svg" && active.content && (
        <div className="flex justify-center p-4" dangerouslySetInnerHTML={{ __html: active.content }} />
      )}
      {active.kind === "mermaid" && active.content && <MermaidView content={active.content} />}
      {active.kind === "plan" && active.content && (
        <div className="p-4">
          <StreamingMarkdown text={active.content} streaming={false} />
        </div>
      )}
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
  );
}
