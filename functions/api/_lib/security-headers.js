// Common security headers applied to every JSON API response. Static asset
// CSP / HSTS / framing rules are configured in `public/_headers` so the CDN
// can stamp them on HTML/JS too.

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
};

export const withSecurityHeaders = (extra = {}) => ({
  "Content-Type": "application/json",
  ...SECURITY_HEADERS,
  ...extra,
});
