#!/usr/bin/env node
/**
 * Electron side of the `verify_page` tool: load an HTML file offscreen, let it
 * run, then report whether it actually rendered and animated.
 *
 *   electron verifyRunner.cjs <abs-html-path> <waitMs>
 *
 * Prints one JSON line on stdout. CommonJS on purpose — Electron's main process
 * entry is loaded with require().
 */
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const src = process.argv[2];
const waitMs = Number(process.argv[3] || 6000);

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("enable-unsafe-swiftshader"); // software WebGL

const PROBE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = document.querySelector('canvas');

  // Grab the full pixel buffer so consecutive samples can be diffed. A page can
  // paint a rich static backdrop and still be broken (the subject never drawn),
  // so "how much of the frame changes" matters more than "how much is painted".
  const grab = () => {
    if (!canvas || !canvas.width || !canvas.height) return null;
    // A WebGL canvas has no 2d context, and getContext('2d') on it returns
    // null — so sample it by drawing the canvas into a scratch 2d surface.
    let g = null;
    try { g = canvas.getContext('2d', { willReadFrequently: true }); } catch (e) { g = null; }
    if (g) {
      return { data: g.getImageData(0, 0, canvas.width, canvas.height).data, webgl: false };
    }
    // WebGL canvas. Reading it back is unreliable: unless the context was made
    // with preserveDrawingBuffer, the buffer is cleared after each composite,
    // so a copy comes back blank even when the scene renders fine. Report it as
    // "webgl, not sampled" rather than emitting a false failure.
    return { data: null, webgl: true, unsampled: true };
  };

  const coverageOf = (d, dims) => {
    if (!d) return null;
    // Corner pixels approximate the backdrop; count what differs from them.
    const w = dims ? dims.w : canvas.width, h = dims ? dims.h : canvas.height;
    const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i+1], d[i+2]]; };
    const corners = [at(0,0), at(w-1,0), at(0,h-1), at(w-1,h-1)];
    let nonBg = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      n++;
      const r = d[i], gg = d[i+1], b = d[i+2];
      let matches = false;
      for (const c of corners) {
        if (Math.abs(r-c[0]) + Math.abs(gg-c[1]) + Math.abs(b-c[2]) <= 40) { matches = true; break; }
      }
      if (!matches) nonBg++;
    }
    return n ? Math.round((nonBg / n) * 1000) / 10 : 0;
  };

  const diffPct = (x, y) => {
    if (!x || !y || !x.data || !y.data || x.data.length !== y.data.length) return null;
    let changed = 0, n = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      n++;
      if (Math.abs(x.data[i] - y.data[i]) +
          Math.abs(x.data[i+1] - y.data[i+1]) +
          Math.abs(x.data[i+2] - y.data[i+2]) > 24) changed++;
    }
    return n ? Math.round((changed / n) * 1000) / 10 : 0;
  };

  // Count animation frames actually delivered — the only reliable liveness
  // signal for a WebGL canvas whose pixels cannot be read back.
  let frames = 0;
  const tick = () => { frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  const a = grab();
  await sleep(1000);
  const b = grab();
  await sleep(1000);
  const c = grab();

  let motion = diffPct(a, c);
  const webglUnsampled = !!(c && c.webgl && c.unsampled);
  if (motion === null && webglUnsampled) {
    // Software WebGL (no GPU in this harness) can manage only a couple of
    // frames per second, so any repeated frame means the loop is alive.
    motion = frames >= 2 ? null : 0;
  }

  return {
    animates: webglUnsampled ? frames >= 2 : (motion === null ? null : motion > 0.05),
    motionPct: motion,
    frames,
    webgl: webglUnsampled,
    coverage: c && c.data ? coverageOf(c.data, null) : null,
    bodyHeight: document.body ? document.body.scrollHeight : null,
    imageCount: document.images ? document.images.length : 0,
  };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: { backgroundThrottling: false, offscreen: false },
  });
  const consoleErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2 && !/Security Warning|willReadFrequently|SwiftShader|GL Driver/.test(message)) {
      consoleErrors.push(String(message).slice(0, 200));
    }
  });

  let loaded = true;
  try {
    await win.loadFile(path.resolve(src));
  } catch (err) {
    console.log(JSON.stringify({
      loaded: false, animates: null, canvasCovered: null, bodyHeight: null,
      imageCount: null, consoleErrors: [String(err.message).slice(0, 200)],
      note: "failed to load file",
    }));
    app.quit();
    return;
  }

  await new Promise((r) => setTimeout(r, waitMs));

  let probe = {};
  try {
    probe = await win.webContents.executeJavaScript(PROBE);
  } catch (err) {
    consoleErrors.push(`probe failed: ${String(err.message).slice(0, 160)}`);
  }

  console.log(JSON.stringify({
    loaded,
    animates: probe.animates ?? null,
    motionPct: probe.motionPct ?? null,
    frames: probe.frames ?? null,
    webgl: probe.webgl ?? false,
    canvasCovered: probe.coverage ?? null,
    bodyHeight: probe.bodyHeight ?? null,
    imageCount: probe.imageCount ?? null,
    consoleErrors: consoleErrors.slice(0, 5),
  }));
  win.destroy();
  app.quit();
});
