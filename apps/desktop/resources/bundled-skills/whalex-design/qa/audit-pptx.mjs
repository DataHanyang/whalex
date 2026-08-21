// WhaleX QA — PPTX 감사 스크립트 (design-system-extract + ai-slop-check + accessibility-audit + hierarchy-rhythm-review)
// 사용법: node whalex-design/qa/audit-pptx.mjs <input.pptx> [output-dir]
// 산출물: <output-dir>/<deck-name>-audit.json + <deck-name>-audit.md (또는 stdout)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// jszip 해석 — 작업 폴더의 node_modules 우선, 없으면 상위 탐색
function resolveJszip() {
  const candidates = [
    path.resolve('node_modules/jszip'),
    path.resolve('node_modules/jszip'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return require(c);
  }
  // 호출 위치 기준 상위로 탐색
  let dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  while (path.dirname(dir) !== dir) {
    const p = path.join(dir, 'node_modules', 'jszip');
    if (fs.existsSync(path.join(p, 'package.json'))) return require(p);
    dir = path.dirname(dir);
  }
  throw new Error('jszip not found — run "npm i jszip" in the working folder');
}

const JSZip = resolveJszip();

// ---------- 유틸 ----------
const stripNs = (xml) => xml.replace(/<\/?[a-zA-Z0-9]+:/g, (m) => m.replace(/[a-zA-Z0-9]+:/, ''));
const esc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function hexFromColor(el) {
  if (!el) return null;
  const srgb = el.match(/<srgbClr val="([0-9A-Fa-f]{6})"/);
  if (srgb) return srgb[1].toUpperCase();
  const scheme = el.match(/<schemeClr val="([a-zA-Z0-9]+)"/);
  if (scheme) return scheme[1].toLowerCase(); // 테마 키로 반환 (해석은 나중에)
  return null;
}

// XML 조각에서 첫 번째 fill 요소 판별 (noFill → solid → grad → blip → pat 순, 문서 내 등장 순서대로)
function firstFill(xml) {
  const re = /<noFill\s*\/?>|<solidFill>([\s\S]*?)<\/solidFill>|<gradFill>([\s\S]*?)<\/gradFill>|<blipFill>([\s\S]*?)<\/blipFill>|<pattFill>([\s\S]*?)<\/pattFill>/g;
  let m = re.exec(xml);
  if (!m) return null;
  if (m[0].startsWith('<noFill')) return { type: 'none', xml: m[0] };
  if (m[1] !== undefined) return { type: 'solid', xml: m[1] };
  if (m[2] !== undefined) return { type: 'grad', xml: m[2] };
  if (m[3] !== undefined) return { type: 'blip', xml: m[3] };
  return { type: 'pat', xml: m[4] };
}

function lum(hex) {
  const [r, g, b] = hex.match(/../g).map((x) => parseInt(x, 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [r, g, b].map(f);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const EMOJI_STRONG_RE = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{2728}\u{2764}\u{2B50}]/gu;
const SYMBOL_RE = /[✓✔✕✖✗✘➀➁➂➃➄➅➆➇➈➉①-⑳⓪-⓳▪▫●○◆◇►▶■□☐☑→←↑↓➤➥❯]/g;

function countEmoji(text) {
  const emoji = text.match(EMOJI_STRONG_RE) || [];
  const symbols = text.match(SYMBOL_RE) || [];
  return {
    emojiCount: emoji.length,
    emojiChars: [...new Set(emoji)].slice(0, 5),
    symbolCount: symbols.length,
    symbolChars: [...new Set(symbols)].slice(0, 5),
  };
}

// ---------- 테마 파싱 ----------
function parseTheme(xml) {
  const s = stripNs(xml);
  const scheme = {};
  const clr = s.match(/<clrScheme[^>]*>([\s\S]*?)<\/clrScheme>/);
  if (clr) {
    for (const m of clr[1].matchAll(/<([a-zA-Z0-9]+)>(?:<srgbClr val="([0-9A-Fa-f]{6})"|<sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")[\s\S]*?<\/\1>/g)) {
      scheme[m[1]] = (m[2] || m[3]).toUpperCase();
    }
  }
  const font = {};
  const fs = s.match(/<fontScheme>([\s\S]*?)<\/fontScheme>/);
  if (fs) {
    const major = fs[1].match(/<majorFont>[\s\S]*?<latin typeface="([^"]*)"[\s\S]*?<ea typeface="([^"]*)"/);
    const minor = fs[1].match(/<minorFont>[\s\S]*?<latin typeface="([^"]*)"[\s\S]*?<ea typeface="([^"]*)"/);
    if (major) font.major = { latin: major[1], ea: major[2] };
    if (minor) font.minor = { latin: minor[1], ea: minor[2] };
  }
  return { scheme, font };
}

function resolveColor(c, theme) {
  if (!c) return null;
  if (/^[0-9A-F]{6}$/.test(c)) return c;
  // schemeClr 키 → 테마 매핑 (tx1/bg1 → dk1/lt1)
  const map = { dk1: 'dk1', lt1: 'lt1', dk2: 'dk2', lt2: 'lt2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink', tx1: 'dk1', tx2: 'lt1', bg1: 'lt1', bg2: 'dk1' };
  const key = map[c] || c;
  const hex = theme.scheme[key];
  return hex || null;
}

// ---------- 슬라이드 파싱 ----------
// xfrm(EMU 좌표) 추출
function parseXfrm(spPrXml) {
  const xf = spPrXml.match(/<xfrm>([\s\S]*?)<\/xfrm>/);
  if (!xf) return null;
  const off = xf[1].match(/<off x="(-?\d+)" y="(-?\d+)"/);
  const ext = xf[1].match(/<ext cx="(\d+)" cy="(\d+)"/);
  if (!off || !ext) return null;
  return { x: +off[1], y: +off[2], w: +ext[1], h: +ext[2] };
}

function firstGradStop(gradXml) {
  const stop = gradXml.match(/<gs pos="?0"?>[\s\S]*?<srgbClr val="([0-9A-Fa-f]{6})"/);
  return stop ? stop[1].toUpperCase() : null;
}

// spPr XML → { type, hex, unknown }
function fillOf(spPrXml) {
  const f = firstFill(spPrXml);
  if (!f) return { type: 'none', hex: null, unknown: false };
  if (f.type === 'none') return { type: 'none', hex: null, unknown: false };
  if (f.type === 'solid') {
    const h = hexFromColor(f.xml);
    return { type: 'solid', hex: h && /^[0-9A-F]{6}$/.test(h) ? h : null, unknown: false };
  }
  if (f.type === 'grad') {
    const stop = firstGradStop(f.xml);
    return { type: 'grad', hex: stop, unknown: !stop };
  }
  return { type: f.type, hex: null, unknown: true }; // blip(사진)/pat(패턴)
}

function parseSlide(xml, theme, masterBgHex) {
  const s = stripNs(xml);

  // 슬라이드 배경
  let slideBgHex = masterBgHex || 'FFFFFF';
  let slideBgUnknown = false;
  const bgM = s.match(/<bg>([\s\S]*?)<\/bg>/);
  if (bgM) {
    const f = fillOf(bgM[1]);
    if (f.type === 'solid' && f.hex) slideBgHex = f.hex;
    else if (f.type === 'grad' && f.hex) slideBgHex = f.hex;
    else if (f.type !== 'none') slideBgUnknown = true; // 이미지/패턴 배경
  }

  // 패스 1: 모든 sp·pic을 문서 순서(하단→상단)로 레이어 수집
  const layers = [];
  const anyShapeRe = /<(sp|pic)>([\s\S]*?)<\/(?:sp|pic)>/g;
  let m;
  while ((m = anyShapeRe.exec(s))) {
    const kind = m[1];
    const body = m[2];
    const spPr = body.match(/<spPr>([\s\S]*?)<\/spPr>/);
    const geom = spPr ? parseXfrm(spPr[1]) : null;
    const fill = spPr ? fillOf(spPr[1]) : { type: 'none', hex: null, unknown: false };

    if (kind === 'pic') {
      const hasBlip = /<blipFill>/.test(body);
      layers.push({ kind: 'pic', geom, fillType: hasBlip ? 'blip' : fill.type, fillHex: null, unknown: hasBlip, runs: [] });
      continue;
    }

    // 텍스트 런 (rPr + t)
    const runs = [];
    const rRe = /<rPr([^>]*)\/?>([\s\S]*?)<\/rPr>|<rPr([^>]*)\/>/g;
    let rm;
    while ((rm = rRe.exec(body))) {
      const attrs = rm[1] || rm[3] || '';
      const szMatch = attrs.match(/sz="(\d+)"/);
      runs.push({
        sz: szMatch ? parseInt(szMatch[1], 10) / 100 : 18,
        bold: /b="1"/.test(attrs),
        italic: /i="1"/.test(attrs),
        color: null,
        text: '',
      });
    }
    const rpColorRe = /<rPr([^>]*)>([\s\S]*?)<\/rPr>/g;
    const rpColors = [];
    let rcm;
    while ((rcm = rpColorRe.exec(body))) {
      const sf = rcm[2].match(/<solidFill>([\s\S]*?)<\/solidFill>/);
      rpColors.push(sf ? hexFromColor(sf[1]) : null);
    }
    const texts = [];
    const tRe = /<t>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRe.exec(body))) texts.push(esc(tm[1]));

    const runsWithText = [];
    const n = Math.max(runs.length, texts.length);
    for (let i = 0; i < n; i++) {
      if (!texts[i]) continue;
      const rc = rpColors[i];
      runsWithText.push({
        sz: runs[i]?.sz ?? 18,
        bold: runs[i]?.bold ?? false,
        italic: runs[i]?.italic ?? false,
        color: rc && /^[0-9A-F]{6}$/.test(rc) ? rc : null, // schemeClr는 해석 불가 → null
        text: texts[i].trim(),
      });
    }

    layers.push({ kind: 'shape', geom, fillType: fill.type, fillHex: fill.hex, unknown: fill.unknown, runs: runsWithText, hasGrad: fill.type === 'grad' });
  }

  // 패스 2: 텍스트 셰이프의 시각적 배경 해석 (z-순서 컴포지팅)
  for (const layer of layers) {
    if (layer.kind !== 'shape' || !layer.runs.length) continue;
    let bg = null;
    let bgUnknown = false;
    if (layer.fillType === 'solid' && layer.fillHex) {
      bg = layer.fillHex;
    } else if (layer.fillType === 'grad' && layer.fillHex) {
      bg = layer.fillHex;
    } else if (layer.fillType === 'none' && layer.geom) {
      // 자신 아래의 레이어 중 텍스트 중심점을 포함하는 최상단 레이어 탐색
      const cx = layer.geom.x + layer.geom.w / 2;
      const cy = layer.geom.y + layer.geom.h / 2;
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        if (L === layer || !L.geom) continue;
        if (cx < L.geom.x || cx > L.geom.x + L.geom.w || cy < L.geom.y || cy > L.geom.y + L.geom.h) continue;
        if (L.kind === 'pic') { bgUnknown = true; break; }
        if (L.fillHex) { bg = L.fillHex; break; }
        if (L.fillType === 'none') continue; // 투명 → 더 아래 탐색
        bgUnknown = true; // blip/pat/그라디언트 미해석
        break;
      }
      if (!bg && !bgUnknown) bg = slideBgHex;
      if (slideBgUnknown && !bg && !bgUnknown) bgUnknown = true;
    } else {
      bgUnknown = true; // 자체 fill이 blip/pat/미해석 grad
    }
    layer._bg = bg;
    layer._bgUnknown = bgUnknown || (!bg && slideBgUnknown);
  }

  // 테이블/그룹 등 모든 텍스트 (전체 t) — 이모지/심볼 스캔용
  const allTexts = [];
  const allT = s.match(/<t>([\s\S]*?)<\/t>/g) || [];
  for (const t of allT) {
    const txt = esc(t.replace(/<\/?t>/g, ''));
    if (txt.trim()) allTexts.push(txt.trim());
  }

  return {
    slideBgHex,
    slideBgUnknown,
    shapes: layers,
    allTexts,
    hasGradients: /<gradFill>/.test(s),
    gradientCount: (s.match(/<gradFill>/g) || []).length,
  };
}

// ---------- 감사 실행 ----------
function auditSlide(slide, idx, theme, report) {
  const { slideBgHex, slideBgUnknown, shapes, allTexts, hasGradients, gradientCount } = slide;

  // AI 슬롭: 진짜 이모지 vs 기능적 심볼(체크·화살표) 구분
  for (const t of allTexts) {
    const e = countEmoji(t);
    if (e.emojiCount > 0) {
      report.aiSlop.emoji.push({ slide: idx, text: t.slice(0, 60), count: e.emojiCount, chars: e.emojiChars });
    }
    if (e.symbolCount > 0) {
      report.aiSlop.symbols.push({ slide: idx, text: t.slice(0, 60), count: e.symbolCount, chars: e.symbolChars });
    }
  }

  // AI 슬롭: 그라디언트
  if (hasGradients) {
    report.aiSlop.gradients.push({ slide: idx, count: gradientCount });
  }

  // 명암비 + 계층
  const sizes = new Map();
  for (const sh of shapes) {
    const bg = sh._bg;
    if (sh._bgUnknown) {
      report.unknownBg.push({ slide: idx, reason: sh.kind === 'pic' ? 'photo' : (sh.fillType || 'unknown'), textCount: sh.runs.length });
    }
    for (const r of sh.runs) {
      const fg = r.color;
      if (!fg) continue; // 색 미지정 — 테마 상속, 스킵
      const isLarge = r.sz >= 18;
      const min = isLarge ? 3 : 4.5;
      const level = sizes.get(r.sz) || { count: 0, sample: '' };
      level.count++;
      if (!level.sample) level.sample = r.text.slice(0, 24);
      sizes.set(r.sz, level);
      if (bg && contrast(fg, bg) < min) {
        report.accessibility.push({
          slide: idx,
          text: r.text.slice(0, 60),
          fg,
          bg,
          sizePt: r.sz,
          bold: r.bold,
          ratio: +contrast(fg, bg).toFixed(2),
          min,
          large: isLarge,
        });
      }
    }
  }

  // 계층: 슬라이드별 distinct 크기 수
  report.hierarchy.perSlide.push({
    slide: idx,
    distinctSizes: [...sizes.keys()].sort((a, b) => b - a),
    sizeCount: sizes.size,
    dominant: [...sizes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3).map(([sz, v]) => `${sz}pt(${v.count})`),
  });
}

export async function auditPptx(pptxPath) {
  const buf = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(buf);

  const report = {
    deck: path.basename(pptxPath),
    theme: { scheme: {}, font: {}, slideSize: null },
    designSystem: { colorUsage: {}, fontUsage: {}, sizeUsage: {} },
    aiSlop: { emoji: [], symbols: [], gradients: [], fontRedFlags: [] },
    accessibility: [],
    unknownBg: [],
    hierarchy: { perSlide: [], summary: null },
    slideCount: 0,
  };

  // 테마
  const themeEntry = zip.file('ppt/theme/theme1.xml');
  if (themeEntry) {
    const t = parseTheme(await themeEntry.async('string'));
    report.theme.scheme = t.scheme;
    report.theme.font = t.font;
  }

  // 슬라이드 크기
  const presEntry = zip.file('ppt/presentation.xml');
  if (presEntry) {
    const pres = stripNs(await presEntry.async('string'));
    const emu = pres.match(/<sldSz cx="(\d+)" cy="(\d+)"/);
    if (emu) {
      report.theme.slideSize = {
        wIn: +(parseInt(emu[1], 10) / 914400).toFixed(2),
        hIn: +(parseInt(emu[2], 10) / 914400).toFixed(2),
        wide: parseInt(emu[1], 10) > parseInt(emu[2], 10),
      };
    }
  }

  // 슬라이드 순회
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1], 10) - parseInt(b.match(/slide(\d+)/)[1], 10));

  report.slideCount = slideFiles.length;

  // 슬라이드 마스터 배경 — 슬라이드에 bg 없을 때 폴백
  let masterBgHex = 'FFFFFF';
  const masterEntry = zip.file('ppt/slideMasters/slideMaster1.xml');
  if (masterEntry) {
    const masterXml = await masterEntry.async('string');
    const ms = stripNs(masterXml);
    const mbg = ms.match(/<bg>([\s\S]*?)<\/bg>/);
    if (mbg) {
      const f = firstFill(mbg[1]);
      if (f && f.type === 'solid') {
        const h = hexFromColor(f.xml);
        if (h && /^[0-9A-F]{6}$/.test(h)) masterBgHex = h;
      } else if (f && f.type === 'grad') {
        const stop = f.xml.match(/<gs pos="?0"?>[\s\S]*?<srgbClr val="([0-9A-Fa-f]{6})"/);
        if (stop) masterBgHex = stop[1].toUpperCase();
      }
    }
  }

  // 색/폰트/크기 사용 통계용
  for (const f of slideFiles) {
    const xml = await zip.file(f).async('string');
    const slide = parseSlide(xml, report.theme, masterBgHex);
    const s = stripNs(xml);

    // 색 사용 (테마 클리어: 시각적 통계용)
    for (const mm of s.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)) {
      report.designSystem.colorUsage[mm[1].toUpperCase()] = (report.designSystem.colorUsage[mm[1].toUpperCase()] || 0) + 1;
    }
    for (const mm of s.matchAll(/schemeClr val="([a-zA-Z0-9]+)"/g)) {
      const k = mm[1].toLowerCase();
      report.designSystem.colorUsage[`scheme:${k}`] = (report.designSystem.colorUsage[`scheme:${k}`] || 0) + 1;
    }

    // 폰트 사용
    for (const mm of s.matchAll(/latin typeface="([^"]*)"/g)) {
      report.designSystem.fontUsage[mm[1]] = (report.designSystem.fontUsage[mm[1]] || 0) + 1;
    }
    for (const mm of s.matchAll(/ea typeface="([^"]*)"/g)) {
      report.designSystem.fontUsage[`${mm[1]}(한글)`] = (report.designSystem.fontUsage[`${mm[1]}(한글)`] || 0) + 1;
    }

    // 크기 사용
    for (const mm of s.matchAll(/(?:rPr|endParaRPr)([^>]*?)\/?>/g)) {
      const szm = mm[1].match(/sz="(\d+)"/);
      if (szm) {
        const pt = parseInt(szm[1], 10) / 100;
        report.designSystem.sizeUsage[pt] = (report.designSystem.sizeUsage[pt] || 0) + 1;
      }
    }

    auditSlide(slide, parseInt(f.match(/slide(\d+)/)[1], 10), report.theme, report);
  }

  // 폰트 레드 플래그 (AI 슬롭 관용구 폰트). Arial/Calibri는 SKILL.md가
  // 메트릭 안전 폰트로 지정하는 조합이므로 여기서 플래그하지 않는다 —
  // 웹폰트 관용구(Inter/Roboto)만 잡는다.
  for (const [font, cnt] of Object.entries(report.designSystem.fontUsage)) {
    if (/(^|[^A-Za-z])Inter([^A-Za-z]|$)/.test(font) || /Roboto/.test(font)) {
      report.aiSlop.fontRedFlags.push({ font, count: cnt });
    }
  }

  // 계층 요약
  const allSizes = report.hierarchy.perSlide.map((p) => p.sizeCount);
  report.hierarchy.summary = {
    avgDistinctSizes: +(allSizes.reduce((a, b) => a + b, 0) / Math.max(allSizes.length, 1)).toFixed(1),
    maxDistinctSizes: Math.max(...allSizes, 0),
    slidesWithMoreThan4Levels: report.hierarchy.perSlide.filter((p) => p.sizeCount > 4).length,
  };

  // 접근성 요약
  const high = report.accessibility.filter((a) => a.ratio < a.min * 0.8).length;
  const med = report.accessibility.filter((a) => a.ratio >= a.min * 0.8 && a.ratio < a.min).length;
  report.accessibilitySummary = { total: report.accessibility.length, high, med, top: report.accessibility.slice(0, 15) };

  report.aiSlopSummary = {
    emojiSlides: report.aiSlop.emoji.length,
    symbolSlides: report.aiSlop.symbols.length,
    gradientSlides: report.aiSlop.gradients.length,
    fontRedFlags: report.aiSlop.fontRedFlags,
  };
  report.unknownBgCount = report.unknownBg.length;

  return report;
}

// ---------- 마크다운 렌더 ----------
export function renderMarkdown(r) {
  const L = [];
  L.push(`# WhaleX 디자인 감사 — ${r.deck}`);
  L.push('');
  L.push(`- 슬라이드 수: **${r.slideCount}**`);
  if (r.theme.slideSize) L.push(`- 캔버스: **${r.theme.slideSize.wIn} × ${r.theme.slideSize.hIn} in** (${r.theme.slideSize.wide ? 'WIDE' : '세로'})`);
  L.push('');

  // 테마
  L.push('## 1. 테마 (추출)');
  L.push('');
  L.push('| 키 | 색상 |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(r.theme.scheme)) L.push(`| ${k} | \`#${v}\` |`);
  L.push('');
  if (r.theme.font.major) L.push(`- majorFont: 라틴 \`${r.theme.font.major.latin}\` / 한글 \`${r.theme.font.major.ea}\``);
  if (r.theme.font.minor) L.push(`- minorFont: 라틴 \`${r.theme.font.minor.latin}\` / 한글 \`${r.theme.font.minor.ea}\``);
  L.push('');

  // 색 사용 상위
  L.push('## 2. 색상 사용 빈도 (상위 12)');
  L.push('');
  L.push('| 색 | 횟수 |');
  L.push('|---|---|');
  const topColors = Object.entries(r.designSystem.colorUsage).sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [c, n] of topColors) L.push(`| \`${c}\` | ${n} |`);
  L.push('');

  // 폰트
  L.push('## 3. 폰트 사용');
  L.push('');
  L.push('| 폰트 | 횟수 |');
  L.push('|---|---|');
  for (const [f, n] of Object.entries(r.designSystem.fontUsage).sort((a, b) => b[1] - a[1])) L.push(`| ${f} | ${n} |`);
  L.push('');

  // AI 슬롭
  L.push('## 4. AI 슬롭 체크');
  L.push('');
  L.push(`- 진짜 이모지 슬라이드: **${r.aiSlopSummary.emojiSlides}**건`);
  L.push(`- 기능 심볼(✓ ✕ ❯ 등 체크/화살표): **${r.aiSlopSummary.symbolSlides}**건 — 대부분 의도된 용도, 수동 확인 권장`);
  L.push(`- 그라디언트 슬라이드: **${r.aiSlopSummary.gradientSlides}**건`);
  L.push(`- 관용구 폰트: ${r.aiSlopSummary.fontRedFlags.map((f) => `\`${f.font}\`(${f.count})`).join(', ') || '없음'}`);
  L.push('');
  if (r.aiSlop.emoji.length) {
    L.push('### 이모지 상세 (주의)');
    L.push('');
    L.push('| 슬라이드 | 텍스트 | 수 | 문자 |');
    L.push('|---|---|---|---|');
    for (const e of r.aiSlop.emoji.slice(0, 15)) L.push(`| ${e.slide} | ${e.text} | ${e.count} | ${e.chars.join(' ')} |`);
    L.push('');
  }
  if (r.aiSlop.symbols.length) {
    L.push('### 기능 심볼 상세 (정보성)');
    L.push('');
    L.push('| 슬라이드 | 텍스트 | 수 | 문자 |');
    L.push('|---|---|---|---|');
    for (const e of r.aiSlop.symbols.slice(0, 10)) L.push(`| ${e.slide} | ${e.text} | ${e.count} | ${e.chars.join(' ')} |`);
    L.push('');
  }
  if (r.aiSlop.gradients.length) {
    L.push('### 그라디언트 상세');
    L.push('');
    for (const g of r.aiSlop.gradients) L.push(`- 슬라이드 ${g.slide}: ${g.count}개`);
    L.push('');
  }

  // 접근성
  L.push('## 5. 접근성 (명암비)');
  L.push('');
  L.push(`- 위반: **${r.accessibilitySummary.total}건** (High ${r.accessibilitySummary.high} / Med ${r.accessibilitySummary.med})`);
  if (r.unknownBgCount) L.push(`- 배경 불확정(이미지/그라디언트 배경)으로 계산 제외: **${r.unknownBgCount}**건 — 수동 확인 대상`);
  L.push('');
  L.push('| 슬라이드 | 텍스트 | 전경 | 배경 | 크기 | 대비 | 기준 |');
  L.push('|---|---|---|---|---|---|---|');
  for (const a of r.accessibilitySummary.top) {
    L.push(`| ${a.slide} | ${a.text} | \`#${a.fg}\` | \`#${a.bg}\` | ${a.sizePt}pt | ${a.ratio} | ${a.min}:1 |`);
  }
  L.push('');

  // 계층
  L.push('## 6. 계층/리듬');
  L.push('');
  L.push(`- 슬라이드당 평균 구분 텍스트 크기: **${r.hierarchy.summary.avgDistinctSizes}**`);
  L.push(`- 최대: ${r.hierarchy.summary.maxDistinctSizes} / 4단계 초과 슬라이드: **${r.hierarchy.summary.slidesWithMoreThan4Levels}**`);
  L.push('');
  const busy = r.hierarchy.perSlide.filter((p) => p.sizeCount > 4);
  if (busy.length) {
    L.push('| 슬라이드 | 크기 단계 | 주 사용 |');
    L.push('|---|---|---|');
    for (const b of busy.slice(0, 10)) L.push(`| ${b.slide} | ${b.sizeCount} (${b.distinctSizes.join('/')}pt) | ${b.dominant.join(', ')} |`);
    L.push('');
  }

  L.push('---');
  L.push('*WhaleX QA — audit-pptx.mjs 자동 생성 · ai-slop-check/accessibility-audit/hierarchy-rhythm-review 스킬 적용*');
  return L.join('\n');
}

// ---------- CLI ----------
const scriptReal = path.resolve(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'));
const argvReal = path.resolve(process.argv[1] || '');
if (argvReal === scriptReal) {
  const input = process.argv[2];
  const outDir = process.argv[3] || 'whalex-design/qa/reports';
  if (!input) {
    console.error('사용법: node whalex-design/qa/audit-pptx.mjs <input.pptx> [output-dir]');
    process.exit(1);
  }
  auditPptx(input).then((report) => {
    const base = path.basename(input).replace(/\.pptx$/i, '');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${base}-audit.json`), JSON.stringify(report, null, 2), 'utf8');
    const md = renderMarkdown(report);
    fs.writeFileSync(path.join(outDir, `${base}-audit.md`), md, 'utf8');
    console.log(`✅ 리포트 생성: ${path.join(outDir, base + '-audit.md')}`);
    console.log(`   JSON: ${path.join(outDir, base + '-audit.json')}`);
    console.log(`   슬라이드 ${report.slideCount}개 · 명암비 위반 ${report.accessibilitySummary.total}건 · 이모지 슬라이드 ${report.aiSlopSummary.emojiSlides}건`);
  }).catch((e) => {
    console.error('감사 실패:', e);
    process.exit(1);
  });
}
