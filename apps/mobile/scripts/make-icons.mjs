#!/usr/bin/env node
/**
 * Builds the launcher artwork from the desktop app's whale mark.
 *
 * The source logo sits on transparency and mixes a dark navy body with white
 * belly stripes, so it needs a light ground to read: on a dark launcher icon
 * the body would disappear, on pure white the belly would. A pale blue
 * gradient keeps both edges visible.
 *
 * Run from apps/mobile:  node scripts/make-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import Jimp from "jimp";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, "../../desktop/build/icon.png");
const OUT = path.resolve(here, "../assets");
const SIZE = 1024;

/** Diagonal wash: white at the top-left, pale blue at the bottom-right. */
const TOP = { r: 0xff, g: 0xff, b: 0xff };
const BOTTOM = { r: 0xd2, g: 0xe4, b: 0xff };

function gradient(size = SIZE) {
  const img = new Jimp(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x / size + y / size) / 2;
      const c = Jimp.rgbaToInt(
        Math.round(TOP.r + (BOTTOM.r - TOP.r) * t),
        Math.round(TOP.g + (BOTTOM.g - TOP.g) * t),
        Math.round(TOP.b + (BOTTOM.b - TOP.b) * t),
        255,
      );
      img.setPixelColor(c, x, y);
    }
  }
  return img;
}

/** Places the mark centred at `scale` of the canvas. */
function centred(base, mark, scale) {
  const w = Math.round(SIZE * scale);
  const art = mark.clone().resize(w, Jimp.AUTO);
  return base.composite(art, Math.round((SIZE - w) / 2), Math.round((SIZE - art.bitmap.height) / 2));
}

const mark = await Jimp.read(SOURCE);

// Full-bleed icon: iOS and the Play listing crop their own corners.
await centred(gradient(), mark, 0.8).writeAsync(path.join(OUT, "icon.png"));

// Adaptive icon. Android crops to a mask and animates within it, so the mark
// must stay inside the inner ~66% or the launcher will clip its tail.
await centred(new Jimp(SIZE, SIZE, 0x00000000), mark, 0.58).writeAsync(
  path.join(OUT, "android-icon-foreground.png"),
);
await gradient().writeAsync(path.join(OUT, "android-icon-background.png"));

// Themed icons are a single-colour stencil: keep the silhouette, drop the art.
const mono = mark.clone();
mono.scan(0, 0, mono.bitmap.width, mono.bitmap.height, (_x, _y, idx) => {
  if (mono.bitmap.data[idx + 3] > 24) {
    mono.bitmap.data[idx] = 0xff;
    mono.bitmap.data[idx + 1] = 0xff;
    mono.bitmap.data[idx + 2] = 0xff;
  }
});
await centred(new Jimp(SIZE, SIZE, 0x00000000), mono, 0.58).writeAsync(
  path.join(OUT, "android-icon-monochrome.png"),
);

// Splash art rides on the app's own background colour, so it stays cut out.
await centred(new Jimp(SIZE, SIZE, 0x00000000), mark, 0.62).writeAsync(
  path.join(OUT, "splash-icon.png"),
);

await centred(gradient(), mark, 0.82)
  .resize(96, 96)
  .writeAsync(path.join(OUT, "favicon.png"));

console.log("icons written to", OUT);
