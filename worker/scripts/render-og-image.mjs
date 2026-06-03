/**
 * Letterbox og-image-source.png → og-image.png at 1200×630 (1.91:1).
 * Preserves the generated artwork’s typography (no stretch).
 *
 * Edit public/og-image-source.png, then: npm run render:og
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT_W = 1200;
const OUT_H = 630;
/** Match audit bar / OG SVG background */
const BG = { r: 13, g: 40, b: 71 };

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const sourcePath = path.join(publicDir, "og-image-source.png");
const outPath = path.join(publicDir, "og-image.png");

const meta = await sharp(sourcePath).metadata();
const scale = Math.min(OUT_W / meta.width, OUT_H / meta.height);
const w = Math.round(meta.width * scale);
const h = Math.round(meta.height * scale);

const resized = await sharp(sourcePath).resize(w, h, { fit: "inside" }).png().toBuffer();

await sharp({
  create: { width: OUT_W, height: OUT_H, channels: 3, background: BG },
})
  .composite([{ input: resized, left: Math.round((OUT_W - w) / 2), top: Math.round((OUT_H - h) / 2) }])
  .png()
  .toFile(outPath);

console.log(`Wrote ${outPath} (${OUT_W}×${OUT_H}, source ${meta.width}×${meta.height} → ${w}×${h} centered)`);
