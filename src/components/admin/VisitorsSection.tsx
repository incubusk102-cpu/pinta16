import { useEffect, useState } from "react";
import { Activity, Users } from "lucide-react";

const VISITORS_API = "/api/visitors";
const POLL_INTERVAL_MS = 15 * 1000;

interface HistoryBucket {
  bucket: number;
  timestamp: string;
  visitors: number;
}

interface VisitorsResponse {
  live: number;
  history: HistoryBucket[];
  unique24h?: number;
}

export function VisitorsSection() {
  const [data, setData] = useState<VisitorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(VISITORS_API);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as VisitorsResponse;
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not reach visitors API",
          );
        }
      }
    };

    void load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Prefer the server-side de-duplicated unique24h count when available
  // so a single visitor that lingers across multiple hours is counted
  // once. Fall back to the older summed-buckets approximation for
  // compatibility with deployments that haven't shipped the new field.
  // Guard the array-ness of `history` so a malformed/old response shape
  // (e.g. KV namespace missing the bucket array) can't crash the page.
  const history: HistoryBucket[] = Array.isArray(data?.history)
    ? data!.history
    : [];
  const uniqueLast24h = data
    ? (data.unique24h ??
      history.reduce((sum, bucket) => sum + bucket.visitors, 0))
    : 0;
  const peak = data
    ? Math.max(0, ...history.map((bucket) => bucket.visitors))
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard
          label="Live now"
          value={data?.live ?? 0}
          hint="Visitors active in the last 5 minutes"
          icon={<Activity className="w-4 h-4" />}
          highlight
        />
        <StatCard
          label="Last 24 hours"
          value={uniqueLast24h}
          hint="Unique visitors in the last 24 hours"
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Peak hour"
          value={peak}
          hint="Highest unique visitors in any hour"
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      <div className="bg-card/40 border border-border/60 rounded-xl p-6">
        <h3 className="font-display text-base mb-4">Last 24 hours</h3>
        {data && history.length > 0 ? (
          <HistoryChart history={history} peak={peak} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No traffic recorded yet. Open the public site in another tab to
            generate a heartbeat.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive mt-3">
            Could not refresh ({error}). Will retry automatically.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  highlight = false,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-5 border ${
        highlight
          ? "border-primary/50 bg-primary/5"
          : "border-border/60 bg-card/40"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="font-display text-3xl mt-2">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function HistoryChart({
  history,
  peak,
}: {
  history: HistoryBucket[];
  peak: number;
}) {
  const safePeak = Math.max(peak, 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {history.map((bucket) => {
          const ratio = bucket.visitors / safePeak;
          const heightPct = Math.max(ratio * 100, bucket.visitors > 0 ? 6 : 2);
          return (
            <div
              key={bucket.bucket}
              className="flex-1 flex items-end"
              title={`${bucket.visitors} visitor${bucket.visitors === 1 ? "" : "s"} at ${new Date(
                bucket.timestamp,
              ).toLocaleString()}`}
            >
              <div
                className={`w-full rounded-sm ${
                  bucket.visitors > 0
                    ? "bg-primary/80"
                    : "bg-muted-foreground/15"
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        <span>24h ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
