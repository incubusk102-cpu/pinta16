import { useMemo, useState } from "react";
import { Filter, Package, RefreshCw, Search, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatPHP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ORDER_STEPS,
  useCart,
  type CompletedOrder,
} from "@/contexts/CartContext";

type StatusFilter = "all" | CompletedOrder["status"];

const STATUS_LABEL: Record<CompletedOrder["status"], string> = {
  confirmed: "Confirmed",
  in_progress: "In progress",
  out_for_delivery: "Out for delivery",
  received: "Received",
};

const isWithin = (iso: string, fromIso?: string, toIso?: string) => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (fromIso) {
    const f = new Date(fromIso).getTime();
    if (!Number.isNaN(f) && t < f) return false;
  }
  if (toIso) {
    const e = new Date(toIso).getTime();
    if (!Number.isNaN(e) && t > e + 24 * 60 * 60 * 1000 - 1) return false;
  }
  return true;
};

export default function MyOrders() {
  const { orders, viewOrder, resyncOrder, orderNeedsSync } = useCart();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Per-order resync UI state — captures the latest server error so
  // the customer can see exactly why their order isn't showing in
  // admin yet, plus a "syncing" flag for the spinner.
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleResync = async (orderId: string) => {
    setSyncingId(orderId);
    const result = await resyncOrder(orderId);
    setSyncingId(null);
    if (result.ok) {
      setSyncErrors((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      toast.success(`Synced ${orderId} to the server`);
    } else {
      const detail =
        result.status !== undefined
          ? `${result.error} (HTTP ${result.status})`
          : result.error;
      setSyncErrors((prev) => ({ ...prev, [orderId]: detail }));
      toast.error(`Couldn't sync ${orderId}: ${detail}`);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!isWithin(o.createdAt, from || undefined, to || undefined))
        return false;
      if (!q) return true;
      const haystack = [
        o.id,
        o.shipment?.trackingNumber || "",
        o.shipment?.courier || "",
        ...o.items.map((i) => i.title),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search, status, from, to]);

  const reset = () => {
    setSearch("");
    setStatus("all");
    setFrom("");
    setTo("");
  };

  if (orders.length === 0) {
    return (
      <section className="bg-card/40 border border-border/60 rounded-xl p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Package className="w-4 h-4" /> My orders
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No orders yet.{" "}
          <Link to="/" className="underline">
            Browse the gallery
          </Link>{" "}
          to start collecting.
        </p>
      </section>
    );
  }

  const filtersActive =
    search.trim() !== "" || status !== "all" || from !== "" || to !== "";

  return (
    <section className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Package className="w-4 h-4" /> My orders
          <span className="text-[10px] text-muted-foreground/70">
            ({filtered.length} of {orders.length})
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="w-3.5 h-3.5 mr-1" />
          {showFilters ? "Hide filters" : "Filters"}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by order ID, item, or tracking #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm pl-8"
        />
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="mt-1 w-full bg-background border border-border rounded-md text-sm px-2 py-2"
            >
              <option value="all">All</option>
              {ORDER_STEPS.map((s) => (
                <option key={s.key} value={s.key}>
                  {STATUS_LABEL[s.key as CompletedOrder["status"]]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-sm mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              To
            </span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-sm mt-1"
            />
          </label>
          {filtersActive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              className="self-end"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No orders match your filters.
        </p>
      ) : (
        <ul className="divide-y divide-border/30">
          {filtered.map((o) => {
            const needsSync = orderNeedsSync(o);
            const lastError = syncErrors[o.id];
            const isSyncing = syncingId === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => (prev === o.id ? null : o.id))
                  }
                  className="w-full py-3 flex items-start justify-between gap-3 text-left rounded-md -mx-2 px-2 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 transition-colors"
                  aria-label={`View journey for order ${o.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{o.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {o.items.map((i) => i.title).join(", ")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString()} ·{" "}
                      <span className="text-foreground/80">
                        {STATUS_LABEL[o.status]}
                      </span>
                      {o.shipment?.courier ? ` · ${o.shipment.courier}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">
                    {formatPHP(o.total)}
                  </p>
                </button>
                {expanded === o.id && (
                  <div className="px-2 pb-3 space-y-2 text-xs border-t border-border/20 pt-2">
                    <ul className="space-y-1">
                      {o.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-foreground/90">
                            {item.title}
                            {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatPHP(item.price * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {o.orderInfo && (
                      <div className="text-muted-foreground">
                        <p className="font-medium text-foreground/80 text-[10px] uppercase tracking-wider mb-0.5">
                          Shipping
                        </p>
                        <p>
                          {[
                            o.orderInfo.addressLine1 || o.orderInfo.address,
                            o.orderInfo.barangay
                              ? `Brgy. ${o.orderInfo.barangay}`
                              : "",
                            o.orderInfo.city,
                            o.orderInfo.province,
                            o.orderInfo.postalCode,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    )}
                    {o.shipment?.trackingNumber && (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground/80 text-[10px] uppercase tracking-wider">
                          Tracking
                        </span>{" "}
                        {o.shipment.courier ? `${o.shipment.courier} · ` : ""}
                        {o.shipment.trackingNumber}
                      </p>
                    )}
                    {o.orderInfo?.courier && (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground/80 text-[10px] uppercase tracking-wider">
                          Courier
                        </span>{" "}
                        {o.orderInfo.courier}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewOrder(o.id);
                        }}
                        className="text-[11px] underline text-foreground/70 hover:text-foreground"
                      >
                        Full journey →
                      </button>
                    </div>
                  </div>
                )}
                {needsSync && (
                  <div className="mt-1 mb-2 -mx-2 px-2 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-amber-200">
                        Pending sync to server
                      </p>
                      <p className="text-[11px] text-amber-100/80 break-words">
                        {lastError
                          ? `Last error: ${lastError}`
                          : "This order is saved on this device but hasn't reached the server yet."}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSyncing}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleResync(o.id);
                      }}
                      className="h-7 px-2 text-[11px] shrink-0"
                    >
                      {isSyncing ? "Syncing…" : "Sync now"}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
