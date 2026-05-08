import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  PackageCheck,
  PackageOpen,
  PackageX,
  Pencil,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ReturnStatus =
  | "requested"
  | "approved"
  | "received"
  | "completed"
  | "denied"
  | "cancelled";

interface QueueItemOrder {
  id: string;
  createdAt: string;
  total: number;
  status: string;
  customerName: string;
  customerCity: string;
  items: {
    id: string;
    title: string;
    image?: string;
    quantity: number;
    price: number;
  }[];
  refund: { status: string; amount: number } | null;
}

interface QueueItem {
  id: string;
  orderId: string;
  customerEmail: string;
  status: ReturnStatus;
  reason: string;
  description: string;
  rmaNumber: string | null;
  denialReason: string;
  refundAmount: number | null;
  /**
   * Reason the hybrid auto-refund couldn't run when this return was
   * completed (no PayMongo paymentIntent, COD order, PayMongo error,
   * etc). When non-null, the operator should use Manual refund on the
   * order instead.
   */
  autoRefundError: string | null;
  requestedAt: string;
  decidedAt: string;
  receivedAt: string;
  completedAt: string;
  cancelledAt: string;
  order: QueueItemOrder | null;
}

const STATUS_FILTERS: { value: ReturnStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "received", label: "Received" },
  { value: "completed", label: "Completed" },
  { value: "denied", label: "Denied" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE: Record<ReturnStatus, string> = {
  requested: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  approved: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  received: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  denied: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cancelled: "bg-muted text-muted-foreground",
};

const REASON_LABEL: Record<string, string> = {
  damaged_in_transit: "Damaged in transit",
  wrong_item: "Wrong item",
  not_as_described: "Not as described",
  changed_mind: "Changed mind",
  other: "Other",
};

const peso = (n: number) => `₱${Number.isFinite(n) ? n.toLocaleString() : "0"}`;

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

const fetchQueue = async (
  status: ReturnStatus | "all",
): Promise<QueueItem[]> => {
  const url = new URL("/api/orders", window.location.origin);
  url.searchParams.set("returns", "queue");
  if (status !== "all") url.searchParams.set("status", status);
  const res = await fetch(url.toString().replace(window.location.origin, ""), {
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.queue) ? data.queue : [];
};

const postAction = async (action: string, payload: Record<string, unknown>) => {
  const { jsonAuthHeaders } = await import("@/lib/api");
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

export function ReturnsSection() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "all">(
    "requested",
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchQueue(statusFilter);
      setItems(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load returns");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = [
        it.orderId,
        it.customerEmail,
        it.order?.customerName || "",
        it.reason,
        it.description,
        ...(it.order?.items || []).map((p) => p.title),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const summary = useMemo(() => {
    const tally: Record<ReturnStatus, number> = {
      requested: 0,
      approved: 0,
      received: 0,
      completed: 0,
      denied: 0,
      cancelled: 0,
    };
    for (const it of items) {
      if (it.status in tally) tally[it.status] += 1;
    }
    return tally;
  }, [items]);

  const handleApprove = async (it: QueueItem) => {
    const rma = window.prompt(
      "Optional RMA / tracking number for the return shipment (leave blank to skip):",
      it.rmaNumber || "",
    );
    if (rma === null) return;
    setBusyId(it.id);
    try {
      await postAction("approve-return", {
        orderId: it.orderId,
        ...(rma.trim() ? { rmaNumber: rma.trim() } : {}),
      });
      toast.success(`Approved return for ${it.orderId}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (it: QueueItem) => {
    const reason = window.prompt(
      "Reason for denying this return (visible to the customer):",
      "",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Denial reason is required");
      return;
    }
    setBusyId(it.id);
    try {
      await postAction("deny-return", {
        orderId: it.orderId,
        denialReason: reason.trim(),
      });
      toast.success(`Denied return for ${it.orderId}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deny");
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkReceived = async (it: QueueItem) => {
    setBusyId(it.id);
    try {
      await postAction("mark-return-received", { orderId: it.orderId });
      toast.success(`Marked received: ${it.orderId}`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to mark received",
      );
    } finally {
      setBusyId(null);
    }
  };

  // Fix the bookkeeping refund amount on a completed return without
  // touching PayMongo. Targets legacy records where the operator typed
  // pesos into the old centavos prompt and stored e.g. ₱0.20 instead
  // of ₱20. The Manual refund button on the order is still the way to
  // push the corrected amount through PayMongo if needed.
  const handleEditRefundAmount = async (it: QueueItem) => {
    const orderTotalPhp = Number(it.order?.total ?? 0);
    const currentPhp =
      it.refundAmount != null ? (it.refundAmount / 100).toFixed(2) : "";
    const raw = window.prompt(
      "Edit refund amount in PHP (e.g. 20 or 20.00). " +
        "This only fixes the recorded amount on the return; it does NOT " +
        "push any new money. Use Manual refund on the order if you also " +
        "need to refund the corrected amount through PayMongo.",
      currentPhp ||
        (Number.isFinite(orderTotalPhp) && orderTotalPhp > 0
          ? orderTotalPhp.toFixed(2)
          : ""),
    );
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      toast.error("Enter an amount in pesos");
      return;
    }
    const php = Number(trimmed);
    if (!Number.isFinite(php) || php < 0) {
      toast.error("Invalid amount");
      return;
    }
    const refundAmount = Math.max(0, Math.round(php * 100));
    setBusyId(it.id);
    try {
      await postAction("update-return-refund-amount", {
        orderId: it.orderId,
        refundAmount,
      });
      toast.success(
        `Updated refund amount on ${it.orderId} to ${peso(refundAmount / 100)}`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (it: QueueItem) => {
    // Pesos UX. Old prompt asked for centavos which kept tripping
    // operators up (typing `20` for "twenty pesos" recorded ₱0.20).
    // Default to the order total so the common case is one Enter.
    // We still send centavos to the API to match the storage shape.
    const orderTotalPhp = Number(it.order?.total ?? 0);
    const defaultPhp =
      it.refundAmount != null
        ? (it.refundAmount / 100).toFixed(2)
        : Number.isFinite(orderTotalPhp) && orderTotalPhp > 0
          ? orderTotalPhp.toFixed(2)
          : "";
    const raw = window.prompt(
      "Refund amount in PHP (e.g. 20 or 20.00). " +
        "If the order was paid via PayMongo we'll auto-refund this amount; " +
        "otherwise the return is just recorded and you can use Manual refund " +
        "on the order to push the money back manually.\n\n" +
        "Leave blank to skip recording an amount.",
      defaultPhp,
    );
    if (raw === null) return;
    const trimmed = raw.trim();
    let refundAmount: number | null = null;
    if (trimmed) {
      const php = Number(trimmed);
      if (!Number.isFinite(php) || php < 0) {
        toast.error("Invalid amount");
        return;
      }
      refundAmount = Math.max(0, Math.round(php * 100));
    }
    setBusyId(it.id);
    try {
      const result = (await postAction("complete-return", {
        orderId: it.orderId,
        ...(refundAmount != null ? { refundAmount } : {}),
      })) as { order?: { refund?: { status?: string; amount?: number } | null; returnRequest?: { autoRefundError?: string | null } } };
      const refund = result.order?.refund || null;
      const autoRefundError = result.order?.returnRequest?.autoRefundError || null;
      if (refund) {
        const amt = Number(refund.amount ?? 0);
        const statusLabel = refund.status === "succeeded" ? "succeeded" : "initiated";
        toast.success(
          `Completed return for ${it.orderId} — auto-refund ${peso(amt)} ${statusLabel}`,
        );
      } else if (autoRefundError) {
        toast.warning(
          `Completed return for ${it.orderId}. Auto-refund couldn't run (${autoRefundError}). Use Manual refund on the order to push the money back.`,
          { duration: 8000 },
        );
      } else {
        toast.success(`Completed return for ${it.orderId}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">Returns</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customer-filed return requests. Approve or deny pending requests,
            mark items received once they arrive, then complete the return after
            issuing any refund.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {(
          [
            "requested",
            "approved",
            "received",
            "completed",
            "denied",
            "cancelled",
          ] as ReturnStatus[]
        ).map((s) => (
          <div
            key={s}
            className="border border-border/40 rounded-md px-3 py-2 bg-card/30"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s}
            </p>
            <p className="text-lg font-semibold">{summary[s] || 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <Input
            placeholder="Search by order ID, customer, reason, or item title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as ReturnStatus | "all")
          }
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {loading ? "Loading…" : "No returns match these filters."}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((it) => {
            const isBusy = busyId === it.id;
            return (
              <li
                key={it.id}
                className="border border-border/50 rounded-lg p-4 bg-card/40 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm">{it.orderId}</p>
                      <span
                        className={`text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded-sm ${STATUS_BADGE[it.status] ?? STATUS_BADGE.cancelled}`}
                      >
                        {it.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {REASON_LABEL[it.reason] ?? it.reason}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {it.order?.customerName || it.customerEmail} ·{" "}
                      {it.customerEmail}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Filed {formatDate(it.requestedAt)}
                      {it.decidedAt
                        ? ` · Decided ${formatDate(it.decidedAt)}`
                        : ""}
                      {it.receivedAt
                        ? ` · Received ${formatDate(it.receivedAt)}`
                        : ""}
                      {it.completedAt
                        ? ` · Completed ${formatDate(it.completedAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">
                      {peso(it.order?.total ?? 0)}
                    </p>
                    {it.rmaNumber && (
                      <p className="text-[11px] text-muted-foreground font-mono">
                        RMA {it.rmaNumber}
                      </p>
                    )}
                  </div>
                </div>

                {it.description && (
                  <p className="text-sm whitespace-pre-wrap text-foreground/90 border-l-2 border-border pl-3">
                    {it.description}
                  </p>
                )}

                {it.order?.items && it.order.items.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {it.order.items.map((p) => (
                      <li key={p.id}>
                        {p.title} × {p.quantity}
                      </li>
                    ))}
                  </ul>
                )}

                {it.status === "denied" && it.denialReason && (
                  <p className="text-xs text-destructive">
                    Denied: {it.denialReason}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {it.status === "requested" && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isBusy}
                        onClick={() => void handleApprove(it)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void handleDeny(it)}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                        Deny
                      </Button>
                    </>
                  )}
                  {it.status === "approved" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void handleMarkReceived(it)}
                      >
                        <PackageOpen className="w-3.5 h-3.5 mr-1.5" />
                        Mark received
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isBusy}
                        onClick={() => void handleComplete(it)}
                      >
                        <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                        Complete return
                      </Button>
                    </>
                  )}
                  {it.status === "received" && (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={isBusy}
                      onClick={() => void handleComplete(it)}
                    >
                      <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                      Complete return
                    </Button>
                  )}
                  {it.status === "completed" && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center text-[11px] text-emerald-600 dark:text-emerald-400">
                          <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                          Refund recorded
                          {it.refundAmount != null
                            ? `: ${peso(it.refundAmount / 100)}`
                            : ""}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          disabled={isBusy}
                          onClick={() => void handleEditRefundAmount(it)}
                          title="Edit recorded refund amount (does not push money)"
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit amount
                        </Button>
                      </div>
                      {it.order?.refund && (
                        <span className="inline-flex items-center text-[11px] text-emerald-600 dark:text-emerald-400">
                          <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                          Auto-refund {it.order.refund.status}
                          {Number.isFinite(it.order.refund.amount)
                            ? `: ${peso(it.order.refund.amount)}`
                            : ""}
                        </span>
                      )}
                      {it.autoRefundError && !it.order?.refund && (
                        <span className="inline-flex items-start text-[11px] text-amber-600 dark:text-amber-400">
                          <XCircle className="w-3.5 h-3.5 mr-1.5 shrink-0 mt-0.5" />
                          <span>
                            Auto-refund didn't run: {it.autoRefundError}.{" "}
                            <span className="font-medium">
                              Use Manual refund on the order to push the money
                              back.
                            </span>
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                  {it.status === "cancelled" && (
                    <span className="inline-flex items-center text-[11px] text-muted-foreground">
                      <PackageX className="w-3.5 h-3.5 mr-1.5" />
                      Cancelled by customer
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ReturnsSection;
