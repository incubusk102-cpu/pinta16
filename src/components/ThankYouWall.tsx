import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { usePublishedReviews } from "@/hooks/usePublishedReviews";

const ROTATE_MS = 8000;

const Stars = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`w-3.5 h-3.5 ${
          n <= rating
            ? "fill-yellow-400 text-yellow-400"
            : "text-muted-foreground/30"
        }`}
      />
    ))}
  </div>
);

/**
 * "Thank-you wall" — a slim, rotating carousel of published reviews that
 * shows on the homepage above the static reviews section. Fades between
 * one review at a time so the wall feels alive without taking the whole
 * screen. Hides itself when there are fewer than two reviews to rotate.
 */
const ThankYouWall = () => {
  const { reviews } = usePublishedReviews();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reviews.length <= 1) return;
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % reviews.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [reviews.length]);

  if (reviews.length === 0) return null;

  const current = reviews[idx % reviews.length];
  const text =
    current.text.length > 240
      ? current.text.slice(0, 240).trimEnd() + "…"
      : current.text;

  return (
    <section className="px-4 sm:px-6 md:px-12 max-w-5xl mx-auto py-10">
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden relative">
        <div className="absolute -top-6 -left-2 opacity-10 pointer-events-none">
          <Quote className="w-32 h-32 text-primary" />
        </div>
        <div className="relative p-6 sm:p-10">
          <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-4">
            Thank you wall · {reviews.length}{" "}
            {reviews.length === 1 ? "voice" : "voices"}
          </div>
          <AnimatePresence mode="wait">
            <motion.figure
              key={current.orderId + current.submittedAt}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5 }}
              className="space-y-3"
            >
              <Stars rating={current.rating} />
              <blockquote className="font-display text-lg sm:text-xl leading-relaxed text-foreground">
                &ldquo;{text}&rdquo;
              </blockquote>
              <figcaption className="text-xs sm:text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">
                  {current.customerName}
                </span>
                {current.customerCity ? ` · ${current.customerCity}` : ""}
                {current.productTitle ? ` · on ${current.productTitle}` : ""}
              </figcaption>
            </motion.figure>
          </AnimatePresence>
          {reviews.length > 1 && (
            <div className="mt-5 flex items-center gap-1.5">
              {reviews.slice(0, 8).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    idx % reviews.length === i
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/30"
                  }`}
                />
              ))}
              {reviews.length > 8 && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  +{reviews.length - 8}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ThankYouWall;
