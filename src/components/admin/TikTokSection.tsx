import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useProducts } from "@/contexts/ProductContext";
import { defaultArtworks } from "@/lib/artworks";
import { jsonAuthHeaders } from "@/lib/api";

interface SelectableProduct {
  id: string;
  image: string;
  title: string;
}

interface TikTokAccountStatus {
  configured: boolean;
  redirectUri: string | null;
  kvBindingMissing: boolean;
  connected: boolean;
  account: {
    openId: string | null;
    unionId: string | null;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null;
  token: {
    expiresInSeconds: number;
    expiresInDays: number;
    refreshExpiresInDays: number;
    refreshExpired: boolean;
    refreshedAt: number | null;
    connectedAt: number | null;
    scope: string | null;
    openId: string | null;
  } | null;
  creator: {
    privacyLevelOptions: string[] | null;
    commentDisabled?: boolean;
    duetDisabled?: boolean;
    stitchDisabled?: boolean;
  } | null;
  errors: string[];
  d1Available: boolean;
  schemaApplied: boolean;
  autoPostEnabled?: boolean;
  counts: { total: number; published: number; failed: number } | null;
  // True when the stored OAuth token was issued under an older scope
  // set than what TIKTOK_SCOPES asks for now. The admin must click
  // Disconnect + Connect once to mint a fresh token.
  needsReconnect?: boolean;
  missingScopes?: string[];
  requiredScopes?: string[];
}

interface CaptionPreview {
  productId: string;
  caption: string;
  captionLength: number;
  maxCaptionLength: number;
  imageUrl: string | null;
  imageReachable: boolean;
}

interface TikTokPostRow {
  id: string;
  product_id: string;
  publish_id: string | null;
  tiktok_post_id: string | null;
  share_url: string | null;
  caption: string | null;
  image_url: string | null;
  post_mode: string;
  media_type: string;
  status: string;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
}

interface PublishResult {
  ok: boolean;
  shareUrl?: string | null;
  postId?: string | null;
  status?: string | null;
  error?: string;
  errorCode?: string | null;
  publishId?: string | null;
  pending?: boolean;
  uploadedBytes?: number | null;
}

const formatBytes = (n: number | null | undefined) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const MAX_CAPTION_LENGTH = 2200;
const FEED_PREVIEW_CAP = 150;

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "published":
      return "bg-green-100 text-green-800 ring-1 ring-green-200";
    case "processing":
    case "pending":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "failed":
      return "bg-red-100 text-red-800 ring-1 ring-red-200";
    default:
      return "bg-stone-100 text-stone-700 ring-1 ring-stone-200";
  }
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

export function TikTokSection() {
  const { products } = useProducts();
  const [status, setStatus] = useState<TikTokAccountStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [posts, setPosts] = useState<TikTokPostRow[]>([]);
  const [refreshingRowId, setRefreshingRowId] = useState<string | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [captionPreview, setCaptionPreview] = useState<CaptionPreview | null>(
    null,
  );
  const [caption, setCaption] = useState("");
  const [postMode, setPostMode] = useState<"MEDIA_UPLOAD" | "DIRECT_POST">(
    "MEDIA_UPLOAD",
  );
  const [privacyLevel, setPrivacyLevel] = useState("PUBLIC_TO_EVERYONE");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastResult, setLastResult] = useState<PublishResult | null>(null);
  const [applyingSchema, setApplyingSchema] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [togglingAutoPost, setTogglingAutoPost] = useState(false);
  const [oauthToast, setOauthToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Combine custom (KV) products and the default stock artworks so the
  // dropdown shows both paths the admin can post.
  const allProducts: SelectableProduct[] = useMemo(() => {
    const customs: SelectableProduct[] = Array.isArray(products)
      ? products.map((p) => ({
          id: p.id,
          image: p.image,
          title: p.title,
        }))
      : [];
    const stock: SelectableProduct[] = defaultArtworks.map((a) => ({
      id: a.id,
      image: a.image,
      title: a.title,
    }));
    return [...stock, ...customs];
  }, [products]);

  const selectedProduct = useMemo(
    () => allProducts.find((p) => p.id === selectedProductId) || null,
    [allProducts, selectedProductId],
  );

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch("/api/admin/tiktok?action=status", {
        credentials: "include",
      });
      const data = (await res.json()) as TikTokAccountStatus & {
        error?: string;
      };
      if (!res.ok) {
        setStatusError(data?.error || `HTTP ${res.status}`);
        setStatus(null);
      } else {
        setStatus(data);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await fetch("/api/admin/tiktok?action=posts&limit=50", {
        credentials: "include",
      });
      const data = (await res.json()) as { posts?: TikTokPostRow[] };
      if (res.ok && Array.isArray(data.posts)) {
        setPosts(data.posts);
      } else {
        setPosts([]);
      }
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.schemaApplied) {
      void fetchPosts();
    } else {
      setPosts([]);
    }
  }, [status?.schemaApplied, fetchPosts]);

  // OAuth roundtrip surfacing — when redirected back from the callback,
  // the URL has ?tiktok=connected | tiktok=failed&reason=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const tiktokParam = url.searchParams.get("tiktok");
    if (!tiktokParam) return;
    if (tiktokParam === "connected") {
      setOauthToast({ kind: "success", text: "TikTok account connected." });
      void fetchStatus();
    } else if (tiktokParam === "failed") {
      const reason = url.searchParams.get("reason") || "unknown error";
      setOauthToast({ kind: "error", text: `Connect failed: ${reason}` });
    }
    url.searchParams.delete("tiktok");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, [fetchStatus]);

  const onPickProduct = async (id: string) => {
    setSelectedProductId(id);
    setCaptionPreview(null);
    setCaption("");
    if (!id) return;
    try {
      const res = await fetch(
        `/api/admin/tiktok?action=caption&productId=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as CaptionPreview & { error?: string };
      if (res.ok) {
        setCaptionPreview(data);
        setCaption(data.caption);
      }
    } catch {
      // ignore — admin can still type manually
    }
  };

  const startConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/admin/tiktok?action=connect-url", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        authorizeUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.authorizeUrl) {
        setOauthToast({
          kind: "error",
          text: data.error || "Failed to start OAuth",
        });
        return;
      }
      window.location.href = data.authorizeUrl;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect the TikTok account? You'll need to re-authorise to post again.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      await fetch("/api/admin/tiktok?action=disconnect", {
        method: "POST",
        credentials: "include",
        headers: jsonAuthHeaders(),
      });
      await fetchStatus();
    } finally {
      setDisconnecting(false);
    }
  };

  const applySchema = async () => {
    setApplyingSchema(true);
    try {
      const res = await fetch("/api/admin/tiktok?action=apply-schema", {
        method: "POST",
        credentials: "include",
        headers: jsonAuthHeaders(),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setOauthToast({
          kind: "error",
          text: data.error || "Schema apply failed",
        });
        return;
      }
      await fetchStatus();
    } finally {
      setApplyingSchema(false);
    }
  };

  const refreshToken = async () => {
    setRefreshingToken(true);
    try {
      const res = await fetch("/api/admin/tiktok?action=refresh-token", {
        method: "POST",
        credentials: "include",
        headers: jsonAuthHeaders(),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setOauthToast({
          kind: "error",
          text: data.error || "Token refresh failed",
        });
        return;
      }
      setOauthToast({ kind: "success", text: "Token refreshed." });
      await fetchStatus();
    } finally {
      setRefreshingToken(false);
    }
  };

  const refreshRowStatus = async (rowId: string) => {
    setRefreshingRowId(rowId);
    try {
      const res = await fetch("/api/admin/tiktok?action=refresh-status", {
        method: "POST",
        credentials: "include",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ id: rowId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        status?: string | null;
        pending?: boolean;
        uploadedBytes?: number | null;
        failReason?: string | null;
      };
      if (!res.ok || (!data.ok && data.error)) {
        setOauthToast({
          kind: "error",
          text: data.failReason
            ? `TikTok rejected the post: ${data.failReason}`
            : data.error || `Refresh failed (HTTP ${res.status})`,
        });
      } else if (data.pending) {
        const bytes = formatBytes(data.uploadedBytes);
        setOauthToast({
          kind: "success",
          text: `TikTok still processing — status: ${data.status || "PROCESSING_UPLOAD"} (${bytes} uploaded). Try Refresh again in ~30s.`,
        });
      } else {
        setOauthToast({
          kind: "success",
          text: `TikTok finished — status: ${data.status || "SEND_TO_USER_INBOX"}. Check the @canvashub inbox to publish.`,
        });
      }
      await fetchPosts();
    } catch (err) {
      setOauthToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshingRowId(null);
    }
  };

  const toggleAutoPost = async () => {
    if (!status) return;
    const next = !status.autoPostEnabled;
    setTogglingAutoPost(true);
    try {
      const res = await fetch("/api/admin/tiktok?action=set-auto-post", {
        method: "POST",
        credentials: "include",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setOauthToast({
          kind: "error",
          text: data.error || "Failed to update auto-post setting",
        });
        return;
      }
      setStatus((prev) => (prev ? { ...prev, autoPostEnabled: next } : prev));
      setOauthToast({
        kind: "success",
        text: next
          ? "Auto-posting enabled. New products will be sent to TikTok automatically."
          : "Auto-posting disabled.",
      });
    } catch (err) {
      setOauthToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTogglingAutoPost(false);
    }
  };

  const submitPublish = async () => {
    if (!selectedProductId) return;
    setPublishing(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/tiktok?action=publish", {
        method: "POST",
        credentials: "include",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          productId: selectedProductId,
          caption,
          postMode,
          privacyLevel,
        }),
      });
      const data = (await res.json()) as PublishResult & { error?: string };
      if (!res.ok || !data.ok) {
        setLastResult({
          ok: false,
          error: data.error || `HTTP ${res.status}`,
          errorCode: data.errorCode ?? null,
          status: data.status ?? null,
        });
      } else {
        setLastResult({
          ok: true,
          shareUrl: data.shareUrl ?? null,
          postId: data.postId ?? null,
          status: data.status ?? null,
          pending: data.pending ?? false,
          uploadedBytes: data.uploadedBytes ?? null,
        });
        setConfirmOpen(false);
      }
      await fetchPosts();
    } catch (err) {
      setLastResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPublishing(false);
    }
  };

  const charCount = caption.length;
  const overLimit = charCount > MAX_CAPTION_LENGTH;
  const overFeedPreview = charCount > FEED_PREVIEW_CAP;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">TikTok auto-posting</h2>
        <p className="text-sm text-stone-600 mt-1">
          Publish a painting to the connected TikTok account as a photo post.
          Captions, image URLs and post mode are all editable before sending.
          Every publish attempt is logged below.
        </p>
      </header>

      {oauthToast && (
        <div
          className={
            "rounded-lg p-3 text-sm flex items-start gap-2 " +
            (oauthToast.kind === "success"
              ? "bg-green-50 text-green-800 ring-1 ring-green-200"
              : "bg-red-50 text-red-800 ring-1 ring-red-200")
          }
        >
          {oauthToast.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{oauthToast.text}</span>
          <button
            type="button"
            onClick={() => setOauthToast(null)}
            className="text-xs underline shrink-0"
          >
            dismiss
          </button>
        </div>
      )}

      {/* ─── status card ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5" />
            Account status
          </CardTitle>
          <CardDescription>
            Live read from Meta and the local KV / D1 stores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading && (
            <div className="flex items-center gap-2 text-stone-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading status…
            </div>
          )}
          {statusError && (
            <div className="text-red-700 text-sm">{statusError}</div>
          )}
          {!statusLoading && status && (
            <div className="space-y-3 text-sm">
              <StatusRow
                label="TikTok env vars"
                ok={status.configured}
                okText="configured"
                errorText="missing — see setup below"
              />
              <StatusRow
                label="KV binding (STOREFRONT_CONFIG)"
                ok={!status.kvBindingMissing}
                okText="bound"
                errorText="missing"
              />
              <StatusRow
                label="D1 binding"
                ok={status.d1Available}
                okText="bound"
                errorText="missing — token storage still works, but audit log won't persist"
              />
              <StatusRow
                label="tiktok_posts schema"
                ok={status.schemaApplied}
                okText="applied"
                errorText="missing — apply with the button below"
              />
              <StatusRow
                label="OAuth connection"
                ok={status.connected}
                okText={
                  status.account?.displayName
                    ? `connected as @${status.account.username ?? status.account.displayName}`
                    : "connected"
                }
                errorText="not connected"
              />
              {status.token && (
                <div className="rounded-md bg-stone-50 p-3 space-y-1 text-xs">
                  <div>
                    Access token expires in{" "}
                    <strong>
                      {status.token.expiresInDays > 0
                        ? `${status.token.expiresInDays} day(s)`
                        : `${status.token.expiresInSeconds}s`}
                    </strong>
                    .
                  </div>
                  <div>
                    Refresh token expires in{" "}
                    <strong>{status.token.refreshExpiresInDays} day(s)</strong>.
                    {status.token.refreshExpired && (
                      <span className="ml-1 text-red-600 font-medium">
                        (expired — reconnect)
                      </span>
                    )}
                  </div>
                  {status.token.scope && (
                    <div className="text-stone-500">
                      Scopes: <code>{status.token.scope}</code>
                    </div>
                  )}
                </div>
              )}
              {status.counts && (
                <div className="text-xs text-stone-600">
                  Lifetime publishes: <strong>{status.counts.total}</strong> (
                  {status.counts.published} published, {status.counts.failed}{" "}
                  failed)
                </div>
              )}
              {status.errors.length > 0 && (
                <ul className="list-disc pl-5 text-amber-700 text-xs space-y-1">
                  {status.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchStatus()}
                >
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
                {status.configured &&
                  !status.kvBindingMissing &&
                  !status.connected && (
                    <Button
                      size="sm"
                      onClick={() => void startConnect()}
                      disabled={connecting}
                    >
                      {connecting ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4 mr-1" />
                      )}
                      Connect TikTok
                    </Button>
                  )}
                {status.connected && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void refreshToken()}
                      disabled={refreshingToken}
                    >
                      {refreshingToken ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-1" />
                      )}
                      Refresh token
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void disconnect()}
                      disabled={disconnecting}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Disconnect
                    </Button>
                  </>
                )}
                {status.d1Available && !status.schemaApplied && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void applySchema()}
                    disabled={applyingSchema}
                  >
                    {applyingSchema ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : null}
                    Apply schema
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── reconnect-required banner ─────────────────────────────── */}
      {!statusLoading && status?.needsReconnect && (
        <Card className="border-amber-400 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  Reconnect TikTok to grant new permission
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Your stored TikTok token is missing scope(s):{" "}
                  <code>
                    {(status.missingScopes ?? []).join(", ") || "unknown"}
                  </code>
                  . That&apos;s why the panel can&apos;t load your @ username
                  and shows a &ldquo;scope required&rdquo; error. Click{" "}
                  <strong>Disconnect</strong> and then{" "}
                  <strong>Connect TikTok</strong> on the status card &mdash; the
                  OAuth screen will now ask for the missing permission. Posting
                  itself still works (it only needs video.publish +
                  video.upload, which you already granted), so this is only
                  blocking the account-info display.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── auto-post toggle ──────────────────────────────── */}
      {!statusLoading && status?.connected && status?.schemaApplied && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  Auto-post new products to TikTok
                </p>
                <p className="text-xs text-stone-500 mt-0.5">
                  Fires only when you{" "}
                  <strong>create a brand-new product</strong>. Edits to existing
                  products do not trigger it, and it does not run retroactively
                  on products created before the toggle was on.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void toggleAutoPost()}
                disabled={togglingAutoPost}
                className="shrink-0 ml-4"
              >
                {togglingAutoPost ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : status.autoPostEnabled ? (
                  <ToggleRight className="w-8 h-8 text-green-600" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-stone-400" />
                )}
              </Button>
            </div>
            {status.autoPostEnabled && (
              <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3 text-xs text-amber-900">
                <p className="font-medium mb-1">
                  Posts land in your TikTok inbox, not your feed.
                </p>
                <p>
                  Auto-post uses TikTok&apos;s <code>MEDIA_UPLOAD</code> mode,
                  which drops the photo into the connected account&apos;s
                  drafts/inbox inside the TikTok app. Your followers won&apos;t
                  see it on their feed until you open TikTok, tap the inbox
                  notification, and finish publishing. To unlock true zero-touch
                  posting to the feed (<code>DIRECT_POST</code>) you must pass
                  TikTok&apos;s Production audit &mdash; see this PR&apos;s
                  description for the walkthrough.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── setup wizard if not configured ───────────────────────── */}
      {!statusLoading && status && !status.configured && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-amber-900">Setup wizard</CardTitle>
            <CardDescription className="text-amber-800">
              The TikTok integration is not configured yet. Follow these steps
              in Cloudflare Pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-3 text-amber-900">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Register a TikTok Developer app at{" "}
                <a
                  className="underline"
                  href="https://developers.tiktok.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  developers.tiktok.com
                </a>{" "}
                and add the <strong>Login Kit</strong> and{" "}
                <strong>Content Posting API</strong> products.
              </li>
              <li>
                In the app settings, add this redirect URI:
                <pre className="mt-1 px-2 py-1 bg-amber-100 rounded text-xs">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/admin/tiktok-callback`
                    : "https://canvhub.com/api/admin/tiktok-callback"}
                </pre>
              </li>
              <li>
                In Cloudflare Pages → Settings → Variables and Secrets, add
                these as <strong>Encrypt</strong> values (not VITE_*):
                <ul className="list-disc pl-5 mt-1">
                  <li>
                    <code>TIKTOK_CLIENT_KEY</code> — Client Key from your TikTok
                    app
                  </li>
                  <li>
                    <code>TIKTOK_CLIENT_SECRET</code> — Client Secret
                  </li>
                  <li>
                    <code>TIKTOK_REDIRECT_URI</code> — the exact URI from step 2
                  </li>
                </ul>
              </li>
              <li>Trigger a redeploy and reload this page.</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* ─── posting UI (only when connected) ─────────────────────── */}
      {!statusLoading && status?.connected && status?.schemaApplied && (
        <Card>
          <CardHeader>
            <CardTitle>Post a painting</CardTitle>
            <CardDescription>
              Pick a painting and review the caption. Confirmation modal before
              posting. UPLOAD mode sends it to your TikTok inbox for one-tap
              publish; DIRECT_POST requires production audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Painting</Label>
              <Select
                value={selectedProductId || ""}
                onValueChange={(v) => void onPickProduct(v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a painting…" />
                </SelectTrigger>
                <SelectContent>
                  {allProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && captionPreview && (
              <>
                <div className="flex items-start gap-4">
                  <div className="w-32 shrink-0">
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.title}
                      className="w-full aspect-square object-cover rounded-md ring-1 ring-stone-200"
                    />
                  </div>
                  <div className="flex-1 text-xs text-stone-600 space-y-1">
                    <div className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      <span className="break-all">
                        {captionPreview.imageUrl ?? "—"}
                      </span>
                    </div>
                    {!captionPreview.imageReachable && (
                      <div className="text-amber-700 flex items-start gap-1">
                        <AlertCircle className="w-3 h-3 mt-0.5" />
                        Image URL must be public HTTPS for TikTok to fetch it.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="caption">Caption</Label>
                    <span
                      className={
                        "text-xs " +
                        (overLimit
                          ? "text-red-600"
                          : overFeedPreview
                            ? "text-amber-700"
                            : "text-stone-500")
                      }
                    >
                      {charCount} / {MAX_CAPTION_LENGTH}
                      {overFeedPreview && !overLimit
                        ? ` · feed preview truncates @ ${FEED_PREVIEW_CAP}`
                        : ""}
                    </span>
                  </div>
                  <Textarea
                    id="caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCaption(captionPreview.caption)}
                    >
                      Reset to default
                    </Button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Post mode</Label>
                    <Select
                      value={postMode}
                      onValueChange={(v) =>
                        setPostMode(v as "MEDIA_UPLOAD" | "DIRECT_POST")
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEDIA_UPLOAD">
                          MEDIA_UPLOAD — goes to TikTok inbox (pre-audit)
                        </SelectItem>
                        <SelectItem value="DIRECT_POST">
                          DIRECT_POST — auto-publish (post-audit only)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Privacy level</Label>
                    <Select
                      value={privacyLevel}
                      onValueChange={(v) => setPrivacyLevel(v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PUBLIC_TO_EVERYONE">
                          Public
                        </SelectItem>
                        <SelectItem value="MUTUAL_FOLLOW_FRIENDS">
                          Friends only
                        </SelectItem>
                        <SelectItem value="FOLLOWER_OF_CREATOR">
                          Followers
                        </SelectItem>
                        <SelectItem value="SELF_ONLY">Only me</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={
                      !caption || overLimit || !captionPreview.imageReachable
                    }
                  >
                    <Send className="w-4 h-4 mr-1" /> Review & post
                  </Button>
                </div>

                {lastResult && (
                  <div
                    className={
                      "rounded-md p-3 text-sm " +
                      (lastResult.ok
                        ? "bg-green-50 text-green-800 ring-1 ring-green-200"
                        : "bg-red-50 text-red-800 ring-1 ring-red-200")
                    }
                  >
                    {lastResult.ok ? (
                      <div>
                        {lastResult.shareUrl ? (
                          <>
                            Published.{" "}
                            <a
                              className="underline"
                              href={lastResult.shareUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View on TikTok
                            </a>
                          </>
                        ) : lastResult.pending ? (
                          <>
                            <div className="font-medium">
                              Submitted to TikTok.
                            </div>
                            <div className="text-xs mt-0.5">
                              Status: {lastResult.status || "PROCESSING_UPLOAD"}
                              . TikTok delivers the inbox notification
                              asynchronously — usually 1–5 minutes. Use the
                              Refresh button on the row below to check progress,
                              or open the @canvashub TikTok inbox directly.
                            </div>
                          </>
                        ) : (
                          <span>Status: {lastResult.status}</span>
                        )}
                      </div>
                    ) : (
                      <div>
                        Failed: {lastResult.error}
                        {lastResult.errorCode
                          ? ` (${lastResult.errorCode})`
                          : ""}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── recent posts table ───────────────────────────────────── */}
      {status?.schemaApplied && (
        <Card>
          <CardHeader>
            <CardTitle>Recent TikTok posts</CardTitle>
            <CardDescription>
              Audit log of every publish attempt. Click View on TikTok for live
              posts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {postsLoading && (
              <div className="flex items-center gap-2 text-stone-600">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            )}
            {!postsLoading && posts.length === 0 && (
              <div className="text-sm text-stone-500">No posts yet.</div>
            )}
            {!postsLoading && posts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone-500 border-b">
                      <th className="py-2 pr-2">When</th>
                      <th className="py-2 pr-2">Product</th>
                      <th className="py-2 pr-2">Mode</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Permalink</th>
                      <th className="py-2 pr-2">Error</th>
                      <th className="py-2 pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((row) => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {formatDate(row.posted_at || row.created_at)}
                        </td>
                        <td className="py-2 pr-2 font-mono text-[10px]">
                          {row.product_id}
                        </td>
                        <td className="py-2 pr-2">{row.post_mode}</td>
                        <td className="py-2 pr-2">
                          <span
                            className={
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
                              statusBadgeClass(row.status)
                            }
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          {row.share_url ? (
                            <a
                              className="underline inline-flex items-center gap-0.5"
                              href={row.share_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-2 text-red-700 max-w-xs truncate">
                          {row.error_message || "—"}
                        </td>
                        <td className="py-2 pr-2">
                          {(row.status === "processing" ||
                            row.status === "pending") &&
                          row.publish_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={refreshingRowId === row.id}
                              onClick={() => void refreshRowStatus(row.id)}
                            >
                              {refreshingRowId === row.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3 mr-1" />
                              )}
                              Refresh
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── confirmation modal ───────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post this to TikTok?</DialogTitle>
            <DialogDescription>
              {postMode === "DIRECT_POST"
                ? "DIRECT_POST will publish immediately if your app passed TikTok's production audit."
                : "MEDIA_UPLOAD will land in your TikTok inbox / drafts — open the TikTok app and tap once to publish."}
            </DialogDescription>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-3">
              <img
                src={captionPreview?.imageUrl || selectedProduct.image}
                alt={selectedProduct.title}
                className="w-full max-h-72 object-contain rounded-md ring-1 ring-stone-200 bg-stone-50"
              />
              <pre className="text-xs whitespace-pre-wrap bg-stone-50 p-3 rounded-md ring-1 ring-stone-200 max-h-64 overflow-y-auto">
                {caption}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitPublish()} disabled={publishing}>
              {publishing ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              Post now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  errorText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  errorText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-stone-700">{label}</span>
      <span
        className={
          "inline-flex items-center gap-1 text-xs font-medium " +
          (ok ? "text-green-700" : "text-amber-700")
        }
      >
        {ok ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <AlertCircle className="w-3 h-3" />
        )}
        {ok ? okText : errorText}
      </span>
    </div>
  );
}
