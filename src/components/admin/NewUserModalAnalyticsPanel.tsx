import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCcw, Beaker } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface VariantRow {
  variant: "a" | "b";
  impressions: number;
  copies: number;
  submits: number;
  unique_impressions: number;
  unique_copies: number;
  unique_submits: number;
  last_seen_at: string | null;
}

interface AnalyticsResponse {
  available: boolean;
  days: number;
  variants: VariantRow[];
}

const WINDOW_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const formatPercent = (numerator: number, denominator: number): string => {
  if (!denominator) return "—";
  const pct = (numerator / denominator) * 100;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
};

const formatNumber = (n: number): string => new Intl.NumberFormat().format(n);

const formatTimestamp = (raw: string | null): string => {
  if (!raw) return "—";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(raw));
  } catch {
    return raw;
  }
};

export function NewUserModalAnalyticsPanel() {
  const { token } = useAdminAuth();
  const [days, setDays] = useState<string>("30");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`/api/newuser-modal-events?days=${days}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as AnalyticsResponse;
        setData(payload);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not load modal analytics",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days, token],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading A/B analytics…
        </div>
      </section>
    );
  }

  if (!data?.available) {
    return (
      <section className="rounded-md border border-dashed border-border/60 bg-card/30 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Beaker className="w-5 h-5 mt-0.5 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            A/B analytics need a D1 database. Once <code>env.DB</code> is bound
            and migration <code>0012_newuser_modal_events.sql</code> is applied
            this panel will show impressions, copies and conversions per
            variant.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-card/40 border border-border/60 flex items-center justify-center shrink-0">
            <Beaker className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display text-base">A/B analytics</h3>
            <p className="text-xs text-muted-foreground mt-1">
              One row per variant. Conversion = email captures or voucher copies
              divided by impressions.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(false)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-muted-foreground border-b border-border/40">
              <th className="py-2 pr-3">Variant</th>
              <th className="py-2 pr-3">Impressions</th>
              <th className="py-2 pr-3">Unique</th>
              <th className="py-2 pr-3">Copies</th>
              <th className="py-2 pr-3">Submits</th>
              <th className="py-2 pr-3">Conv. rate</th>
              <th className="py-2 pr-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {data.variants.map((row) => {
              const conversions = row.unique_copies + row.unique_submits;
              return (
                <tr
                  key={row.variant}
                  className="border-b border-border/20 last:border-b-0"
                >
                  <td className="py-2 pr-3 font-mono uppercase">
                    {row.variant}
                  </td>
                  <td className="py-2 pr-3">{formatNumber(row.impressions)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {formatNumber(row.unique_impressions)}
                  </td>
                  <td className="py-2 pr-3">{formatNumber(row.copies)}</td>
                  <td className="py-2 pr-3">{formatNumber(row.submits)}</td>
                  <td className="py-2 pr-3">
                    {formatPercent(conversions, row.unique_impressions)}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {formatTimestamp(row.last_seen_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
