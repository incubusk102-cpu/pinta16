#!/usr/bin/env node
// Build-time image optimisation.
//
// Reads every PNG / JPEG in public/images/ and emits responsive WebP
// variants alongside them at public/images/<name>-<width>.webp for the
// widths defined in WIDTHS. The originals are kept so existing
// references (and admin-uploaded paths) keep working — the WebPs are
// referenced by ImageWithFallback via a <picture> + srcset wrapper.
//
// Idempotent: if a WebP variant is newer than its source it is
// skipped, so the script costs ~milliseconds on rebuilds.
//
// Run automatically by `npm run build` via the `prebuild` script.
// Run on demand with `npm run optimize:images`.

import { readdir, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, "..", "public", "images");

// Widths chosen to cover the full responsive range:
//  - 300  : thumbnails / cart drawer / wishlist tiles
//  - 600  : phone hero / 2-up gallery on mobile
//  - 1200 : tablet + desktop card grid
//  - 1800 : full-width hero on retina desktop
// The browser picks the smallest one that satisfies the layout's
// `sizes` attribute, so a phone never downloads the 1800w variant.
const WIDTHS = [300, 600, 1200, 1800];

// Rough quality / effort knobs. effort: 4 is the sweet spot —
// noticeably smaller than 0–2, an order of magnitude faster than 6.
const WEBP_OPTIONS = { quality: 78, effort: 4 };

const SOURCE_RE = /\.(png|jpe?g)$/i;

const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

async function isUpToDate(sourcePath, targetPath) {
  if (!existsSync(targetPath)) return false;
  const [s, t] = await Promise.all([stat(sourcePath), stat(targetPath)]);
  // Source must be strictly older than target — otherwise the source
  // changed and we need to regenerate.
  return s.mtimeMs <= t.mtimeMs;
}

async function optimizeOne(sourcePath, baseName) {
  const meta = await sharp(sourcePath).metadata();
  const sourceWidth = meta.width ?? 0;
  const tasks = [];

  for (const width of WIDTHS) {
    // Don't upscale — if the source is smaller than the target width,
    // emit at the source's native width so we don't waste bytes
    // pretending we have more pixels than we do.
    const targetWidth = Math.min(width, sourceWidth || width);
    const targetPath = path.join(IMAGES_DIR, `${baseName}-${width}.webp`);

    if (await isUpToDate(sourcePath, targetPath)) {
      tasks.push({ width, skipped: true, targetPath });
      continue;
    }

    const buffer = await sharp(sourcePath)
      .rotate() // honour EXIF orientation
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp(WEBP_OPTIONS)
      .toBuffer();

    await sharp(buffer).toFile(targetPath);
    const { size } = await stat(targetPath);
    tasks.push({ width, skipped: false, targetPath, size });
  }

  return tasks;
}

async function main() {
  if (!existsSync(IMAGES_DIR)) {
    console.log(`[optimize-images] no ${IMAGES_DIR} — nothing to do`);
    return;
  }

  await mkdir(IMAGES_DIR, { recursive: true });

  const entries = await readdir(IMAGES_DIR);
  const sources = entries
    .filter((name) => SOURCE_RE.test(name))
    .filter((name) => !/-(\d+)\.webp$/.test(name)); // never re-process emitted variants

  if (sources.length === 0) {
    console.log("[optimize-images] no source images found");
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let generated = 0;
  let skipped = 0;

  for (const name of sources) {
    const sourcePath = path.join(IMAGES_DIR, name);
    const baseName = name.replace(SOURCE_RE, "");
    const sourceSize = (await stat(sourcePath)).size;
    totalBefore += sourceSize;

    try {
      const tasks = await optimizeOne(sourcePath, baseName);
      const newOnes = tasks.filter((t) => !t.skipped);
      generated += newOnes.length;
      skipped += tasks.length - newOnes.length;
      const sizeOut = newOnes.reduce((acc, t) => acc + (t.size ?? 0), 0);
      totalAfter += sizeOut;

      const summary = newOnes.length
        ? newOnes.map((t) => `${t.width}w=${formatBytes(t.size)}`).join(" ")
        : "up-to-date";
      console.log(
        `[optimize-images] ${name} (${formatBytes(sourceSize)}) → ${summary}`,
      );
    } catch (err) {
      console.error(`[optimize-images] failed on ${name}:`, err.message);
      // Don't fail the whole build for one bad source — just skip it.
    }
  }

  console.log(
    `[optimize-images] done. ${generated} variants generated, ${skipped} cached.`,
  );
  if (generated > 0) {
    console.log(
      `[optimize-images] sources: ${formatBytes(totalBefore)} | new webp: ${formatBytes(totalAfter)}`,
    );
  }
}

main().catch((err) => {
  console.error("[optimize-images] fatal:", err);
  process.exit(1);
});
