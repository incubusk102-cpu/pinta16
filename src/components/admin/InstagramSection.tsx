import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Instagram,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { defaultArtworks } from "@/lib/artworks";

interface SelectableProduct {
  id: string;
  image: string;
  title: string;
}

const MAX_CAPTION_LENGTH = 2200;

interface InstagramAccount {
  id?: string;
  username?: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  mediaCount?: number;
  biography?: string;
}

interface InstagramToken {
  isValid: boolean;
  scopes: string[];
  expiresAt: string | null;
  daysUntilExpiry: number | null;
}

interface InstagramStatus {
  configured: boolean;
  tokenRefreshAvailable: boolean;
  account?: InstagramAccount | null;
  accountError?: string | null;
  token?: InstagramToken | null;
  tokenInfoError?: string | null;
  message?: string;
  d1?: {
    available: boolean;
    schemaApplied: boolean;
    totalPosts: number;
    publishedPosts: number;
  };
}

interface IgPostRow {
  id: string;
  product_id: string;
  ig_media_id: string | null;
  permalink: string | null;
  caption: string | null;
  image_url: string | null;
  status: string;
  error_message: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CaptionPreview {
  productId: string;
  caption: string;
  captionLength: number;
  maxCaptionLength: number;
  imageUrl: string | null;
  imageUrlReachable: boolean;
}

interface PublishResult {
  id?: string;
  productId?: string;
  mediaId?: string;
  permalink?: string | null;
  status?: string;
  error?: string;
}

function getAdminToken(): string {
  try {
    const raw = localStorage.getItem("canvhub_admin_session_v1");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed?.token || "";
  } catch {
    return "";
  }
}

const formatTimestamp = (iso: string | null | undefined) => {
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

export function InstagramSection() {
  const { token } = useAdminAuth();
  const { products } = useProducts();

  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [posts, setPosts] = useState<IgPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [captionPreview, setCaptionPreview] = useState<CaptionPreview | null>(
    null,
  );
  const [captionDraft, setCaptionDraft] = useState<string>("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [applyingSchema, setApplyingSchema] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [refreshedToken, setRefreshedToken] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastResult, setLastResult] = useState<PublishResult | null>(null);

  // Combine custom (KV) products and the default stock artworks so the
  // dropdown shows both paths the admin can post. We only need {id,
  // image, title} for the SPA UI; the backend re-hydrates the full
  // product when generating the caption + Graph API call.
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

  // Group products by whether they've been posted already.
  const postedProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of posts) {
      if (row.status === "published") set.add(row.product_id);
    }
    return set;
  }, [posts]);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/instagram?action=status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setStatus((await res.json()) as InstagramStatus);
      } else {
        toast.error(`Failed to load Instagram status (HTTP ${res.status})`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load Instagram status",
      );
    }
  }, [token]);

  const fetchPosts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/instagram?action=posts&limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          posts: IgPostRow[];
        };
        setPosts(Array.isArray(data?.posts) ? data.posts : []);
      }
    } catch {
      // Silently degrade — posts list is auxiliary.
    }
  }, [token]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStatus(), fetchPosts()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStatus, fetchPosts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchPosts()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, fetchPosts]);

  // When the admin picks a product, fetch the server-rendered caption
  // preview (so it always matches what the publish action will send).
  useEffect(() => {
    let cancelled = false;
    if (!selectedProductId || !token) {
      setCaptionPreview(null);
      setCaptionDraft("");
      setCaptionEdited(false);
      return undefined;
    }
    setPreviewLoading(true);
    setCaptionEdited(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/instagram?action=caption&productId=${encodeURIComponent(selectedProductId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as CaptionPreview;
        if (cancelled) return;
        setCaptionPreview(data);
        setCaptionDraft(data.caption || "");
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "Caption preview failed",
        );
        setCaptionPreview(null);
        setCaptionDraft("");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProductId, token]);

  const runApplySchema = async () => {
    if (!token) return;
    setApplyingSchema(true);
    try {
      const res = await fetch("/api/admin/instagram?action=apply-schema", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json()) as { applied?: boolean; error?: string };
      if (!res.ok || !data?.applied) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success("ig_posts table is ready");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply schema failed");
    } finally {
      setApplyingSchema(false);
    }
  };

  const runRefreshToken = async () => {
    if (!token) return;
    setRefreshingToken(true);
    setRefreshedToken(null);
    try {
      const res = await fetch("/api/admin/instagram?action=refresh-token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json()) as {
        accessToken?: string;
        expiresIn?: number;
        error?: string;
      };
      if (!res.ok || !data?.accessToken) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setRefreshedToken(data.accessToken);
      toast.success(
        `New token issued — expires in ~${data.expiresIn ? Math.round(data.expiresIn / 86_400) : 60} days. Update IG_ACCESS_TOKEN in Cloudflare Pages and redeploy.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Token refresh failed");
    } finally {
      setRefreshingToken(false);
    }
  };

  const runPublish = async () => {
    if (!token || !selectedProduct) return;
    setPublishing(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/instagram?action=publish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          caption: captionEdited ? captionDraft : undefined,
        }),
      });
      const data = (await res.json()) as PublishResult & { error?: string };
      if (!res.ok || data?.status !== "published") {
        const message = data?.error || `HTTP ${res.status}`;
        setLastResult({ ...data, status: "failed", error: message });
        toast.error(`Publish failed: ${message}`);
      } else {
        setLastResult(data);
        toast.success("Posted to Instagram");
        setConfirmOpen(false);
        setSelectedProductId("");
        await refreshAll();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed";
      setLastResult({ status: "failed", error: message });
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  // ── States ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Instagram status…
      </div>
    );
  }

  if (!status) return null;

  const notConfigured = !status.configured;
  const d1Missing = !status.d1?.available;
  const schemaMissing = status.d1?.available && !status.d1?.schemaApplied;

  return (
    <div className="space-y-6 p-1 max-w-5xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-medium flex items-center gap-2">
            <Instagram className="w-6 h-6" /> Instagram
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Publish paintings to your connected Instagram Business account via
            Meta's Graph API. Captions are generated from the product metadata
            and editable before posting.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refreshAll()}
          disabled={refreshing}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </header>

      {/* Account / token status card */}
      <section className="rounded-lg border border-border/60 bg-card/30 p-4">
        {notConfigured ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium">Instagram not configured</div>
                <p className="text-sm text-muted-foreground">
                  {status.message ||
                    "Set IG_ACCESS_TOKEN and IG_USER_ID in Cloudflare Pages → Settings → Variables and Secrets, then redeploy."}
                </p>
              </div>
            </div>
            <ol className="list-decimal pl-6 text-sm text-muted-foreground space-y-1">
              <li>
                Convert your Instagram account to a Business or Creator profile
                and link it to a Facebook Page.
              </li>
              <li>
                Create a Meta Developer App at{" "}
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  developers.facebook.com/apps
                </a>{" "}
                and add the Instagram Graph API product.
              </li>
              <li>
                Generate a long-lived access token via the Graph API Explorer,
                requesting scopes:{" "}
                <code className="text-xs">instagram_basic</code>,{" "}
                <code className="text-xs">instagram_content_publish</code>,{" "}
                <code className="text-xs">pages_show_list</code>.
              </li>
              <li>
                Add <code className="text-xs">IG_ACCESS_TOKEN</code> and{" "}
                <code className="text-xs">IG_USER_ID</code> as Cloudflare Pages
                secrets (Encrypt). Optionally add{" "}
                <code className="text-xs">IG_APP_ID</code> +{" "}
                <code className="text-xs">IG_APP_SECRET</code> so this panel can
                refresh the token before it expires.
              </li>
              <li>Trigger a redeploy and refresh this page.</li>
            </ol>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              {status.account?.profilePictureUrl ? (
                <img
                  src={status.account.profilePictureUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="space-y-0.5">
                <div className="font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />@
                  {status.account?.username || "(unknown)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {status.account?.followersCount ?? 0} followers ·{" "}
                  {status.account?.mediaCount ?? 0} posts
                </div>
                {status.account?.biography ? (
                  <div className="text-xs text-muted-foreground line-clamp-2 max-w-sm pt-0.5">
                    {status.account.biography}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                Token{" "}
                {status.token?.isValid ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    valid
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400">
                    invalid
                  </span>
                )}
              </div>
              {status.token?.expiresAt ? (
                <div className="text-xs text-muted-foreground">
                  Expires {formatTimestamp(status.token.expiresAt)}{" "}
                  {typeof status.token.daysUntilExpiry === "number"
                    ? `(${status.token.daysUntilExpiry} days)`
                    : null}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Expiry unknown
                </div>
              )}
              {status.tokenRefreshAvailable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runRefreshToken()}
                  disabled={refreshingToken}
                >
                  {refreshingToken ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Refresh long-lived token
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Set IG_APP_ID + IG_APP_SECRET to enable token refresh.
                </div>
              )}
              {refreshedToken ? (
                <div className="text-xs space-y-1 mt-2 p-2 rounded border border-emerald-500/30 bg-emerald-500/5">
                  <div className="font-medium text-emerald-700 dark:text-emerald-400">
                    New token issued
                  </div>
                  <div className="text-muted-foreground">
                    Paste into Cloudflare Pages → Settings → Variables and
                    Secrets → IG_ACCESS_TOKEN, then redeploy.
                  </div>
                  <code className="block break-all bg-background/50 p-1.5 rounded text-[10px]">
                    {refreshedToken}
                  </code>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {status.accountError ? (
          <div className="mt-3 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {status.accountError}
          </div>
        ) : null}
      </section>

      {/* D1 schema status */}
      {!notConfigured && (d1Missing || schemaMissing) ? (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm space-y-2">
          {d1Missing ? (
            <div>
              D1 binding (env.DB) is not configured. Add it in Cloudflare Pages
              → Settings → Functions → D1 database bindings before publishing.
            </div>
          ) : null}
          {schemaMissing ? (
            <div className="flex items-center gap-2">
              <span>
                <code className="text-xs">ig_posts</code> table missing.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runApplySchema()}
                disabled={applyingSchema}
              >
                {applyingSchema ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : null}
                Apply schema
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Publish card */}
      {!notConfigured ? (
        <section className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="font-medium">Post a painting</h3>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Painting</Label>
            <Select
              value={selectedProductId}
              onValueChange={setSelectedProductId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a painting…" />
              </SelectTrigger>
              <SelectContent>
                {allProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                    {postedProductIds.has(p.id) ? " · already posted" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct ? (
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 pt-2">
              <div className="space-y-2">
                <img
                  src={selectedProduct.image}
                  alt=""
                  className="w-full aspect-square object-cover rounded-md border border-border/40"
                />
                {captionPreview?.imageUrl ? (
                  <div className="text-[10px] text-muted-foreground break-all">
                    Meta will fetch:{" "}
                    <a
                      href={captionPreview.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {captionPreview.imageUrl}
                    </a>
                  </div>
                ) : null}
                {captionPreview && !captionPreview.imageUrlReachable ? (
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    Image URL is not a public HTTPS URL — Meta will reject this
                    post. Re-upload the image via the product editor and retry.
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Caption</Label>
                  <span
                    className={`text-[10px] ${
                      captionDraft.length > MAX_CAPTION_LENGTH
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {captionDraft.length} / {MAX_CAPTION_LENGTH}
                  </span>
                </div>
                {previewLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating preview…
                  </div>
                ) : (
                  <Textarea
                    value={captionDraft}
                    onChange={(e) => {
                      setCaptionDraft(e.target.value);
                      setCaptionEdited(true);
                    }}
                    rows={10}
                    className="font-mono text-[12px] leading-relaxed"
                  />
                )}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!captionPreview) return;
                      setCaptionDraft(captionPreview.caption);
                      setCaptionEdited(false);
                    }}
                    disabled={!captionEdited}
                  >
                    Reset caption
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={
                      !captionPreview?.imageUrlReachable ||
                      previewLoading ||
                      captionDraft.length === 0 ||
                      captionDraft.length > MAX_CAPTION_LENGTH ||
                      schemaMissing ||
                      d1Missing
                    }
                  >
                    <Send className="w-4 h-4 mr-1.5" />
                    Review & post
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Recent posts */}
      {!notConfigured && !schemaMissing && !d1Missing ? (
        <section className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-2">
          <h3 className="font-medium">Recent posts</h3>
          {posts.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No posts yet. Pick a painting above and publish your first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
                    <th className="py-2 pr-3 font-normal">When</th>
                    <th className="py-2 pr-3 font-normal">Product</th>
                    <th className="py-2 pr-3 font-normal">Status</th>
                    <th className="py-2 pr-3 font-normal">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((row) => {
                    const product = allProducts.find(
                      (p) => p.id === row.product_id,
                    );
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/30 last:border-b-0"
                      >
                        <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(row.posted_at || row.created_at)}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            {product?.image ? (
                              <img
                                src={product.image}
                                alt=""
                                className="w-8 h-8 rounded object-cover"
                              />
                            ) : null}
                            <span>
                              {product?.title || row.product_id || "(unknown)"}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          {row.status === "published" ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              published
                            </span>
                          ) : row.status === "failed" ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              title={row.error_message || ""}
                            >
                              failed
                            </span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {row.status}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {row.permalink ? (
                            <a
                              href={row.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs inline-flex items-center gap-1 underline text-muted-foreground hover:text-foreground"
                            >
                              View
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="w-5 h-5" />
              Post to Instagram?
            </DialogTitle>
            <DialogDescription>
              This will publish "{selectedProduct?.title || "(unknown)"}" to
              your IG feed via Meta's Graph API. Posts can be deleted from the
              Instagram app afterwards.
            </DialogDescription>
          </DialogHeader>
          {selectedProduct ? (
            <div className="space-y-3">
              <img
                src={selectedProduct.image}
                alt=""
                className="w-full aspect-square object-cover rounded-md border border-border/40 max-h-64"
              />
              <pre className="text-xs whitespace-pre-wrap font-mono p-2 rounded bg-muted/50 max-h-48 overflow-auto">
                {captionDraft}
              </pre>
              {lastResult?.status === "failed" ? (
                <div className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {lastResult.error || "Publish failed"}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button onClick={() => void runPublish()} disabled={publishing}>
              {publishing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1.5" />
              )}
              Post now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InstagramSection;
