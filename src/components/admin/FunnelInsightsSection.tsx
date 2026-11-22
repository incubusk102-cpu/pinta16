import { useEffect, useState } from "react";
import {
  TrendingDown,
  Globe,
  RefreshCw,
  AlertCircle,
  Activity,
} from "lucide-react";
import { Button } from "../ui/button";

interface FunnelRow {
  path_kind: string;
  sessions: number;
  views: number;
}

interface PathRow {
  path: string;
  path_kind: string;
  sessions: number;
  views: number;
  last_seen_at?: string;
}

interface ReferrerRow {
  host: string;
  hits: number;
  sessions: number;
}

interface DailyRow {
  day: string;
  views: number;
  sessions: number;
  mobile_views: number;
}

interface DeviceRow {
  device: string;
  views: number;
  sessions: number;
}

interface SummaryResponse {
  available: boolean;
  message?: string;
  days?: number;
  funnel?: FunnelRow[];
  topPaths?: PathRow[];
  referrers?: ReferrerRow[];
  daily?: DailyRow[];
  devices?: DeviceRow[];
}

const DAY_OPTIONS = [7, 30, 90];

// Pages we treat as the canonical funnel steps. The order is the
// shopper journey; missing kinds (rows the rollup didn't return) just
// render as zero. Other kinds (account, login, signup, policy, etc.)
// are still recorded but excluded from the funnel chart so the
// drop-off shape stays meaningful.
const FUNNEL_STEPS: { kind: string; label: string }[] = [
  { kind: "home", label: "Landing (home)" },
  { kind: "gallery", label: "Gallery" },
  { kind: "collection", label: "Collection" },
  { kind: "product", label: "Product page" },
  { kind: "checkout", label: "Checkout started" },
  { kind: "checkout-success", label: "Order placed" },
];

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

export function FunnelInsightsSection() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/page-events?action=summary&days=${selectedDays}&limit=25`,
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
        Loading funnel & traffic…
      </div>
    );
  }

  if (data && !data.available) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display text-2xl">Funnel & traffic</h2>
        </div>
        <div className="border border-amber-300/40 rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/20 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            {data.message ||
              "D1 binding (env.DB) not configured. Funnel analytics require D1."}
          </div>
        </div>
      </div>
    );
  }

  const funnel = data?.funnel || [];
  const funnelByKind = new Map<string, FunnelRow>(
    funnel.map((row) => [row.path_kind, row]),
  );

  const homeStep = funnelByKind.get("home");
  const baseline = Math.max(
    1,
    homeStep?.sessions ||
      funnel.reduce((acc, row) => Math.max(acc, row.sessions), 0) ||
      1,
  );

  const referrers = data?.referrers || [];
  const topPaths = data?.topPaths || [];
  const daily = data?.daily || [];
  const devices = data?.devices || [];
  const totalViews = daily.reduce((acc, d) => acc + d.views, 0);
  const totalSessions = daily.reduce((acc, d) => acc + d.sessions, 0);
  const totalMobile = daily.reduce((acc, d) => acc + d.mobile_views, 0);
  const mobileShare =
    totalViews > 0 ? Math.round((totalMobile / totalViews) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TrendingDown className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-display text-2xl">Funnel & traffic</h2>
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
        Self-hosted analytics. Each route change beacons one row to D1 (mapped
        to a stable funnel-kind so refactoring URLs doesn't break the rollup).
        No GA, no third-party pixel, no cookie banner.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="border border-border/40 rounded-lg bg-card/40 px-4 py-3">
          <div className="text-xs text-muted-foreground">Page views</div>
          <div className="text-2xl font-display tabular-nums mt-1">
            {totalViews.toLocaleString()}
          </div>
        </div>
        <div className="border border-border/40 rounded-lg bg-card/40 px-4 py-3">
          <div className="text-xs text-muted-foreground">Unique sessions</div>
          <div className="text-2xl font-display tabular-nums mt-1">
            {totalSessions.toLocaleString()}
          </div>
        </div>
        <div className="border border-border/40 rounded-lg bg-card/40 px-4 py-3">
          <div className="text-xs text-muted-foreground">Mobile share</div>
          <div className="text-2xl font-display tabular-nums mt-1">
            {mobileShare}%
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-lg bg-card/40">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          <h3 className="font-medium text-sm">Conversion funnel</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            unique sessions, last {days}d
          </span>
        </div>
        {funnel.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No page views recorded yet. Browse a few storefront pages while
            signed-out to populate the funnel.
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {FUNNEL_STEPS.map((step) => {
              const row = funnelByKind.get(step.kind);
              const sessions = row?.sessions || 0;
              const pct = baseline > 0 ? (sessions / baseline) * 100 : 0;
              return (
                <div key={step.kind} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-xs text-muted-foreground">
                    {step.label}
                  </div>
                  <div className="flex-1 h-6 bg-muted/30 rounded relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/80 to-emerald-400/80 rounded"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="w-32 shrink-0 text-right text-xs tabular-nums">
                    <span className="font-medium">
                      {sessions.toLocaleString()}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      ({pct.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="border border-border/40 rounded-lg bg-card/40">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-600" />
            <h3 className="font-medium text-sm">Top referrer hosts</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              last {days}d
            </span>
          </div>
          {referrers.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No referrer data yet — most shoppers come direct.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Host</th>
                  <th className="text-right px-4 py-2 font-medium">Sessions</th>
                  <th className="text-right px-4 py-2 font-medium">Hits</th>
                </tr>
              </thead>
              <tbody>
                {referrers.map((row) => (
                  <tr
                    key={row.host}
                    className="border-t border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[14rem]">
                      {row.host}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.sessions}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {row.hits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-border/40 rounded-lg bg-card/40">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-600" />
            <h3 className="font-medium text-sm">Device mix</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              last {days}d
            </span>
          </div>
          {devices.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No device data yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Device</th>
                  <th className="text-right px-4 py-2 font-medium">Sessions</th>
                  <th className="text-right px-4 py-2 font-medium">Views</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((row) => (
                  <tr
                    key={row.device}
                    className="border-t border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2 capitalize">{row.device}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.sessions}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {row.views}
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
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Top pages</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            last {days}d
          </span>
        </div>
        {topPaths.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No path data yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Path</th>
                <th className="text-left px-4 py-2 font-medium">Kind</th>
                <th className="text-right px-4 py-2 font-medium">Sessions</th>
                <th className="text-right px-4 py-2 font-medium">Views</th>
                <th className="text-right px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {topPaths.map((row) => (
                <tr
                  key={row.path}
                  className="border-t border-border/40 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-[18rem]">
                    {row.path}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {row.path_kind}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.sessions}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {row.views}
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
  );
}
