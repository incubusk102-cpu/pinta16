# Image optimisation

The static gallery / hero images live in `public/images/` as full-resolution
PNG / JPEG masters. They are typically 1–18 MB each — ideal for printing,
catastrophic for first-paint on 4G.

`scripts/optimize-images.mjs` generates responsive WebP variants alongside
each master:

```
public/images/12.png        17.3 MB   (original master, kept for legacy fallback)
public/images/12-300.webp     14 KB   (mobile thumbnail)
public/images/12-600.webp     38 KB   (mobile hero / 2-up gallery)
public/images/12-1200.webp    96 KB   (tablet + desktop card grid)
public/images/12-1800.webp   170 KB   (full-width retina hero)
```

The build runs the script automatically via `prebuild` in `package.json`:

```json
"prebuild": "node scripts/optimize-images.mjs"
```

You can also run it on demand:

```bash
npm run optimize:images
```

The script is **idempotent** — if a `-<width>.webp` already exists and is
newer than its source, it's skipped. So the typical CI rebuild costs
≪ 1 second. Adding a new master triggers a one-time encode of the four
variants for that file only.

## How call sites use it

`ImageWithFallback` (used everywhere art images are rendered) sniffs `src`
for the `/images/<name>.<ext>` pattern. When matched it emits:

```html
<picture>
  <source type="image/webp"
          srcset="/images/12-300.webp 300w,
                  /images/12-600.webp 600w,
                  /images/12-1200.webp 1200w,
                  /images/12-1800.webp 1800w" />
  <img src="/images/12.png" sizes="(max-width: 640px) 100vw,
                                   (max-width: 1024px) 50vw,
                                   33vw"
       loading="lazy" decoding="async" />
</picture>
```

The browser:

1. Picks the smallest WebP variant that satisfies the layout's `sizes`
   hint — a phone in portrait downloads the 600w (≈ 40 KB), a desktop
   in the gallery grid downloads the 1200w (≈ 100 KB).
2. Falls back to the original PNG / JPEG only on the rare browser that
   doesn't support WebP (≈ 1 % global; mostly old Android stock
   browsers).

Admin-uploaded images (URLs like `/api/r/<id>` from the KV/R2 store) and
any external CDN URL render as a plain `<img>` — they don't match the
static-images pattern so the picture wrapper is skipped.

## Tuning

If LCP on a particular page is still slow, override `sizes` per call
site to give the browser a better hint:

```tsx
// Hero spans 100% of the viewport on every breakpoint
<ImageWithFallback src="/images/1.png" alt="…" sizes="100vw" />

// Thumbnail in a fixed-width column
<ImageWithFallback src="/images/14.png" alt="…" sizes="300px" />
```

## Adding new images

1. Drop the master into `public/images/` (PNG, JPG, or JPEG).
2. Run `npm run optimize:images` (or just `npm run build`).
3. Reference it normally — `<img src="/images/foo.png">` or
   `<ImageWithFallback src="/images/foo.png" alt="…" />` — the WebP
   variants get wired up automatically.

## Tweaking quality / sizes

`WIDTHS` and `WEBP_OPTIONS` live at the top of
`scripts/optimize-images.mjs`. Keep them in sync with the `WIDTHS`
constant in `src/components/ImageWithFallback.tsx` if you change them
(both files have a comment cross-referencing the other).

The default `quality: 78, effort: 4` is a deliberate sweet-spot:
visually indistinguishable from the master at typical display sizes,
~1 % the file size, and encodes ~10× faster than `effort: 6`.
