import { useEffect, useState } from "react";
import {
  Database,
  TrendingUp,
  Users,
  Package,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import GsapSparkline from "../motion/GsapSparkline";

interface MonthlyRevenuePoint {
  ym: string;
  revenue: number;
  orders: number;
}

interface RevenueData {
  available: boolean;
  thisMonth?: { revenue: number; orders: number };
  lastMonth?: { revenue: number; orders: number };
  allTime?: { revenue: number; orders: number };
  /** Last 6 months of revenue + orders, oldest first. */
  monthlyHistory?: MonthlyRevenuePoint[];
}

interface CustomersSummary {
  available: boolean;
  totalCustomers?: number;
  avgLtv?: number;
  repeatCustomers?: number;
}

interface TopProduct {
  product_id: string;
  product_title: string;
  total_revenue: number;
  total_qty: number;
}

interface D1Status {
  available: boolean;
  schemaApplied?: boolean;
  message?: string;
  tables?: Record<string, number>;
  existingTables?: string[];
}

const formatPHP = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

function getAdminToken(): string {
  try {
    const raw = localStorage.getItem("canvhub_admin_session_v1");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.token || "";
  } catch {
    return "";
  }
}

export function D1AnalyticsPanel() {
  const [status, setStatus] = useState<D1Status | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [customers, setCustomers] = useState<CustomersSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [applyingSchema, setApplyingSchema] = useState(false);
  const [schemaResult, setSchemaResult] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [statusRes, revenueRes, customersRes, productsRes] =
        await Promise.all([
          fetch("/api/admin/d1?action=status", { headers }),
          fetch("/api/admin/d1?action=revenue", { headers }),
          fetch("/api/admin/d1?action=customers-summary", { headers }),
          fetch("/api/admin/d1?action=top-products", { headers }),
        ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (revenueRes.ok) setRevenue(await revenueRes.json());
      if (customersRes.ok) setCustomers(await customersRes.json());
      if (productsRes.ok) {
        const data = await productsRes.json();
        setTopProducts(data.products || []);
      }
    } catch {
      // Silently degrade — D1 panel is optional.
    } finally {
      setLoading(false);
    }
  };

  const runApplySchema = async () => {
    setApplyingSchema(true);
    setSchemaResult(null);
    try {
      const token = getAdminToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const res = await fetch("/api/admin/d1?action=apply-schema", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setSchemaResult(
          `Schema applied: ${data.statementsExecuted} statements executed`,
        );
        void fetchAll();
      } else {
        setSchemaResult(
          `Schema apply failed: ${data.error || "unknown error"}${data.detail ? ` — ${data.detail}` : ""}`,
        );
      }
    } catch (err) {
      setSchemaResult(
        `Schema apply error: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setApplyingSchema(false);
    }
  };

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const token = getAdminToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const res = await fetch("/api/admin/d1?action=backfill", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setBackfillResult(
          `Backfill complete: ${data.mirrored} orders mirrored${data.failed ? `, ${data.failed} failed` : ""}`,
        );
        void fetchAll();
      } else {
        setBackfillResult(`Backfill failed: ${data.error || "unknown error"}`);
      }
    } catch (err) {
      setBackfillResult(
        `Backfill error: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setBackfilling(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  // D1 not configured — show setup prompt
  if (!loading && status && !status.available) {
    return (
      <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Database className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-wider">
            SQL Analytics (D1)
          </span>
        </div>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            D1 database not connected yet. To enable SQL analytics, CRM, and
            inventory management, create a D1 database in your Cloudflare
            dashboard and add the binding. See the setup instructions in{" "}
            <code className="text-xs bg-muted px-1 rounded">wrangler.toml</code>
            .
          </p>
        </div>
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="border border-border/40 rounded-lg p-4 bg-card/40 flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading D1 analytics…</span>
      </div>
    );
  }

  if (!status?.available) return null;

  // D1 binding present, but tables not yet created — offer one-click bootstrap.
  if (status.available && status.schemaApplied === false) {
    return (
      <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Database className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-wider">
            SQL Analytics (D1)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30">
            Connected — schema not applied
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          The D1 binding is live but the tables don&apos;t exist yet. Click
          below to create the schema (idempotent, safe to re-run).
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => void runApplySchema()}
            disabled={applyingSchema}
            className="h-8 text-xs"
          >
            {applyingSchema ? "Applying schema…" : "Apply schema"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAll()}
            disabled={loading}
            className="h-8 text-xs"
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
        {schemaResult && (
          <div className="text-xs p-2 rounded bg-muted/50 text-muted-foreground">
            {schemaResult}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Database className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-wider">
            SQL Analytics (D1)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
            Connected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAll()}
            disabled={loading}
            className="h-7 text-xs"
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runBackfill()}
            disabled={backfilling}
            className="h-7 text-xs"
          >
            {backfilling ? "Backfilling…" : "Backfill from KV"}
          </Button>
        </div>
      </div>

      {backfillResult && (
        <div className="text-xs p-2 rounded bg-muted/50 text-muted-foreground">
          {backfillResult}
        </div>
      )}

      {/* Revenue cards */}
      {revenue?.available && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-border/30 rounded-md p-3 bg-background/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                This month
              </span>
            </div>
            <p className="text-lg font-display">
              {formatPHP(revenue.thisMonth?.revenue || 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenue.thisMonth?.orders || 0} orders
            </p>
            {revenue.monthlyHistory && revenue.monthlyHistory.length >= 2 && (
              <div className="mt-2 text-foreground/80">
                <GsapSparkline
                  values={revenue.monthlyHistory.map((m) => m.revenue)}
                  height={28}
                  ariaLabel="Revenue trend over the last 6 months"
                />
              </div>
            )}
          </div>
          <div className="border border-border/30 rounded-md p-3 bg-background/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                Last month
              </span>
            </div>
            <p className="text-lg font-display">
              {formatPHP(revenue.lastMonth?.revenue || 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenue.lastMonth?.orders || 0} orders
            </p>
          </div>
          <div className="border border-border/30 rounded-md p-3 bg-background/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                All time
              </span>
            </div>
            <p className="text-lg font-display">
              {formatPHP(revenue.allTime?.revenue || 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenue.allTime?.orders || 0} orders
            </p>
          </div>
        </div>
      )}

      {/* Customer summary */}
      {customers?.available && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-border/30 rounded-md p-3 bg-background/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                Customers
              </span>
            </div>
            <p className="text-lg font-display">
              {customers.totalCustomers || 0}
            </p>
          </div>
          <div className="border border-border/30 rounded-md p-3 bg-background/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                Avg LTV
              </span>
            </div>
            <p className="text-lg font-display">
              {formatPHP(customers.avgLtv || 0)}
            </p>
          </div>
          <div className="border border-border/30 rounded-md p-3 bg-background/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                Repeat buyers
              </span>
            </div>
            <p className="text-lg font-display">
              {customers.repeatCustomers || 0}
            </p>
          </div>
        </div>
      )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">
              Top products by revenue
            </span>
          </div>
          <div className="space-y-1">
            {topProducts.slice(0, 5).map((p, i) => (
              <div
                key={p.product_id || i}
                className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0"
              >
                <span className="text-foreground truncate max-w-[60%]">
                  {i + 1}. {p.product_title}
                </span>
                <span className="text-muted-foreground">
                  {formatPHP(p.total_revenue)} · {p.total_qty} sold
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row counts */}
      {status?.tables && (
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground pt-2 border-t border-border/30">
          {Object.entries(status.tables).map(([table, count]) => (
            <span key={table}>
              <span className="font-medium">{table}</span>: {count} rows
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
