import { useEffect, useState } from "react";
import { Search, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

interface TopRow {
  query: string;
  uses: number;
  zero_result_uses?: number;
  avg_results?: number;
  last_seen_at?: string;
}

interface ZeroRow {
  query: string;
  uses: number;
  last_seen_at?: string;
}

interface RecentRow {
  id: string;
  query: string;
  results_count: number;
  filter_category: string | null;
  filter_availability: string | null;
  filter_price: string | null;
  country: string | null;
  ts: string;
}

interface SummaryResponse {
  available: boolean;
  message?: string;
  days?: number;
  top?: TopRow[];
  zeroResults?: ZeroRow[];
  recent?: RecentRow[];
}

const DAY_OPTIONS = [7, 30, 90];

const formatDateTime = (iso: string | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const formatRelative = (iso: string | undefined) => {
  if (!iso) return "—";
  try {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return iso;
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  } catch {
    return iso;
  }
};

export function SearchInsightsSection() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/search-events?action=summary&days=${selectedDays}&limit=50`,
        { credentials: "same-origin" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SummaryResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(days);
  }, [days]);

  if (loading && !data) {
    return (
      <div className="border border-border/40 rounded-lg p-6 bg-card/40 text-sm text-muted-foreground">
        Loading search insights…
      </div>
    );
  }

  if (data && !data.available) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display text-2xl">Search insights</h2>
        </div>
        <div className="border border-amber-300/40 rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/20 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            {data.message ||
              "D1 binding (env.DB) not configured. Search insights require D1."}
          </div>
        </div>
      </div>
    );
  }

  const top = data?.top || [];
  const zero = data?.zeroResults || [];
  const recent = data?.recent || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Search className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-display text-2xl">Search insights</h2>
        <div className="ml-auto flex items-center gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                d === days
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {d}d
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(days)}
            className="gap-1"
            disabled={loading}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="border border-rose-300/40 rounded-lg p-3 bg-rose-50/40 dark:bg-rose-950/20 flex items-start gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          <div className="text-muted-foreground">{error}</div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        What shoppers actually search for in the gallery, vs. what your
        catalogue answers. Beacon fires once per stable query (≥ 2 chars, 1.5 s
        of no typing). Persisted to D1 only — never KV — so this scales to
        thousands of searches/day on the free tier.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="border border-border/40 rounded-lg bg-card/40">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="font-medium text-sm">Top queries</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              last {days}d
            </span>
          </div>
          {top.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No searches recorded in this window yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Query</th>
                  <th className="text-right px-4 py-2 font-medium">Uses</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Avg results
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    0-result %
                  </th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => {
                  const zeroPct =
                    row.uses > 0
                      ? Math.round(
                          ((Number(row.zero_result_uses) || 0) / row.uses) *
                            100,
                        )
                      : 0;
                  return (
                    <tr
                      key={row.query}
                      className="border-t border-border/40 hover:bg-muted/30"
                    >
                      <td className="px-4 py-2 font-mono text-xs truncate max-w-[16rem]">
                        {row.query}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {row.uses}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {row.avg_results != null
                          ? Number(row.avg_results).toFixed(1)
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          zeroPct >= 50
                            ? "text-rose-600 font-medium"
                            : zeroPct >= 25
                              ? "text-amber-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {zeroPct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-border/40 rounded-lg bg-card/40">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <h3 className="font-medium text-sm">Zero-result queries</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              last {days}d
            </span>
          </div>
          {zero.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Every search has matched at least one painting. Nice.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Query</th>
                  <th className="text-right px-4 py-2 font-medium">Uses</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Last seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {zero.map((row) => (
                  <tr
                    key={row.query}
                    className="border-t border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[16rem]">
                      {row.query}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.uses}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {formatRelative(row.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="border border-border/40 rounded-lg bg-card/40">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Recent searches</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            most recent {recent.length}
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No searches yet. Try searching from the gallery while signed in to
            populate the log.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-4 py-2 font-medium">Query</th>
                <th className="text-right px-4 py-2 font-medium">Results</th>
                <th className="text-left px-4 py-2 font-medium">Filters</th>
                <th className="text-left px-4 py-2 font-medium">Country</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const filters = [
                  row.filter_category && `cat=${row.filter_category}`,
                  row.filter_availability && `avail=${row.filter_availability}`,
                  row.filter_price && `price=${row.filter_price}`,
                ].filter(Boolean) as string[];
                return (
                  <tr
                    key={row.id}
                    className="border-t border-border/40 hover:bg-muted/30"
                  >
                    <td
                      className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap"
                      title={formatDateTime(row.ts)}
                    >
                      {formatRelative(row.ts)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[18rem]">
                      {row.query}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        row.results_count === 0
                          ? "text-rose-600 font-medium"
                          : ""
                      }`}
                    >
                      {row.results_count}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {filters.length === 0 ? (
                        <span className="opacity-50">—</span>
                      ) : (
                        filters.join(" · ")
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {row.country || <span className="opacity-50">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
