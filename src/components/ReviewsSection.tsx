import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

interface PublishedReview {
  orderId: string;
  rating: number;
  text: string;
  images: string[];
  submittedAt: string;
  customerName: string;
  customerCity?: string;
  adminReply?: { text: string; repliedAt: string } | null;
}

const formatRelativeDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const Stars = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`w-4 h-4 ${
          n <= rating
            ? "fill-yellow-400 text-yellow-400"
            : "text-muted-foreground/40"
        }`}
      />
    ))}
  </div>
);

const ReviewsSection = () => {
  const [reviews, setReviews] = useState<PublishedReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/orders?reviews=published");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      } catch {
        // ignore — section just won't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || reviews.length === 0) return null;

  const totalRating = reviews.reduce((s, r) => s + r.rating, 0);
  const avg = totalRating / reviews.length;

  return (
    <section
      id="reviews"
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-6xl mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-12"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          What customers say
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-gradient-elegant mb-4">
          Reviews from our collectors
        </h2>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Stars rating={Math.round(avg)} />
          <span className="font-medium text-foreground">{avg.toFixed(1)}</span>
          <span>·</span>
          <span>
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </span>
        </div>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reviews.map((r, i) => (
          <motion.article
            key={r.orderId}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className="bg-card/40 border border-border/60 rounded-xl p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Stars rating={r.rating} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {formatRelativeDate(r.submittedAt)}
              </span>
            </div>
            <p className="font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap line-clamp-[10]">
              {r.text}
            </p>
            {r.images.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {r.images.slice(0, 3).map((src, j) => (
                  <a
                    key={j}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={src}
                      alt={`Review photo ${j + 1}`}
                      className="aspect-square w-full object-cover rounded-md border border-border/40"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              — {r.customerName}
              {r.customerCity ? `, ${r.customerCity}` : ""}
            </p>
            {r.adminReply?.text ? (
              <div className="mt-auto rounded-md border border-border/40 bg-card/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Reply from Canvas Hub
                </p>
                <p className="text-xs text-foreground/85 whitespace-pre-wrap leading-relaxed">
                  {r.adminReply.text}
                </p>
              </div>
            ) : null}
          </motion.article>
        ))}
      </div>
    </section>
  );
};

export default ReviewsSection;
