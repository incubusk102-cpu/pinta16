import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  Percent,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface PromoStat {
  code: string;
  type: string;
  value: number;
  freeShipping?: boolean;
  enabled: boolean;
  usageLimit: number | null;
  expiresAt: string | null;
  description: string;
  uses: number;
  totalDiscount: number;
  grossRevenue: number;
  lastUsedAt: string;
}

const peso = (n: number) =>
  `₱${(Math.round(n * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPromoValue = (p: PromoStat) => {
  if (p.type === "percent") return `${p.value}% off`;
  if (p.type === "flat") return `flat ${peso(p.value)}`;
  if (p.type === "free_shipping") return "free shipping";
  if (p.type === "amount" || p.type === "fixed") return `${peso(p.value)} off`;
  return `${p.value}`;
};

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
};

const fetchPromos = async (): Promise<PromoStat[]> => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/orders?metrics=promos", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { promos: PromoStat[] };
  return Array.isArray(data.promos) ? data.promos : [];
};

export function MarketingSection() {
  const [promos, setPromos] = useState<PromoStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const list = await fetchPromos();
      setPromos(list);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load promo stats",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const totals = useMemo(
    () =>
      promos.reduce(
        (acc, p) => {
          acc.uses += p.uses;
          acc.totalDiscount += p.totalDiscount;
          acc.grossRevenue += p.grossRevenue;
          if (p.uses > 0) acc.activeCodes += 1;
          return acc;
        },
        { uses: 0, totalDiscount: 0, grossRevenue: 0, activeCodes: 0 },
      ),
    [promos],
  );

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Marketing</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Promo code performance and revenue impact. Codes are managed in
            Storefront → Promo codes.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
          )}
          Refresh
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Megaphone className="w-4 h-4" />}
          label="Codes used"
          value={totals.activeCodes.toLocaleString()}
          hint={`${promos.length.toLocaleString()} configured`}
        />
        <Stat
          icon={<Percent className="w-4 h-4" />}
          label="Total redemptions"
          value={totals.uses.toLocaleString()}
        />
        <Stat
          icon={<TrendingUp className="w-4 h-4" />}
          label="Revenue from promos"
          value={peso(totals.grossRevenue)}
        />
        <Stat
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Discount given"
          value={peso(totals.totalDiscount)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading promo stats…
        </div>
      ) : promos.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          No promo codes yet. Create one in Storefront → Promo codes.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">
                  Discount
                </th>
                <th className="text-right px-4 py-3">Uses</th>
                <th className="text-right px-4 py-3">Discount given</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">
                  Revenue
                </th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">
                  Last used
                </th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const cap = p.usageLimit;
                const expired =
                  p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();
                return (
                  <tr key={p.code} className="border-t border-border/40">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold">{p.code}</div>
                      {p.description ? (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {p.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs">
                      {formatPromoValue(p)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.uses.toLocaleString()}
                      {cap ? (
                        <span className="text-muted-foreground">
                          /{cap.toLocaleString()}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {peso(p.totalDiscount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {peso(p.grossRevenue)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {formatDate(p.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {expired ? (
                        <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded">
                          Expired
                        </span>
                      ) : !p.enabled ? (
                        <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                          Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-card/40 border border-border/60 rounded-xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-2xl">{value}</div>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
