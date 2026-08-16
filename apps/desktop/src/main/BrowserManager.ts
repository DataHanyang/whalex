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

interface BTab {
  id: string;
  view: WebContentsView;
  console: string[];
}

export interface BrowserTabInfo {
  id: string;
  url: string;
  title: string;
}

type ActivityFn = (
  url: string,
  title: string,
  tabs: BrowserTabInfo[],
  activeTabId: string | null,
) => void;

/**
 * Hosts the in-app browser as native WebContentsViews overlaid on the window —
 * one per tab, only the active tab visible. Implements the DOM-based
 * BrowserController the agent's browser_* tools call (they always act on the
 * active tab). The renderer positions the active view via browser:setBounds.
 */
export class BrowserManager implements BrowserController {
  private tabs = new Map<string, BTab>();
  private order: string[] = [];
  private activeId: string | null = null;
  private lastBounds: { x: number; y: number; width: number; height: number } | null = null;
  private nextId = 1;
  private onActivity?: ActivityFn;

  constructor(private getWindow: () => BrowserWindow | null) {}

  setActivityListener(fn: ActivityFn): void {
    this.onActivity = fn;
  }

  tabsInfo(): BrowserTabInfo[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is BTab => !!t)
      .map((t) => ({
        id: t.id,
        url: t.view.webContents.getURL(),
        title: t.view.webContents.getTitle(),
      }));
  }

  private active(): BTab | null {
    return this.activeId ? (this.tabs.get(this.activeId) ?? null) : null;
  }

  private emitActivity(): void {
    const a = this.active();
    this.onActivity?.(
      a?.view.webContents.getURL() ?? "",
      a?.view.webContents.getTitle() ?? "",
      this.tabsInfo(),
      this.activeId,
    );
  }

  private applyBounds(): void {
    for (const tab of this.tabs.values()) {
      if (tab.id === this.activeId && this.lastBounds) tab.view.setBounds(this.lastBounds);
      else tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  private createTab(): BTab | null {
    const win = this.getWindow();
    if (!win) return null;
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    const tab: BTab = { id: `tab${this.nextId++}`, view, console: [] };
    view.webContents.on("console-message", (_e, _level, message) => {
      tab.console.push(message);
      if (tab.console.length > 200) tab.console.shift();
    });
    // Keep the tab strip and address bar fresh on in-page navigations too.
    view.webContents.on("did-navigate", () => this.emitActivity());
    view.webContents.on("did-navigate-in-page", () => this.emitActivity());
    view.webContents.on("page-title-updated", () => this.emitActivity());
    this.tabs.set(tab.id, tab);
    this.order.push(tab.id);
    return tab;
  }

  private ensureTab(newTab: boolean): BTab | null {
    if (!newTab && this.active()) return this.active();
    const tab = newTab || this.tabs.size === 0 ? this.createTab() : this.active();
    if (tab) this.activeId = tab.id;
    this.applyBounds();
    return tab;
  }

  selectTab(id: string): void {
    if (!this.tabs.has(id)) return;
    this.activeId = id;
    this.applyBounds();
    this.emitActivity();
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const win = this.getWindow();
    win?.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.activeId === id) this.activeId = this.order[this.order.length - 1] ?? null;
    this.applyBounds();
    this.emitActivity();
  }

  setBounds(rect: { x: number; y: number; width: number; height: number }): void {
    this.lastBounds = rect;
    this.applyBounds();
  }

  hide(): void {
    for (const tab of this.tabs.values()) tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  async navigate(
    url: string,
    newTab = false,
  ): Promise<{ ok: boolean; title?: string; url?: string; error?: string }> {
    const tab = this.ensureTab(newTab);
    if (!tab) return { ok: false, error: "no window" };
    try {
      if (url === "back") {
        if (tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
      } else if (url === "forward") {
        if (tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
      } else {
        const full = /^(https?|file):\/\//.test(url) ? url : `https://${url}`;
        await tab.view.webContents.loadURL(full);
      }
      await new Promise((r) => setTimeout(r, 400));
      const title = tab.view.webContents.getTitle();
      const finalUrl = tab.view.webContents.getURL();
      this.emitActivity();
      return { ok: true, title, url: finalUrl };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async readPage(): Promise<string> {
    const tab = this.active();
    if (!tab) return "No page is open. Use browser_navigate first.";
    return String(await tab.view.webContents.executeJavaScript(READ_PAGE_JS, true));
  }

  async click(ref: string): Promise<string> {
    const tab = this.active();
    if (!tab) return "No page open.";
    return String(await tab.view.webContents.executeJavaScript(clickJs(ref), true));
  }

  async type(ref: string, text: string, submit: boolean): Promise<string> {
    const tab = this.active();
    if (!tab) return "No page open.";
    return String(await tab.view.webContents.executeJavaScript(typeJs(ref, text, submit), true));
  }

  async scroll(direction: "up" | "down"): Promise<string> {
    const tab = this.active();
    if (!tab) return "No page open.";
    const dy = direction === "down" ? 600 : -600;
    await tab.view.webContents.executeJavaScript(`window.scrollBy(0, ${dy})`, true);
    return `scrolled ${direction}`;
  }

  async readConsole(): Promise<string> {
    const tab = this.active();
    return tab ? tab.console.slice(-40).join("\n") || "(no console messages)" : "(no page open)";
  }

  dispose(): void {
    const win = this.getWindow();
    for (const tab of this.tabs.values()) {
      win?.contentView.removeChildView(tab.view);
    }
    this.tabs.clear();
    this.order = [];
    this.activeId = null;
  }
}
