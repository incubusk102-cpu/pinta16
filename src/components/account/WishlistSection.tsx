import { Heart, Trash2, Share2, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { useWishlist } from "@/contexts/WishlistContext";
import { useUserAuth } from "@/contexts/UserAuthContext";

// Standalone wishlist section pulled out of /account so the hamburger
// drawer can render it in an inline sheet without navigating away.
export default function WishlistSection() {
  const { items, remove } = useWishlist();
  const { user } = useUserAuth();
  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = async () => {
    if (items.length === 0) {
      toast.info("Save a product first, then share the list.");
      return;
    }
    if (typeof window === "undefined") return;
    const ids = items
      .map((entry) => entry.id)
      .slice(0, 50)
      .join(",");
    const params = new URLSearchParams({ ids });
    if (user?.name) params.set("from", user.name);
    const shareUrl = `${window.location.origin}/wishlist/share?${params.toString()}`;
    const shareData: ShareData = {
      title: "My Canvas Hub wishlist",
      text: "Here are the products I'm eyeing on Canvas Hub.",
      url: shareUrl,
    };
    // Prefer the native share sheet on phones — it opens iMessage,
    // FB Messenger, Viber, etc. directly. Desktop browsers don't
    // implement it, so we always fall back to clipboard.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User dismissed the share sheet — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      toast.success("Wishlist link copied to clipboard");
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy link. Long-press the URL to share manually.");
    }
  };

  return (
    <div className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Heart className="w-4 h-4" /> My wishlist
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {items.length} saved
          </span>
          <button
            type="button"
            onClick={handleShare}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground border border-border/60 rounded-sm px-2.5 py-1 hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {shareCopied ? (
              <Check className="w-3 h-3" />
            ) : (
              <Share2 className="w-3 h-3" />
            )}
            {shareCopied ? "Copied" : "Share"}
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tap the heart on any product to save it for later.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {items.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-3 p-3 border border-border/40 rounded-md bg-background/40"
            >
              {entry.image && (
                <Link
                  to="/product/$id"
                  params={{ id: entry.id }}
                  className="shrink-0"
                >
                  <img
                    src={entry.image}
                    alt={entry.title || entry.id}
                    className="w-16 h-16 object-cover rounded-sm"
                    loading="lazy"
                    decoding="async"
                  />
                </Link>
              )}
              <div className="flex-1 min-w-0 flex flex-col">
                <Link
                  to="/product/$id"
                  params={{ id: entry.id }}
                  className="text-sm font-medium text-foreground truncate hover:underline"
                >
                  {entry.title || entry.id}
                </Link>
                {entry.price !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    ₱{entry.price.toLocaleString()}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-auto">
                  Saved{" "}
                  {entry.addedAt
                    ? new Date(entry.addedAt).toLocaleString()
                    : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  remove(entry.id);
                  toast.success("Removed from wishlist");
                }}
                aria-label={`Remove ${entry.title || entry.id} from wishlist`}
                className="self-start p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
