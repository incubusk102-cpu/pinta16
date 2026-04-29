import { Heart, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useWishlist } from "@/contexts/WishlistContext";

// Standalone wishlist section pulled out of /account so the hamburger
// drawer can render it in an inline sheet without navigating away.
export default function WishlistSection() {
  const { items, remove } = useWishlist();
  return (
    <div className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Heart className="w-4 h-4" /> My wishlist
        </div>
        <span className="text-xs text-muted-foreground">
          {items.length} saved
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tap the heart on any painting to save it for later.
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
