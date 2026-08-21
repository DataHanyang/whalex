import { describe, expect, it } from "vitest";
import { injectCanvasHost, wantsCanvasMode } from "../src/main/canvasHost.js";

describe("wantsCanvasMode", () => {
  it("detects the design_doc_mode canvas meta", () => {
    expect(wantsCanvasMode('<meta name="design_doc_mode" content="canvas">')).toBe(true);
    expect(wantsCanvasMode("<meta name='design_doc_mode' content='canvas'>")).toBe(true);
    expect(wantsCanvasMode('<META NAME="design_doc_mode" CONTENT="canvas">')).toBe(true);
  });

  it("ignores documents without the opt-in", () => {
    expect(wantsCanvasMode("<html><body>plain artifact</body></html>")).toBe(false);
    expect(wantsCanvasMode('<meta name="design_doc_mode" content="page">')).toBe(false);
    expect(wantsCanvasMode('<meta name="viewport" content="canvas">')).toBe(false);
  });
});

describe("injectCanvasHost", () => {
  it("injects the host script before </body>", () => {
    const out = injectCanvasHost("<html><body><h1>hi</h1></body></html>");
    const scriptAt = out.indexOf("<script>");
    const bodyCloseAt = out.indexOf("</body>");
    expect(scriptAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeLessThan(bodyCloseAt);
    expect(out).toContain("__wx-canvas");
  });

  it("appends when the document has no </body>", () => {
    const out = injectCanvasHost("<h1>fragment</h1>");
    expect(out.startsWith("<h1>fragment</h1>")).toBe(true);
    expect(out).toContain("__wx-canvas");
  });
});
