---
name: testing-pinta16-gallery
description: Test Pinta16 gallery, marquee, and 3D motion behavior on desktop and mobile. Use when verifying gallery UI, PaintingMarquee, or responsive motion changes.
---

# Testing Pinta16 Gallery Motion

## Devin Secrets Needed

None for public gallery testing.

## Setup

- Prefer Cloudflare Pages preview URLs from the PR checks when they are publicly accessible.
- If Pages previews are behind Cloudflare Access, use a local built preview:
  ```bash
  npm run build
  npx vite preview --host 127.0.0.1 --port 4173
  ```
- Pages is the canonical deployment path. Cloudflare Workers checks may be non-required and may fail independently of the Pages frontend.

## Core Checks

1. Open the gallery route (`/#gallery`).
2. Confirm removed intro/promo panel copy is absent when relevant.
3. Verify desktop artwork cards still render in a multi-column masonry layout.
4. Hover a gallery card and confirm transform changes, then returns after pointer leave.
5. Verify PaintingMarquee:
   - `.painting-marquee-track` animation duration is expected.
   - Tile count stays under the expected cap.
   - Hover/focus pauses the track and pointer leave resumes it.
6. Resize to a narrow mobile window and verify:
   - `document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1`.
   - Gallery cards are stacked single-column with matching x-position.
   - No visible horizontal scrollbar.

## Useful Playwright CDP Snippet

Attach to Devin Chrome via CDP when the browser is already open:

```js
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://localhost:29229');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('127.0.0.1'));
```

Use computed-style checks for motion state rather than only relying on visual inspection.

## Notes

- `vite preview` does not serve Cloudflare Pages Functions; local `/api/*` requests may return 404 even when the frontend motion behavior is valid.
- Record GUI testing when demonstrating hover, marquee motion, or responsive layout behavior.
