import { describe, expect, it } from "vitest";
import { Redactor } from "../src/privacy/Redactor.js";

describe("Redactor", () => {
  it("masks common credential shapes", () => {
    const r = new Redactor();
    const out = r.redactText(
      [
        "aws AKIAIOSFODNN7EXAMPLE ok",
        "gh ghp_abcdefghijklmnopqrstuvwxyz012345 ok",
        "openai sk-proj-abcdefghijklmnopqrstuv ok",
        'env API_KEY="supersecretvalue123" ok',
        "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U ok",
      ].join("\n"),
    );
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz012345");
    expect(out).not.toContain("supersecretvalue123");
    expect(out).not.toContain("dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
    expect(out).toContain("[REDACTED:aws-key-1]");
    // the assignment keeps its key name so the model still has context
    expect(out).toMatch(/API_KEY="\[REDACTED:secret-\d\]/);
  });

  it("keeps placeholders stable for the same secret", () => {
    const r = new Redactor();
    const a = r.redactText("token=AKIAIOSFODNN7EXAMPLE");
    const b = r.redactText("again AKIAIOSFODNN7EXAMPLE");
    const ph = a.match(/\[REDACTED:[^\]]+\]/)![0];
    expect(b).toContain(ph);
  });

  it("masks PEM private key blocks whole", () => {
    const r = new Redactor();
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----";
    const out = r.redactText(`before\n${pem}\nafter`);
    expect(out).not.toContain("MIIEow");
    expect(out).toContain("[REDACTED:private-key-1]");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("leaves ordinary code and prose alone", () => {
    const r = new Redactor();
    const src = "const add = (a, b) => a + b; // sums two numbers\nhttp://localhost:5173/index.html";
    expect(r.redactText(src)).toBe(src);
  });

  it("redacts tool-call arguments too", () => {
    const r = new Redactor();
    const msgs = r.redactMessages([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "1",
            type: "function",
            function: { name: "write_file", arguments: '{"content":"KEY=ghp_abcdefghijklmnopqrstuvwxyz012345"}' },
          },
        ],
      } as never,
    ]);
    const args = (msgs[0] as { tool_calls: Array<{ function: { arguments: string } }> }).tool_calls[0]
      .function.arguments;
    expect(args).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz012345");
  });
});
