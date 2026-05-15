// Per-hero-slide engagement readback. Renders the impressions / clicks
// / unique-CTR rollup that the `hero_slide_events` D1 table accumulates
// from the client beacon in `HeroSlider.tsx`.
//
// The panel cross-joins the live admin slides list against the stats
// rows so newly-added slides show with zeros (instead of disappearing
// because they haven't accumulated events yet). When D1 isn't bound on
// the deployment (the hosted-fallback case documented in AGENTS.md ›
// "Hybrid KV + D1 architecture") the panel renders the message the
// server returns rather than misleading zeros.

import { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import type { HeroSlide } from "@/contexts/HeroSlidesContext";

interface AdminSlide extends HeroSlide {
  enabled: boolean;
}

interface StatsRow {
  slide_id: string;
  impressions: number;
  clicks: number;
  unique_impressions: number;
  unique_clicks: number;
  last_seen_at: string | null;
}

interface StatsResponse {
  available: boolean;
  days?: number;
  rows?: StatsRow[];
  message?: string;
}

// Trailing-window options. Mirrors the windows the search-events admin
// readback offers so the admin panels feel consistent.
const WINDOW_OPTIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const fmt = (n: number) => n.toLocaleString("en-PH");

const ctrPercent = (clicks: number, impressions: number): string => {
  if (!impressions) return "—";
  const ratio = (clicks / impressions) * 100;
  if (ratio < 0.1 && ratio > 0) return "<0.1%";
  return `${ratio.toFixed(1)}%`;
};

const labelFor = (slide: AdminSlide, idx: number): string =>
  slide.headline || slide.eyebrow || slide.alt || `Slide ${idx + 1}`;

const formatLastSeen = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function HeroSlideAnalyticsPanel({ slides }: { slides: AdminSlide[] }) {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<StatsRow[]>([]);

  const load = async (windowDays: number) => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hero-slide-events?days=${encodeURIComponent(windowDays)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = (await res.json().catch(() => ({}))) as StatsResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAvailable(data.available !== false);
      setMessage(data.message || null);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load slide stats",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(days);
  }, [days]);

  const byId = new Map<string, StatsRow>();
  for (const row of rows) {
    if (row?.slide_id) byId.set(row.slide_id, row);
  }

  const totalImpressions = rows.reduce(
    (acc, r) => acc + (Number(r.impressions) || 0),
    0,
  );
  const totalClicks = rows.reduce((acc, r) => acc + (Number(r.clicks) || 0), 0);

  return (
    <section className="border border-border/60 rounded-xl p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-md border border-border/60 bg-card/40 p-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </span>
          <div>
            <h3 className="font-display text-lg leading-tight">
              Slide analytics
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Impressions, CTA clicks and CTR per slide. Numbers reflect the
              public homepage hero; admin views are excluded.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="hero-stats-window" className="text-xs sr-only">
            Window
          </Label>
          <select
            id="hero-stats-window"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 30)}
            disabled={loading}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={opt.days} value={opt.days}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(days)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </header>

      {!available && (
        <p className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-md p-3">
          {message ||
            "D1 binding (env.DB) not configured. Per-slide analytics require D1."}
        </p>
      )}

      {available && (
        <>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="border border-border/40 rounded-md p-3 bg-card/30">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Slides tracked
              </dt>
              <dd className="font-display text-2xl mt-1 tabular-nums">
                {fmt(slides.length)}
              </dd>
            </div>
            <div className="border border-border/40 rounded-md p-3 bg-card/30">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Impressions
              </dt>
              <dd className="font-display text-2xl mt-1 tabular-nums">
                {fmt(totalImpressions)}
              </dd>
            </div>
            <div className="border border-border/40 rounded-md p-3 bg-card/30">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Clicks
              </dt>
              <dd className="font-display text-2xl mt-1 tabular-nums">
                {fmt(totalClicks)}
              </dd>
            </div>
          </dl>

          {slides.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add at least one slide above to see analytics.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/60">
                    <th className="font-medium px-2 py-2">Slide</th>
                    <th className="font-medium px-2 py-2 tabular-nums text-right">
                      Impr.
                    </th>
                    <th className="font-medium px-2 py-2 tabular-nums text-right">
                      Uniq.
                    </th>
                    <th className="font-medium px-2 py-2 tabular-nums text-right">
                      Clicks
                    </th>
                    <th className="font-medium px-2 py-2 tabular-nums text-right">
                      CTR
                    </th>
                    <th className="font-medium px-2 py-2 tabular-nums text-right">
                      Uniq. CTR
                    </th>
                    <th className="font-medium px-2 py-2 text-right">
                      Last event
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slides.map((slide, idx) => {
                    const row = byId.get(slide.id);
                    const impressions = Number(row?.impressions ?? 0);
                    const clicks = Number(row?.clicks ?? 0);
                    const uniqImpressions = Number(
                      row?.unique_impressions ?? 0,
                    );
                    const uniqClicks = Number(row?.unique_clicks ?? 0);
                    return (
                      <tr
                        key={slide.id}
                        className="border-b border-border/40 last:border-b-0"
                      >
                        <td className="px-2 py-2 max-w-[18rem]">
                          <div className="truncate font-medium">
                            {labelFor(slide, idx)}
                          </div>
                          {!slide.enabled && (
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Disabled
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-right">
                          {fmt(impressions)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-right text-muted-foreground">
                          {fmt(uniqImpressions)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-right">
                          {fmt(clicks)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-right">
                          {ctrPercent(clicks, impressions)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-right text-muted-foreground">
                          {ctrPercent(uniqClicks, uniqImpressions)}
                        </td>
                        <td className="px-2 py-2 text-right text-muted-foreground">
                          {formatLastSeen(row?.last_seen_at ?? null)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
