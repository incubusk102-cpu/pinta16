// Swaps the `media="print"` deferred-fonts <link> back to a real
// stylesheet now that the document has parsed, so Playfair Display
// and EB Garamond load without blocking First Contentful Paint.
//
// CSP-safe: this file is loaded as `<script src="/font-defer.js">`
// from `index.html` rather than inlined as an `onload="..."`
// attribute, because the canvhub CSP `script-src` directive does
// not allow `'unsafe-inline'` (see public/_headers).
//
// Defensive: tolerates the absence of the deferred link (e.g. if a
// future tweak removes the second `<link>` tag) by silently no-op-ing.
(function () {
  var l = document.getElementById("deferred-fonts");
  if (!l) return;
  // If the browser already swapped via a future native primitive,
  // skip the work.
  if (l.media !== "print") return;
  l.media = "all";
})();
