import type { ChatMessage } from "../providers/Provider.js";

interface Pattern {
  kind: string;
  re: RegExp;
  /** Which capture group holds the secret; 0 = the whole match. */
  group?: number;
}

// Ordered: the most specific shapes first so e.g. a PEM block isn't chewed up
// by the generic assignment matcher line by line.
const PATTERNS: Pattern[] = [
  {
    kind: "private-key",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,20000}?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { kind: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: "api-key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    kind: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    // KEY=value / "password": "..." style assignments with secret-ish names.
    kind: "secret",
    re: /\b((?:api[_-]?key|apikey|secret|token|passwd|password|client[_-]?secret|access[_-]?key|auth)[A-Za-z0-9_-]*\s*[:=]\s*["']?)([A-Za-z0-9+/_.-]{10,})/gi,
    group: 2,
  },
];

/**
 * Masks secret-shaped strings before context leaves the machine for a model
 * API. A given secret always maps to the same placeholder within a session,
 * so the model can still refer to "the key in .env" coherently — it just
 * never sees the value. This is a guardrail, not a cryptographic boundary:
 * the model must read your code to work on it, and prose it genuinely needs
 * stays readable.
 */
export class Redactor {
  private placeholders = new Map<string, string>();
  private counts = new Map<string, number>();

  redactText(text: string): string {
    let out = text;
    for (const p of PATTERNS) {
      out = out.replace(p.re, (...args) => {
        const match = args[0] as string;
        if (p.group) {
          const groups = args.slice(1, -2) as string[];
          const prefix = groups[0] ?? "";
          const secret = groups[p.group - 1] ?? "";
          if (!secret) return match;
          return prefix + this.placeholderFor(p.kind, secret);
        }
        return this.placeholderFor(p.kind, match);
      });
    }
    return out;
  }

  /** Redacts every outbound message field a secret could ride in. */
  redactMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((m) => {
      const msg = { ...m } as ChatMessage & {
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
      if (typeof msg.content === "string" && msg.content) {
        msg.content = this.redactText(msg.content);
      }
      if (Array.isArray(msg.tool_calls)) {
        msg.tool_calls = msg.tool_calls.map((tc) =>
          tc.function?.arguments
            ? {
                ...tc,
                function: { ...tc.function, arguments: this.redactText(tc.function.arguments) },
              }
            : tc,
        );
      }
      return msg;
    });
  }

  private placeholderFor(kind: string, secret: string): string {
    const existing = this.placeholders.get(secret);
    if (existing) return existing;
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    const ph = `[REDACTED:${kind}-${n}]`;
    this.placeholders.set(secret, ph);
    return ph;
  }
}
