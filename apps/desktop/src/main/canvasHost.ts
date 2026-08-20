/**
 * Pan/zoom canvas host injected into HTML artifacts that opt in with
 * `<meta name="design_doc_mode" content="canvas">` (the options/design-stack
 * convention). The design pack's skills rely on the viewer providing pan and
 * zoom so option rows can be wider than the viewport; injecting at serve time
 * keeps the artifact document self-contained and avoids cross-origin
 * scripting from the renderer.
 */

/** True when an artifact document asks for the canvas viewer. */
export function wantsCanvasMode(html: string): boolean {
  return /<meta[^>]+name=["']design_doc_mode["'][^>]+content=["']canvas["']/i.test(html);
}

/** Append the canvas host script to a served artifact document. */
export function injectCanvasHost(html: string): string {
  const tag = `<script>${CANVAS_HOST_JS}</script>`;
  const i = html.search(/<\/body\s*>/i);
  return i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
}

// Plain injected JS (no bundler): wraps the body in a transformed layer.
// Drag pans (unless the drag starts on an interactive element), Ctrl+wheel
// zooms toward the cursor, plain wheel pans, double-click on the background
// fits the whole canvas, and a small pill offers −/%/+/fit controls.
const CANVAS_HOST_JS = String.raw`
(function () {
  "use strict";
  function init() {
    if (document.getElementById("__wx-canvas")) return;
    var body = document.body;
    var layer = document.createElement("div");
    layer.id = "__wx-canvas";
    while (body.firstChild) layer.appendChild(body.firstChild);
    body.appendChild(layer);
    body.style.overflow = "hidden";
    body.style.margin = "0";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    body.style.height = "100%";
    layer.style.transformOrigin = "0 0";
    layer.style.width = "max-content";
    layer.style.minWidth = "100%";

    var scale = 1, tx = 0, ty = 0;
    function apply() {
      layer.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
      label.textContent = Math.round(scale * 100) + "%";
    }
    function setScale(next, cx, cy) {
      next = Math.min(4, Math.max(0.1, next));
      // keep the (cx, cy) viewport point fixed while scaling
      tx = cx - ((cx - tx) / scale) * next;
      ty = cy - ((cy - ty) / scale) * next;
      scale = next;
      apply();
    }
    function fit() {
      var w = layer.scrollWidth, h = layer.scrollHeight;
      if (!w || !h) return;
      var pad = 24;
      scale = Math.min(1, (innerWidth - pad * 2) / w, (innerHeight - pad * 2) / h);
      tx = Math.max(pad, (innerWidth - w * scale) / 2);
      ty = pad;
      apply();
    }

    // controls pill
    var bar = document.createElement("div");
    bar.id = "__wx-canvas-bar";
    bar.style.cssText =
      "position:fixed;right:14px;bottom:14px;z-index:2147483647;display:flex;align-items:center;gap:2px;" +
      "background:rgba(24,24,28,.82);color:#eee;border-radius:999px;padding:4px 6px;" +
      "font:12px/1 system-ui,sans-serif;user-select:none;box-shadow:0 2px 10px rgba(0,0,0,.25)";
    function btn(text, title, fn) {
      var b = document.createElement("button");
      b.textContent = text;
      b.title = title;
      b.style.cssText =
        "all:unset;cursor:pointer;padding:4px 8px;border-radius:999px;color:#eee;font:12px/1 system-ui,sans-serif";
      b.onmouseenter = function () { b.style.background = "rgba(255,255,255,.14)"; };
      b.onmouseleave = function () { b.style.background = "transparent"; };
      b.onclick = fn;
      bar.appendChild(b);
      return b;
    }
    btn("−", "zoom out", function () { setScale(scale / 1.2, innerWidth / 2, innerHeight / 2); });
    var label = btn("100%", "reset to 100%", function () { scale = 1; tx = 24; ty = 24; apply(); });
    label.style.minWidth = "38px";
    label.style.textAlign = "center";
    btn("+", "zoom in", function () { setScale(scale * 1.2, innerWidth / 2, innerHeight / 2); });
    btn("⛶", "fit", fit);
    body.appendChild(bar);

    addEventListener("wheel", function (e) {
      if (bar.contains(e.target)) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) setScale(scale * Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY);
      else { tx -= e.deltaX; ty -= e.deltaY; apply(); }
    }, { passive: false });

    var INTERACTIVE = "a,button,input,select,textarea,label,video,audio,summary,[contenteditable],[data-no-pan]";
    var down = null;
    addEventListener("pointerdown", function (e) {
      if (bar.contains(e.target)) return;
      if (e.button !== 1 && (e.button !== 0 || (e.target.closest && e.target.closest(INTERACTIVE)))) return;
      down = { x: e.clientX, y: e.clientY, tx: tx, ty: ty, id: e.pointerId, panning: e.button === 1 };
    });
    addEventListener("pointermove", function (e) {
      if (!down || e.pointerId !== down.id) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.panning && Math.abs(dx) + Math.abs(dy) < 5) return;
      down.panning = true;
      tx = down.tx + dx;
      ty = down.ty + dy;
      apply();
    });
    addEventListener("pointerup", function () { down = null; });
    addEventListener("pointercancel", function () { down = null; });
    addEventListener("dblclick", function (e) {
      if (bar.contains(e.target)) return;
      if (e.target === body || e.target === layer || e.target === document.documentElement) fit();
    });

    // start at fit when the content is wider than the viewport, 100% otherwise
    tx = 24; ty = 24; apply();
    requestAnimationFrame(function () {
      if (layer.scrollWidth * scale > innerWidth - 48) fit();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`;
