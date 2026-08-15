import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
import { CodeBlock } from "./CodeBlock";

function makeComponents(stable: boolean): Components {
  return {
    code(props) {
      const { className, children } = props;
      const match = /language-(\w+)/.exec(className ?? "");
      const text = String(children ?? "");
      // react-markdown v9: block code arrives wrapped in <pre>; detect by newline/lang.
      if (match || text.includes("\n")) {
        return <CodeBlock code={text.replace(/\n$/, "")} lang={match?.[1] ?? ""} stable={stable} />;
      }
      return <code className={className}>{children}</code>;
    },
    pre({ children }) {
      return <>{children}</>;
    },
    a({ href, children }) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href) void window.whalex.invoke("shell:openExternal", { url: href });
          }}
        >
          {children}
        </a>
      );
    },
  };
}

const stableComponents = makeComponents(true);
const streamingComponents = makeComponents(false);

const Block = memo(
  function Block({ raw, stable }: { raw: string; stable: boolean }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={stable ? stableComponents : streamingComponents}
      >
        {raw}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.raw === next.raw && prev.stable === next.stable,
);

/**
 * Streaming-safe markdown: split the accumulated text into top-level blocks
 * with marked's lexer; every block except the trailing one is complete and
 * memoized, so each new token re-renders only the tail block.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const blocks = useMemo(() => {
    if (!streaming) return [text];
    try {
      const tokens = marked.lexer(text);
      const raws = tokens.map((t) => t.raw);
      // Merge tiny adjacent blocks so we don't mount hundreds of components.
      const merged: string[] = [];
      for (const raw of raws) {
        const last = merged[merged.length - 1];
        if (last !== undefined && last.length + raw.length < 500) {
          merged[merged.length - 1] = last + raw;
        } else {
          merged.push(raw);
        }
      }
      return merged.length > 0 ? merged : [text];
    } catch {
      return [text];
    }
  }, [text, streaming]);

  return (
    <div className="md">
      {blocks.map((raw, i) => {
        const isTail = i === blocks.length - 1;
        return <Block key={i} raw={raw} stable={!streaming || !isTail} />;
      })}
    </div>
  );
});
