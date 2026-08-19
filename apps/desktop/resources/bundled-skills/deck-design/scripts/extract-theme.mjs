#!/usr/bin/env node
// WhaleX Design — pptx theme extractor (dependency-free).
// Usage: node extract-theme.mjs <deck.pptx>
// Prints JSON: theme colors, major/minor fonts, slide size, per-slide text
// and font sizes — everything needed to build a NEW deck that stays visually
// consistent with an existing one.
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2];
if (!file) {
  console.error("usage: node extract-theme.mjs <deck.pptx>");
  process.exit(1);
}
const buf = fs.readFileSync(file);

// --- minimal zip reader (central directory) ---
function readZip(b) {
  const out = new Map();
  // find End Of Central Directory
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(off) !== 0x02014b50) break;
    const method = b.readUInt16LE(off + 10);
    const csize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const cmtLen = b.readUInt16LE(off + 32);
    const lho = b.readUInt32LE(off + 42);
    const name = b.toString("utf8", off + 46, off + 46 + nameLen);
    // local header: skip its own name/extra lengths
    const lnl = b.readUInt16LE(lho + 26);
    const lel = b.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lnl + lel;
    const raw = b.subarray(dataStart, dataStart + csize);
    out.set(name, { method, raw });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}
const entries = readZip(buf);
const text = (name) => {
  const e = entries.get(name);
  if (!e) return null;
  return (e.method === 8 ? zlib.inflateRawSync(e.raw) : e.raw).toString("utf8");
};

// --- theme colors + fonts ---
const theme = text("ppt/theme/theme1.xml") ?? "";
const colors = {};
for (const m of theme.matchAll(/<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g)) {
  colors[m[1]] = (m[2] ?? m[3]).toUpperCase();
}
const fonts = {};
const major = /<a:majorFont>[\s\S]*?<a:latin typeface="([^"]*)"[\s\S]*?<\/a:majorFont>/.exec(theme);
const minor = /<a:minorFont>[\s\S]*?<a:latin typeface="([^"]*)"[\s\S]*?<\/a:minorFont>/.exec(theme);
const majorEa = /<a:majorFont>[\s\S]*?<a:ea typeface="([^"]*)"[\s\S]*?<\/a:majorFont>/.exec(theme);
const minorEa = /<a:minorFont>[\s\S]*?<a:ea typeface="([^"]*)"[\s\S]*?<\/a:minorFont>/.exec(theme);
if (major) fonts.majorLatin = major[1];
if (minor) fonts.minorLatin = minor[1];
if (majorEa?.[1]) fonts.majorEastAsian = majorEa[1];
if (minorEa?.[1]) fonts.minorEastAsian = minorEa[1];

// --- slide size ---
const pres = text("ppt/presentation.xml") ?? "";
const sz = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(pres);
const EMU_PER_IN = 914400;
const slideSize = sz
  ? { widthIn: +(sz[1] / EMU_PER_IN).toFixed(2), heightIn: +(sz[2] / EMU_PER_IN).toFixed(2) }
  : null;

// --- per-slide text runs with explicit colors/sizes (sampled) ---
const slides = [];
const names = [...entries.keys()]
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
for (const n of names.slice(0, 20)) {
  const xml = text(n) ?? "";
  const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).filter((t) => t.trim());
  const sizes = [...new Set([...xml.matchAll(/sz="(\d+)"/g)].map((m) => +m[1] / 100))].sort((a, b) => b - a);
  const usedColors = [...new Set([...xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()))];
  const usedFonts = [...new Set([...xml.matchAll(/typeface="([^"]+)"/g)].map((m) => m[1]))];
  slides.push({
    slide: +n.match(/\d+/)[0],
    textPreview: texts.slice(0, 6),
    fontSizesPt: sizes.slice(0, 8),
    colors: usedColors.slice(0, 10),
    fonts: usedFonts.slice(0, 6),
  });
}

console.log(
  JSON.stringify(
    { file, slideCount: names.length, slideSize, themeColors: colors, themeFonts: fonts, slides },
    null,
    2,
  ),
);
