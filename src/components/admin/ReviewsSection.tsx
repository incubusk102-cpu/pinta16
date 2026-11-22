import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface AdminReply {
  text: string;
  repliedAt: string;
}

interface AdminReview {
  orderId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  rating: number;
  text: string;
  images: string[];
  submittedAt: string;
  publishedToHomepage: boolean;
  customerName: string;
  customerEmail: string;
  customerCity: string;
  adminReply: AdminReply | null;
}

type PublishedFilter = "all" | "published" | "unpublished";
type RatingFilter = "all" | "1" | "2" | "3" | "4" | "5";

const reviewKey = (r: AdminReview) => `${r.orderId}::${r.productId}`;

const fetchReviews = async (): Promise<AdminReview[]> => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/orders?reviews=all", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { reviews: AdminReview[] };
  return Array.isArray(data.reviews) ? data.reviews : [];
};

const postOrders = async (body: Record<string, unknown>) => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export function ReviewsSection() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [publishedFilter, setPublishedFilter] =
    useState<PublishedFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [editTarget, setEditTarget] = useState<AdminReview | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);
  const [replyTarget, setReplyTarget] = useState<AdminReview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const next = await fetchReviews();
      setReviews(next);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load reviews",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (publishedFilter === "published" && !r.publishedToHomepage)
        return false;
      if (publishedFilter === "unpublished" && r.publishedToHomepage)
        return false;
      if (ratingFilter !== "all" && String(r.rating) !== ratingFilter)
        return false;
      if (!q) return true;
      const hay = [
        r.productTitle,
        r.customerName,
        r.customerEmail,
        r.customerCity,
        r.text,
        r.orderId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [reviews, search, publishedFilter, ratingFilter]);

  const togglePublish = async (r: AdminReview) => {
    const key = reviewKey(r);
    setBusyKey(key);
    try {
      await postOrders({
        action: "set-review-published",
        orderId: r.orderId,
        productId: r.productId,
        publishedToHomepage: !r.publishedToHomepage,
      });
      setReviews((prev) =>
        prev.map((x) =>
          reviewKey(x) === key
            ? { ...x, publishedToHomepage: !x.publishedToHomepage }
            : x,
        ),
      );
      toast.success(
        r.publishedToHomepage
          ? "Unpublished from homepage"
          : "Published to homepage",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update review",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const saveEdit = async (
    target: AdminReview,
    patch: { rating: number; text: string },
  ) => {
    const key = reviewKey(target);
    setBusyKey(key);
    try {
      await postOrders({
        action: "update-review",
        orderId: target.orderId,
        productId: target.productId,
        rating: patch.rating,
        text: patch.text,
      });
      setReviews((prev) =>
        prev.map((x) => (reviewKey(x) === key ? { ...x, ...patch } : x)),
      );
      toast.success("Review updated");
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyKey(null);
    }
  };

  const saveReply = async (target: AdminReview, text: string) => {
    const key = reviewKey(target);
    setBusyKey(key);
    try {
      await postOrders({
        action: "set-review-reply",
        orderId: target.orderId,
        productId: target.productId,
        reply: text,
      });
      const trimmed = text.trim();
      const nextReply: AdminReply | null = trimmed
        ? { text: trimmed, repliedAt: new Date().toISOString() }
        : null;
      setReviews((prev) =>
        prev.map((x) =>
          reviewKey(x) === key ? { ...x, adminReply: nextReply } : x,
        ),
      );
      toast.success(trimmed ? "Reply saved" : "Reply removed");
      setReplyTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save reply");
    } finally {
      setBusyKey(null);
    }
  };

  const bulkSetPublished = async (publish: boolean) => {
    if (selected.size === 0) return;
    const items = reviews
      .filter((r) => selected.has(reviewKey(r)))
      .map((r) => ({ orderId: r.orderId, productId: r.productId }));
    if (items.length === 0) return;
    setBusyKey("bulk");
    try {
      await postOrders({
        action: "bulk-set-review-published",
        items,
        publishedToHomepage: publish,
      });
      setReviews((prev) =>
        prev.map((x) =>
          selected.has(reviewKey(x))
            ? { ...x, publishedToHomepage: publish }
            : x,
        ),
      );
      toast.success(
        `${publish ? "Published" : "Unpublished"} ${items.length} review${items.length === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBusyKey(null);
    }
  };

  const confirmDelete = async (target: AdminReview) => {
    const key = reviewKey(target);
    setBusyKey(key);
    try {
      await postOrders({
        action: "delete-review",
        orderId: target.orderId,
        productId: target.productId,
      });
      setReviews((prev) => prev.filter((x) => reviewKey(x) !== key));
      toast.success("Review deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Customer reviews</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every review submitted by customers across all orders. Edit, delete,
            or toggle whether it appears on the homepage.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
          )}
          Refresh
        </Button>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, customer, text…"
          className="h-9 w-72"
        />
        <Select
          value={publishedFilter}
          onValueChange={(v) => setPublishedFilter(v as PublishedFilter)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reviews</SelectItem>
            <SelectItem value="published">Published only</SelectItem>
            <SelectItem value="unpublished">Unpublished only</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={ratingFilter}
          onValueChange={(v) => setRatingFilter(v as RatingFilter)}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any rating</SelectItem>
            <SelectItem value="5">5 stars</SelectItem>
            <SelectItem value="4">4 stars</SelectItem>
            <SelectItem value="3">3 stars</SelectItem>
            <SelectItem value="2">2 stars</SelectItem>
            <SelectItem value="1">1 star</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {reviews.length}
        </span>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busyKey === "bulk"}
            onClick={() => void bulkSetPublished(true)}
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Publish all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyKey === "bulk"}
            onClick={() => void bulkSetPublished(false)}
          >
            <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Unpublish all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            <X className="w-3.5 h-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading reviews…
        </div>
      ) : reviews.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          No customer reviews yet. They appear here once customers submit a
          review on their delivered orders.
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          No reviews match the current filters.
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={
                filtered.length > 0 &&
                filtered.every((r) => selected.has(reviewKey(r)))
              }
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) {
                  for (const r of filtered) next.add(reviewKey(r));
                } else {
                  for (const r of filtered) next.delete(reviewKey(r));
                }
                setSelected(next);
              }}
            />
            Select all visible ({filtered.length})
          </label>
          <ul className="space-y-3">
            {filtered.map((r) => {
              const key = reviewKey(r);
              const busy = busyKey === key;
              const isSelected = selected.has(key);
              return (
                <li
                  key={key}
                  className={`bg-card/40 border rounded-lg p-4 space-y-3 ${
                    isSelected ? "border-primary/60" : "border-border/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-border accent-primary"
                        checked={isSelected}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(key);
                          else next.delete(key);
                          setSelected(next);
                        }}
                        aria-label="Select review for bulk action"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate max-w-[260px]">
                            {r.productTitle || "(legacy review)"}
                          </span>
                          {r.publishedToHomepage ? (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded">
                              On homepage
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                              Unpublished
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.customerName}
                          {r.customerEmail ? ` · ${r.customerEmail}` : ""}
                          {r.customerCity ? ` · ${r.customerCity}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Order {r.orderId} ·{" "}
                          {new Date(r.submittedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`w-3.5 h-3.5 ${
                            n <= r.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      ))}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {r.rating}/5
                      </span>
                    </div>
                  </div>

                  <p className="text-sm whitespace-pre-wrap">{r.text}</p>

                  {r.images.length > 0 && (
                    <div className="grid grid-cols-6 gap-2">
                      {r.images.map((src, i) => (
                        <a
                          key={i}
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={src}
                            alt={`Review photo ${i + 1}`}
                            className="aspect-square w-full object-cover rounded-sm border border-border/20"
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {r.adminReply?.text ? (
                    <div className="rounded-md border border-border/40 bg-card/60 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Your reply ·{" "}
                        {new Date(r.adminReply.repliedAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-foreground/85 whitespace-pre-wrap">
                        {r.adminReply.text}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 justify-end pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setReplyTarget(r)}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                      {r.adminReply?.text ? "Edit reply" : "Reply"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditTarget(r)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant={r.publishedToHomepage ? "outline" : "default"}
                      size="sm"
                      disabled={busy}
                      onClick={() => void togglePublish(r)}
                    >
                      {r.publishedToHomepage ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Unpublish
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Publish
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <EditReviewDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={saveEdit}
        saving={Boolean(editTarget && busyKey === reviewKey(editTarget))}
      />

      <ReplyDialog
        target={replyTarget}
        onClose={() => setReplyTarget(null)}
        onSave={saveReply}
        saving={Boolean(replyTarget && busyKey === reviewKey(replyTarget))}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the review and any photos the customer
              uploaded. The order itself is not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyKey)}>
              Keep review
            </AlertDialogCancel>
            <AlertDialogAction
              variant="dangerSoft"
              disabled={Boolean(busyKey)}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) void confirmDelete(deleteTarget);
              }}
            >
              {busyKey &&
              deleteTarget &&
              busyKey === reviewKey(deleteTarget) ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-2" />
              )}
              Delete review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function EditReviewDialog({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: AdminReview | null;
  onClose: () => void;
  onSave: (
    target: AdminReview,
    patch: { rating: number; text: string },
  ) => Promise<void>;
  saving: boolean;
}) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  useEffect(() => {
    if (target) {
      setRating(target.rating);
      setText(target.text);
    }
  }, [target]);

  const handleSave = async () => {
    if (!target) return;
    if (rating < 1 || rating > 5) {
      toast.error("Rating must be between 1 and 5");
      return;
    }
    if (text.trim().length === 0) {
      toast.error("Review text cannot be empty");
      return;
    }
    if (text.length > 5000) {
      toast.error("Review text too long (max 5000 chars)");
      return;
    }
    await onSave(target, { rating, text });
  };

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit customer review</DialogTitle>
          <DialogDescription>
            Changes are visible everywhere this review appears, including the
            homepage if it's published.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Rating</Label>
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-0.5"
                  aria-label={`${n} stars`}
                >
                  <Star
                    className={`w-5 h-5 ${
                      n <= rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs text-muted-foreground">
                {rating}/5
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="review-text">Review text</Label>
            <textarea
              id="review-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              maxLength={5000}
              className="w-full mt-1 rounded-md border border-border/60 bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {text.length.toLocaleString()} / 5,000 characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplyDialog({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: AdminReview | null;
  onClose: () => void;
  onSave: (target: AdminReview, text: string) => Promise<void>;
  saving: boolean;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (target) {
      setText(target.adminReply?.text || "");
    }
  }, [target]);

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reply to this review</DialogTitle>
          <DialogDescription>
            Your reply appears under the customer's review on the public product
            page and on the homepage. Leave the field empty to remove an
            existing reply.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {target ? (
            <p className="text-xs text-muted-foreground rounded-md border border-border/40 bg-card/40 p-2 whitespace-pre-wrap">
              <span className="uppercase tracking-wider text-[10px] block mb-1">
                {target.customerName} · {target.rating}/5
              </span>
              {target.text}
            </p>
          ) : null}
          <Label htmlFor="reply-text">Your reply</Label>
          <textarea
            id="reply-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="Thanks for the feedback! …"
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            {text.length.toLocaleString()} / 2,000 characters
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
          </Button>
          <Button
            type="button"
            onClick={() => target && void onSave(target, text)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
