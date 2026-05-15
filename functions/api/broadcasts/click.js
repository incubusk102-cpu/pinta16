// GET /api/broadcasts/click?b=<broadcastId>&r=<recipientHash>&u=<encodedUrl>
//
// Public click tracker. Records the click into KV (best-effort) and
// redirects the recipient to the destination URL. The destination is
// validated to be http(s) so this endpoint cannot be used as an
// open-redirect for arbitrary schemes (e.g. javascript:).

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { recordClick } from "../_lib/broadcasts.js";

const FALLBACK_URL = "https://canvhub.com/";

const isHttpUrl = (s) => {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const url = new URL(request.url);
  const broadcastId = url.searchParams.get("b") || "";
  const recipientHash = url.searchParams.get("r") || "";
  const target = url.searchParams.get("u") || "";

  const destination = isHttpUrl(target) ? target : FALLBACK_URL;

  if (broadcastId && recipientHash && isHttpUrl(target)) {
    try {
      await recordClick(broadcastId, recipientHash, destination);
    } catch {
      // Tracking failure must not prevent the redirect — log loss
      // is preferable to leaving the user staring at an error.
    }
  }

  return Response.redirect(destination, 302);
};
