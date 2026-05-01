import { useEffect, useState } from "react";
import { Eye, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RecentSale {
  productTitle: string;
  productImage?: string;
  productId?: string;
  soldAt?: string;
}

// Drop the timestamp once a sale is older than this — better silence
// than a strip that reads "sold 2 weeks ago".
const RECENT_TIMESTAMP_WINDOW_MS = 48 * 60 * 60 * 1000;

const formatRelative = (iso?: string): string | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff > RECENT_TIMESTAMP_WINDOW_MS) return null;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
};

/**
 * Slim social-proof strip — alternates between a live-visitor count
 * (sourced from /api/visitors) and the most recent sales (sourced from
 * /api/orders?recent=sold). Hides itself if there's no real data and a
 * single demo line in case both feeds are empty (so the strip doesn't
 * disappear on a fresh, unsold gallery).
 */
const VisitorTicker = () => {
  const [live, setLive] = useState<number | null>(null);
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [tickIndex, setTickIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      try {
        const res = await fetch("/api/visitors");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data.live === "number") setLive(data.live);
      } catch {
        /* ignore */
      }
    };
    const fetchSales = async () => {
      try {
        const res = await fetch("/api/orders?recent=sold&limit=8");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.sales)) setSales(data.sales);
      } catch {
        /* ignore */
      }
    };
    fetchLive();
    fetchSales();
    const liveTimer = window.setInterval(fetchLive, 30_000);
    const salesTimer = window.setInterval(fetchSales, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(liveTimer);
      window.clearInterval(salesTimer);
    };
  }, []);

  const messages: Array<{ key: string; node: React.ReactNode }> = [];
  if (live != null && live > 0) {
    const others = Math.max(live - 1, 0);
    messages.push({
      key: "live",
      node: (
        <span className="inline-flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-emerald-500" />
          <span>
            <span className="text-foreground font-semibold">
              {others === 0
                ? "You're the first visitor"
                : `${live} viewing now`}
            </span>
            {others > 0 && (
              <span className="text-muted-foreground ml-1">
                · join {others} other{others === 1 ? "" : "s"} exploring the
                gallery
              </span>
            )}
          </span>
        </span>
      ),
    });
  }
  for (const s of sales) {
    const when = formatRelative(s.soldAt);
    messages.push({
      key: `sale-${s.soldAt || s.productId}`,
      node: (
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />
          <span>
            <span className="text-foreground font-semibold">Just sold:</span>{" "}
            <span className="text-foreground font-semibold">
              "{s.productTitle}"
            </span>
            {when && <span className="text-muted-foreground"> · {when}</span>}
          </span>
        </span>
      ),
    });
  }

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = window.setInterval(
      () => setTickIndex((i) => (i + 1) % messages.length),
      6000,
    );
    return () => window.clearInterval(id);
  }, [messages.length]);

  if (messages.length === 0) return null;

  const current = messages[tickIndex % messages.length];

  return (
    <div className="border-y border-border/40 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-2 text-xs sm:text-sm text-muted-foreground">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-center"
          >
            {current.node}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VisitorTicker;
