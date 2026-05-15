// /api/hero-slides/events — public beacon for hero-carousel impressions
// and CTA clicks. Storefront calls it from `src/components/HeroSlider.tsx`
// (impression on slide settle, click on CTA navigation). Persisted to D1
// (`hero_events` table) for the per-slide CTR panel in the admin Hero
// Slides editor.
//
// Beacon-shaped: best-effort, never throws back at the shopper, silently
// no-ops when D1 isn't bound — the public site behaves identically with
// or without the analytics back-end attached.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { withSecurityHeaders } from "../_lib/security-headers.js";
import { logError } from "../_lib/redact.js";
import { isD1Available, recordHeroEvent } from "../_lib/d1.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: withSecurityHeaders(),
  });

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const HERO_KINDS = new Set(["impression", "click"]);
const SLIDE_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/;

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (!isD1Available()) {
    return json(200, { recorded: false, reason: "d1-unbound" });
  }

  const body = await parseJson(request);
  if (!body || typeof body !== "object") {
    return json(400, { error: "JSON body required" });
  }

  const sessionId =
    typeof body.sessionId === "string"
      ? body.sessionId.trim().slice(0, 64)
      : "";
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return json(400, { error: "sessionId required" });
  }

  const slideId = typeof body.slideId === "string" ? body.slideId.trim() : "";
  if (!SLIDE_ID_RE.test(slideId)) {
    return json(400, { error: "slideId required" });
  }

  const kind = typeof body.kind === "string" ? body.kind.toLowerCase() : "";
  if (!HERO_KINDS.has(kind)) {
    return json(400, { error: "unknown kind" });
  }

  const id =
    typeof body.id === "string" && body.id.length > 0 && body.id.length <= 96
      ? body.id
      : null;

  try {
    const result = await recordHeroEvent({ id, sessionId, slideId, kind });
    return json(200, result || { recorded: false });
  } catch (error) {
    logError("hero-slides/events POST error:", error);
    return json(500, { error: "Could not record hero event" });
  }
};
