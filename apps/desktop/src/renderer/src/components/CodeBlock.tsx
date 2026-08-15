import { memo, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

let highlighterPromise: ReturnType<typeof createHl> | null = null;

async function createHl() {
  const { createHighlighter } = await import("shiki");
  return createHighlighter({
    themes: ["github-dark", "github-light"],
    langs: [
      "typescript", "javascript", "tsx", "jsx", "json", "html", "css", "python",
      "powershell", "bash", "shell", "yaml", "markdown", "sql", "java", "csharp",
      "cpp", "c", "go", "rust", "diff", "xml", "toml", "ini",
    ],
  });
}

const htmlCache = new Map<string, string>();

/**
 * Fenced code block with shiki highlighting. While `stable` is false (the
 * block is still streaming) we render a plain <pre> — tokenizing on every
 * delta is what makes naive streaming renderers janky.
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  lang,
  stable,
}: {
  code: string;
  lang: string;
  stable: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const theme =
    document.documentElement.dataset.theme === "dark" ? "github-dark" : "github-light";

  useEffect(() => {
    if (!stable) return;
    const key = `${theme}|${lang}|${code}`;
    const cached = htmlCache.get(key);
    if (cached) {
      setHtml(cached);
      return;
    }
    let cancelled = false;
    highlighterPromise ??= createHl();
    void highlighterPromise.then((hl) => {
      if (cancelled) return;
      try {
        const loaded = new Set(hl.getLoadedLanguages());
        const useLang = loaded.has(lang) ? lang : "text";
        const out = hl.codeToHtml(code, { lang: useLang, theme });
        if (htmlCache.size > 300) htmlCache.clear();
        htmlCache.set(key, out);
        if (!cancelled) setHtml(out);
      } catch {
        // fall through to plain rendering
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, stable, theme]);

  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-2 rounded-lg border border-border bg-code-bg">
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="text-[11px] text-faint">{lang || "text"}</span>
        <button
          onClick={copy}
          className="titlebar-nodrag rounded p-1 text-faint opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
        </button>
      </div>
      <div className="overflow-x-auto p-3">
        {html && stable ? (
          <div className="shiki-block text-[12.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="m-0">
            <code className="font-mono text-[12.5px] leading-relaxed">{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
});
