import { WebContentsView, type BrowserWindow } from "electron";
import type { BrowserController } from "@whalex/core";

// Injected into the page to tag interactive elements with stable refs and
// return a readable outline. Kept as a string so it runs in the page context.
const READ_PAGE_JS = `(() => {
  const out = [];
  let n = 0;
  const seen = new WeakSet();
  const isInteractive = (el) => {
    const tag = el.tagName.toLowerCase();
    if (["a","button","input","textarea","select"].includes(tag)) return true;
    if (el.getAttribute("role") && ["button","link","checkbox","tab","menuitem"].includes(el.getAttribute("role"))) return true;
    if (el.onclick || el.getAttribute("onclick")) return true;
    return false;
  };
  const label = (el) => (el.getAttribute("aria-label") || el.value || el.placeholder || el.innerText || el.getAttribute("title") || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const walk = (el, depth) => {
    if (!el || seen.has(el) || depth > 40) return;
    seen.add(el);
    const style = el.nodeType === 1 ? getComputedStyle(el) : null;
    if (style && (style.display === "none" || style.visibility === "hidden")) return;
    if (el.nodeType === 1 && isInteractive(el)) {
      const ref = "ref_" + (++n);
      el.setAttribute("data-whalex-ref", ref);
      const tag = el.tagName.toLowerCase();
      out.push("[" + ref + "] <" + tag + "> " + label(el));
    } else if (el.nodeType === 1 && ["h1","h2","h3","h4","p","li","td"].includes(el.tagName.toLowerCase())) {
      const txt = (el.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 200);
      if (txt) out.push(el.tagName.toLowerCase() + ": " + txt);
    }
    for (const child of el.children || []) walk(child, depth + 1);
  };
  walk(document.body, 0);
  return "URL: " + location.href + "\\nTITLE: " + document.title + "\\n\\n" + out.slice(0, 300).join("\\n");
})()`;

const clickJs = (ref: string) =>
  `(() => { const el = document.querySelector('[data-whalex-ref="${ref}"]'); if (!el) return "no element ${ref}"; el.scrollIntoView({block:"center"}); el.click(); return "clicked ${ref}: " + (el.innerText||el.value||"").slice(0,60); })()`;

const typeJs = (ref: string, text: string, submit: boolean) =>
  `(() => { const el = document.querySelector('[data-whalex-ref="${ref}"]'); if (!el) return "no element ${ref}"; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); ${submit ? `const f = el.form; if (f) f.requestSubmit ? f.requestSubmit() : f.submit(); else el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));` : ""} return "typed into ${ref}"; })()`;

/**
 * Hosts an in-app browser as a WebContentsView overlaid on the window, and
 * implements the DOM-based BrowserController the agent's browser_* tools call.
 * The renderer positions it via browser:setBounds.
 */
export class BrowserManager implements BrowserController {
  private view: WebContentsView | null = null;
  private consoleLog: string[] = [];
  private onActivity?: (url: string, title: string) => void;

  constructor(private getWindow: () => BrowserWindow | null) {}

  setActivityListener(fn: (url: string, title: string) => void): void {
    this.onActivity = fn;
  }

  private ensureView(): WebContentsView | null {
    const win = this.getWindow();
    if (!win) return null;
    if (this.view) return this.view;
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    view.webContents.on("console-message", (_e, _level, message) => {
      this.consoleLog.push(message);
      if (this.consoleLog.length > 200) this.consoleLog.shift();
    });
    this.view = view;
    return view;
  }

  setBounds(rect: { x: number; y: number; width: number; height: number }): void {
    this.view?.setBounds(rect);
  }

  hide(): void {
    this.view?.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  async navigate(url: string): Promise<{ ok: boolean; title?: string; url?: string; error?: string }> {
    const view = this.ensureView();
    if (!view) return { ok: false, error: "no window" };
    try {
      if (url === "back") {
        if (view.webContents.canGoBack()) view.webContents.goBack();
      } else if (url === "forward") {
        if (view.webContents.canGoForward()) view.webContents.goForward();
      } else {
        const full = /^(https?|file):\/\//.test(url) ? url : `https://${url}`;
        await view.webContents.loadURL(full);
      }
      await new Promise((r) => setTimeout(r, 400));
      const title = view.webContents.getTitle();
      const finalUrl = view.webContents.getURL();
      this.onActivity?.(finalUrl, title);
      return { ok: true, title, url: finalUrl };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async readPage(): Promise<string> {
    if (!this.view) return "No page is open. Use browser_navigate first.";
    return String(await this.view.webContents.executeJavaScript(READ_PAGE_JS, true));
  }

  async click(ref: string): Promise<string> {
    if (!this.view) return "No page open.";
    return String(await this.view.webContents.executeJavaScript(clickJs(ref), true));
  }

  async type(ref: string, text: string, submit: boolean): Promise<string> {
    if (!this.view) return "No page open.";
    return String(await this.view.webContents.executeJavaScript(typeJs(ref, text, submit), true));
  }

  async scroll(direction: "up" | "down"): Promise<string> {
    if (!this.view) return "No page open.";
    const dy = direction === "down" ? 600 : -600;
    await this.view.webContents.executeJavaScript(`window.scrollBy(0, ${dy})`, true);
    return `scrolled ${direction}`;
  }

  async readConsole(): Promise<string> {
    return this.consoleLog.slice(-40).join("\n") || "(no console messages)";
  }

  dispose(): void {
    if (this.view) {
      const win = this.getWindow();
      win?.contentView.removeChildView(this.view);
      this.view = null;
    }
  }
}
