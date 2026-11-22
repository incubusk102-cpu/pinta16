import { Sparkles, Star } from "lucide-react";
import type { CartItem, OrderReview } from "@/contexts/CartContext";

interface DeliveredReviewPromptProps {
  items: CartItem[];
  existingReviews: OrderReview[];
  /**
   * Anchor id of the wrapping `<OrderReviewForm>` block so the "Leave a
   * review" button can scroll the form into view. The same id is what
   * the post-delivery email's "Write a review" CTA targets via the
   * `?track=<orderId>#order-review-form` deep link.
   */
  anchorId?: string;
}

/**
 * Eye-catching banner shown above the review form on delivered orders so
 * customers actually notice the review CTA. The form on its own is easy
 * to miss — it sits below the timeline + shipment block — so this card
 * pulls the review prompt up visually with a star icon, a clear heading,
 * and a "Leave a review" anchor button.
 *
 * Renders nothing when every item in the order has already been reviewed.
 */
export default function DeliveredReviewPrompt({
  items,
  existingReviews,
  anchorId = "order-review-form",
}: DeliveredReviewPromptProps) {
  const reviewedIds = new Set(
    existingReviews.map((r) => r.productId).filter(Boolean) as string[],
  );
  const unreviewed = items.filter((it) => !reviewedIds.has(it.id));
  if (unreviewed.length === 0) return null;

  const remaining = unreviewed.length;
  const itemNoun = remaining === 1 ? "painting" : "paintings";

  return (
    <div className="relative overflow-hidden rounded-md border border-yellow-400/30 bg-gradient-to-br from-yellow-400/10 via-yellow-400/5 to-transparent p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400/15 text-yellow-500">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1.5">
          <p className="font-body text-[10px] uppercase tracking-[0.2em] text-yellow-600/90">
            Order delivered
          </p>
          <h3 className="font-display text-base sm:text-lg leading-tight text-foreground">
            How was your {itemNoun}? Share your experience.
          </h3>
          <p className="font-body text-xs text-muted-foreground">
            Your rating and photos help other collectors decide. It only takes a
            minute, and the artist reads every review.
          </p>
          <div className="flex items-center gap-1 pt-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className="h-4 w-4 text-yellow-400/60"
                aria-hidden
              />
            ))}
            {remaining > 1 && (
              <span className="ml-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">
                {remaining} left to review
              </span>
            )}
          </div>
        </div>
      </div>
      <a
        href={`#${anchorId}`}
        className="mt-3 inline-flex items-center justify-center rounded-sm bg-foreground px-4 py-2 font-body text-xs uppercase tracking-[0.15em] text-background hover:bg-foreground/90 transition-colors"
      >
        Leave a review
      </a>
    </div>
  );
}
