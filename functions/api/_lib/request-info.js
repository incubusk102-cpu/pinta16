// Helpers for extracting client IP / user-agent and parsing the UA into
// human-readable browser / OS / device labels for admin display. Best-effort
// only — UA strings are not authoritative.

const headerValue = (event, name) => {
  if (!event || !event.headers) return "";
  const lower = name.toLowerCase();
  for (const key of Object.keys(event.headers)) {
    if (key.toLowerCase() === lower) {
      const v = event.headers[key];
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v[0] || "";
    }
  }
  return "";
};

export const getClientIp = (event) => {
  // Cloudflare-supplied client IP is the most trustworthy source on Pages.
  const cf = headerValue(event, "cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const xff = headerValue(event, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first.slice(0, 64);
  }
  const real = headerValue(event, "x-real-ip");
  if (real) return real.trim().slice(0, 64);
  return "";
};

export const getUserAgent = (event) =>
  String(headerValue(event, "user-agent") || "").slice(0, 500);

const detectBrowser = (ua) => {
  if (!ua) return "Unknown";
  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/i);
    return `Edge ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) {
    const m = ua.match(/OPR\/([\d.]+)/i) || ua.match(/Opera\/([\d.]+)/i);
    return `Opera ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  if (/Brave\//i.test(ua)) {
    const m = ua.match(/Brave\/([\d.]+)/i);
    return `Brave ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  if (/Firefox\//i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/i);
    return `Firefox ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/i);
    return `Chrome ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/i);
    return `Safari ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  return "Unknown browser";
};

const detectOS = (ua) => {
  if (!ua) return "Unknown";
  if (/Windows NT 11/i.test(ua)) return "Windows 11";
  if (/Windows NT 10/i.test(ua)) return "Windows 10";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Android\s([\d.]+)/i.test(ua)) {
    const m = ua.match(/Android\s([\d.]+)/i);
    return `Android ${m?.[1]?.split(".")[0] || ""}`.trim();
  }
  if (/iPhone OS\s([\d_]+)/i.test(ua) || /iOS\s([\d.]+)/i.test(ua)) {
    const m = ua.match(/(?:iPhone OS|iOS)\s([\d._]+)/i);
    const v = (m?.[1] || "").replace(/_/g, ".").split(".")[0];
    return `iOS ${v}`.trim();
  }
  if (/iPad/i.test(ua)) return "iPadOS";
  if (/Mac OS X\s([\d_]+)/i.test(ua)) {
    const m = ua.match(/Mac OS X\s([\d_]+)/i);
    const v = (m?.[1] || "")
      .replace(/_/g, ".")
      .split(".")
      .slice(0, 2)
      .join(".");
    return `macOS ${v}`.trim();
  }
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown OS";
};

const detectDevice = (ua) => {
  if (!ua) return "desktop";
  if (/iPad/i.test(ua) || /Tablet/i.test(ua)) return "tablet";
  if (/Mobile|Android|iPhone|iPod|Phone/i.test(ua)) return "mobile";
  return "desktop";
};

export const parseUserAgent = (ua) => ({
  browser: detectBrowser(ua),
  os: detectOS(ua),
  device: detectDevice(ua),
});

export const captureRequestMeta = (event) => {
  const ip = getClientIp(event);
  const userAgent = getUserAgent(event);
  const parsed = parseUserAgent(userAgent);
  return {
    ip,
    userAgent,
    browser: parsed.browser,
    os: parsed.os,
    device: parsed.device,
    capturedAt: new Date().toISOString(),
  };
};
