import { useEffect, useState } from "react";
import {
  Bell,
  Mail,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { Button } from "../ui/button";

interface DailyRow {
  day: string;
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

interface ByKindRow {
  channel: string;
  kind: string;
  total: number;
  delivered: number;
  skipped: number;
  failed: number;
  last_seen_at?: string;
}

interface RecentRow {
  id: string;
  channel: string;
  kind: string;
  recipient: string | null;
  order_id: string | null;
  delivered: number;
  skipped: number;
  provider: string | null;
  reason: string | null;
  attempted: number | null;
  successful: number | null;
  ts: string;
}

interface SummaryResponse {
  available: boolean;
  message?: string;
  days?: number;
  daily?: DailyRow[];
  byKind?: ByKindRow[];
  recent?: RecentRow[];
}

const DAY_OPTIONS = [7, 30, 90];

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

const channelLabel = (channel: string) =>
  channel === "email" ? "Email" : channel === "push" ? "Push" : channel;

const RowStatus = ({
  delivered,
  skipped,
}: {
  delivered: number;
  skipped: number;
}) => {
  if (delivered) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="w-3.5 h-3.5" />
        sent
      </span>
    );
  }
  if (skipped) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <MinusCircle className="w-3.5 h-3.5" />
        skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-600">
      <XCircle className="w-3.5 h-3.5" />
      failed
    </span>
  );
};

export function NotificationLogSection() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/notification-log?action=summary&days=${selectedDays}&limit=100`,
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
        Loading notification log…
      </div>
    );
  }

  if (data && !data.available) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display text-2xl">Notification log</h2>
        </div>
        <div className="border border-amber-300/40 rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/20 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            {data.message ||
              "D1 binding (env.DB) not configured. Notification log requires D1."}
          </div>
        </div>
      </div>
    );
  }

  const daily = data?.daily || [];
  const byKind = data?.byKind || [];
  const recent = data?.recent || [];

  const totals = daily.reduce(
    (acc, row) => {
      acc.delivered += row.delivered;
      acc.skipped += row.skipped;
      acc.failed += row.failed;
      acc.total += row.total;
      return acc;
    },
    { delivered: 0, skipped: 0, failed: 0, total: 0 },
  );

  const deliveryRate =
    totals.total > 0 ? Math.round((totals.delivered / totals.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-display text-2xl">Notification log</h2>
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
        Unified ledger of every outgoing transactional email and Web Push the
        site has attempted to deliver. Captures order status mails, the admin
        new-order alert, welcome emails, and order pushes. Test sends (operator
        inbox previews) are deliberately excluded.
      </p>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground">Total attempts</div>
          <div className="font-display text-2xl tabular-nums">
            {totals.total}
          </div>
          <div className="text-xs text-muted-foreground">last {days}d</div>
        </div>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground">Delivered</div>
          <div className="font-display text-2xl tabular-nums text-emerald-600">
            {totals.delivered}
          </div>
          <div className="text-xs text-muted-foreground">
            {deliveryRate}% delivery rate
          </div>
        </div>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground">Skipped</div>
          <div className="font-display text-2xl tabular-nums text-muted-foreground">
            {totals.skipped}
          </div>
          <div className="text-xs text-muted-foreground">
            disabled / muted / not configured
          </div>
        </div>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="text-xs text-muted-foreground">Failed</div>
          <div
            className={`font-display text-2xl tabular-nums ${
              totals.failed > 0 ? "text-rose-600" : "text-muted-foreground"
            }`}
          >
            {totals.failed}
          </div>
          <div className="text-xs text-muted-foreground">provider errors</div>
        </div>
      </div>

      <div className="border border-border/40 rounded-lg bg-card/40">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">By kind</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            last {days}d
          </span>
        </div>
        {byKind.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No notifications recorded in this window yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Channel</th>
                <th className="text-left px-4 py-2 font-medium">Kind</th>
                <th className="text-right px-4 py-2 font-medium">Sent</th>
                <th className="text-right px-4 py-2 font-medium">Skipped</th>
                <th className="text-right px-4 py-2 font-medium">Failed</th>
                <th className="text-right px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {byKind.map((row) => (
                <tr
                  key={`${row.channel}:${row.kind}`}
                  className="border-t border-border/40 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 text-xs">
                    {channelLabel(row.channel)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.kind}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                    {row.delivered}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {row.skipped}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      row.failed > 0 ? "text-rose-600 font-medium" : ""
                    }`}
                  >
                    {row.failed}
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
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Recent activity</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            most recent first
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No recent notifications.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {recent.map((row) => (
              <div
                key={row.id}
                className="px-4 py-2 grid grid-cols-12 gap-3 text-xs hover:bg-muted/30"
              >
                <div className="col-span-2 text-muted-foreground">
                  {formatRelative(row.ts)}
                </div>
                <div className="col-span-1">{channelLabel(row.channel)}</div>
                <div className="col-span-2 font-mono">{row.kind}</div>
                <div className="col-span-3 font-mono truncate">
                  {row.recipient || "—"}
                </div>
                <div className="col-span-1">
                  <RowStatus delivered={row.delivered} skipped={row.skipped} />
                </div>
                <div className="col-span-3 text-muted-foreground truncate">
                  {row.reason ||
                    (row.provider ? `via ${row.provider}` : "") ||
                    (row.order_id ? `order ${row.order_id}` : "")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
