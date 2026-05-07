import { useEffect, useState } from "react";

/**
 * Published-review shape served by `/api/orders?reviews=published`. All
 * fields except the minimum identifiers are optional so a single hook can
 * power the homepage `ThankYouWall` (only needs name/city/text) AND the
 * `ReviewsSection` review grid (also reads images + admin reply) without
 * forcing either consumer to redeclare its own interface.
 */
export interface PublishedReview {
  orderId: string;
  rating: number;
  text: string;
  images?: string[];
  submittedAt: string;
  customerName: string;
  customerCity?: string;
  productTitle?: string;
  adminReply?: { text: string; repliedAt: string } | null;
}

interface CacheEntry {
  reviews: PublishedReview[];
  fetchedAt: number;
}

// 60s TTL — `/api/orders?reviews=published` is cheap to refetch but
// homepage components mount within a few ms of each other; 60s is plenty
// to dedupe their initial-paint fetches without serving stale UGC.
const TTL_MS = 60_000;
let cache: CacheEntry | null = null;
let inflight: Promise<PublishedReview[]> | null = null;

const fetchReviews = async (): Promise<PublishedReview[]> => {
  try {
    const res = await fetch("/api/orders?reviews=published");
    if (!res.ok) return [];
    const data = (await res.json()) as { reviews?: unknown };
    return Array.isArray(data.reviews)
      ? (data.reviews as PublishedReview[])
      : [];
  } catch {
    return [];
  }
};

const getReviews = (): Promise<PublishedReview[]> => {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return Promise.resolve(cache.reviews);
  }
  if (inflight) return inflight;
  inflight = fetchReviews().then((reviews) => {
    cache = { reviews, fetchedAt: Date.now() };
    inflight = null;
    return reviews;
  });
  return inflight;
};

export interface PublishedReviewsState {
  reviews: PublishedReview[];
  loading: boolean;
}

/**
 * Shared accessor for the published-reviews feed. The first caller in the
 * page kicks off a single `/api/orders?reviews=published` fetch; later
 * callers within `TTL_MS` reuse the cached array. Before this hook,
 * `ReviewsSection` and `ThankYouWall` each fired the same request on
 * first paint, ms apart.
 */
export const usePublishedReviews = (): PublishedReviewsState => {
  const [state, setState] = useState<PublishedReviewsState>(() => ({
    reviews: cache?.reviews ?? [],
    loading: !cache,
  }));

  useEffect(() => {
    let cancelled = false;
    void getReviews().then((reviews) => {
      if (cancelled) return;
      setState({ reviews, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
