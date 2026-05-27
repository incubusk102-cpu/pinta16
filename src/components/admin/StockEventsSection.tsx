import { useEffect, useState } from "react";
import {
  Boxes,
  AlertCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  PackageCheck,
  PackageX,
  History,
} from "lucide-react";
import { Button } from "../ui/button";

interface DailyRow {
  day: string;
  sold: number;
  reserved: number;
  available: number;
  draft: number;
  deleted: number;
  total: number;
}

interface ByProductRow {
  product_id: string;
  product_title: string | null;
  category: string | null;
  total: number;
  sold: number;
  reserved: number;
  last_seen_at: string | null;
  last_state: string | null;
}

interface RecentRow {
  id: string;
  product_id: string;
  product_title: string | null;
  category: string | null;
  from_state: string | null;
  to_state: string;
  source: string;
  actor: string | null;
  ts: string;
}

interface CurrentStock {
  available: boolean;
  reason?: string;
  total?: number;
  threshold?: number;
  isLowStock?: boolean;
  byState?: {
    available: number;
    reserved: number;
    sold: number;
    draft: number;
  };
  byCategory?: { category: string; available: number }[];
}

interface SummaryResponse {
  available: boolean;
  message?: string;
  days?: number;
  daily?: DailyRow[];
  byProduct?: ByProductRow[];
  recent?: RecentRow[];
  current?: CurrentStock;
}

const DAY_OPTIONS = [7, 30, 90];
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

const formatRelative = (iso: string | null | undefined) => {
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

const STATE_CLASS: Record<string, string> = {
  available: "text-emerald-600",
  reserved: "text-amber-600",
  sold: "text-rose-600",
  draft: "text-muted-foreground",
  deleted: "text-rose-600",
};

const stateBadge = (state: string | null) => {
  if (!state) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`font-mono text-xs ${STATE_CLASS[state] || ""}`}>
      {state}
    </span>
  );
};

export function StockEventsSection() {
  const [days, setDays] = useState<number>(30);
  const [threshold, setThreshold] = useState<number>(
    DEFAULT_LOW_STOCK_THRESHOLD,
  );
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedDays: number, selectedThreshold: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: "summary",
        days: String(selectedDays),
        limit: "100",
        threshold: String(selectedThreshold),
      });
      const res = await fetch(`/api/stock-events?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SummaryResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(days, threshold);
  }, [days, threshold]);

  if (loading && !data) {
    return (
      <div className="border border-border/40 rounded-lg p-6 bg-card/40 text-sm text-muted-foreground">
        Loading stock events…
      </div>
    );
  }

  if (data && !data.available) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Boxes className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display text-2xl">Stock events</h2>
        </div>
        <div className="border border-amber-300/40 rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/20 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            {data.message ||
              "D1 binding (env.DB) not configured. Stock events require D1."}
          </div>
        </div>
      </div>
    );
  }

  const daily = data?.daily || [];
  const byProduct = data?.byProduct || [];
  const recent = data?.recent || [];
  const current = data?.current;

  const totals = daily.reduce(
    (acc, row) => {
      acc.sold += row.sold;
      acc.reserved += row.reserved;
      acc.available += row.available;
      acc.total += row.total;
      return acc;
    },
    { sold: 0, reserved: 0, available: 0, total: 0 },
  );

  const lowStockCategories =
    current?.byCategory?.filter((c) => c.available <= 2) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Boxes className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-display text-2xl">Stock events</h2>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            Low-stock threshold
            <input
              type="number"
              min={0}
              max={1000}
              value={threshold}
              onChange={(e) => {
                const next = Math.max(
                  0,
                  Math.min(1000, Math.floor(Number(e.target.value) || 0)),
                );
                setThreshold(next);
              }}
              className="w-16 ml-1 px-2 py-1 rounded-md text-xs bg-muted border border-border/40"
            />
          </label>
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
            onClick={() => void load(days, threshold)}
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
        Ledger of every product availability transition. KV stays the source of
        truth for the current snapshot below; the D1 timeline answers
        &ldquo;when did this product sell?&rdquo; and &ldquo;how often did I
        toggle this draft this week?&rdquo;.
      </p>

      {current?.available && current.isLowStock && (
        <div className="border border-amber-400/60 rounded-lg p-4 bg-amber-50/60 dark:bg-amber-950/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              Running low on inventory
            </div>
            <div className="text-muted-foreground mt-1">
              Only{" "}
              <span className="font-mono tabular-nums">
                {current.byState?.available ?? 0}
              </span>{" "}
              available product
              {(current.byState?.available ?? 0) === 1 ? "" : "s"} remaining
              (threshold:{" "}
              <span className="font-mono">{current.threshold ?? 0}</span>).
              Consider listing new originals.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <PackageCheck className="w-3.5 h-3.5" />
            Available right now
          </div>
          <div
            className={`font-display text-2xl tabular-nums ${
              current?.isLowStock ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {current?.byState?.available ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            of {current?.total ?? 0} total
          </div>
        </div>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Sold in window
          </div>
          <div className="font-display text-2xl tabular-nums text-rose-600">
            {totals.sold}
          </div>
          <div className="text-xs text-muted-foreground">last {days}d</div>
        </div>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <History className="w-3.5 h-3.5" />
            Reserved in window
          </div>
          <div className="font-display text-2xl tabular-nums text-amber-600">
            {totals.reserved}
          </div>
          <div className="text-xs text-muted-foreground">
            transitions to reserved
          </div>
        </div>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <PackageX className="w-3.5 h-3.5" />
            Sold lifetime
          </div>
          <div className="font-display text-2xl tabular-nums text-muted-foreground">
            {current?.byState?.sold ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            products currently marked sold
          </div>
        </div>
      </div>

      {current?.available &&
        (current.byCategory?.length ?? 0) > 0 &&
        lowStockCategories.length > 0 && (
          <div className="border border-amber-300/40 rounded-lg bg-card/40">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-600" />
              <h3 className="font-medium text-sm">Categories near sell-out</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                ≤ 2 available
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Available
                  </th>
                </tr>
              </thead>
              <tbody>
                {lowStockCategories.map((row) => (
                  <tr
                    key={row.category}
                    className="border-t border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2">{row.category}</td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        row.available === 0 ? "text-rose-600" : "text-amber-600"
                      }`}
                    >
                      {row.available}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div className="border border-border/40 rounded-lg bg-card/40">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Boxes className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Most-active products</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            last {days}d
          </span>
        </div>
        {byProduct.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No stock transitions recorded in this window yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Product</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-right px-4 py-2 font-medium">Sold</th>
                <th className="text-right px-4 py-2 font-medium">Reserved</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-right px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((row) => (
                <tr
                  key={row.product_id}
                  className="border-t border-border/40 hover:bg-muted/30"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium text-xs">
                      {row.product_title || row.product_id}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {row.product_id}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {row.category || "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">
                    {row.sold}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-600">
                    {row.reserved}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.total}
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

      <div className="border border-border/40 rounded-lg bg-card/40">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Recent activity</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            last {recent.length} events
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No recent stock events.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {recent.map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium">
                    {row.product_title || row.product_id}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {stateBadge(row.from_state)} →{" "}
                    {stateBadge(row.to_state || null)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRelative(row.ts)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                  <span className="font-mono">{row.source}</span>
                  {row.actor && <span>by {row.actor}</span>}
                  {row.category && <span>{row.category}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
