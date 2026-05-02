import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Crown,
  Download,
  Loader2,
  RefreshCw,
  Save,
  Search,
  StickyNote,
  TrendingDown,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import ScrollableTable from "./ScrollableTable";

type Segment = "vip" | "repeat" | "one_time" | "at_risk" | "lead";

interface Customer {
  email: string;
  name: string;
  registered: boolean;
  registeredAt: string;
  lastSeenAt: string;
  ordersCount: number;
  grossSpend: number;
  netSpend: number;
  refundedAmount: number;
  firstOrderAt: string;
  lastOrderAt: string;
  daysSinceOrder: number | null;
  cities: string[];
  notes: string;
  tags: string[];
  segment: Segment;
}

interface CustomerOrder {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  voucherCode: string;
  discount: number;
  refund?: { status: string; amount: number };
}

interface Summary {
  total: number;
  vip: number;
  repeat: number;
  atRisk: number;
  leads: number;
  oneTime: number;
  totalLtv: number;
}

const SEGMENT_LABEL: Record<Segment, string> = {
  vip: "VIP",
  repeat: "Repeat",
  one_time: "One-time",
  at_risk: "At-risk",
  lead: "Lead",
};

const SEGMENT_CLS: Record<Segment, string> = {
  vip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  repeat: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  one_time: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  at_risk: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  lead: "bg-muted text-muted-foreground",
};

const peso = (n: number) =>
  `₱${(Math.round(n * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
};

const csvEscape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const fetchCustomers = async () => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/customers?action=list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as { customers: Customer[]; summary: Summary };
};

const fetchCustomerOrders = async (email: string) => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch(
    `/api/customers?action=detail&email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [] as CustomerOrder[];
  const data = (await res.json()) as { orders: CustomerOrder[] };
  return Array.isArray(data.orders) ? data.orders : [];
};

const saveMeta = async (email: string, notes: string, tags: string[]) => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "update-meta", email, notes, tags }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
};

export function CustomersSection() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<Segment | "all">("all");
  const [drawerEmail, setDrawerEmail] = useState<string | null>(null);

  const load = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await fetchCustomers();
      setCustomers(data.customers);
      setSummary(data.summary);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load customers",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (segmentFilter !== "all" && c.segment !== segmentFilter) return false;
      if (!q) return true;
      const hay = [
        c.email,
        c.name,
        c.cities.join(" "),
        c.notes,
        c.tags.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search, segmentFilter]);

  const exportCsv = () => {
    const header = [
      "email",
      "name",
      "segment",
      "ordersCount",
      "netSpend",
      "grossSpend",
      "refundedAmount",
      "firstOrderAt",
      "lastOrderAt",
      "daysSinceOrder",
      "cities",
      "tags",
      "registeredAt",
      "lastSeenAt",
      "notes",
    ];
    const rows = filtered.map((c) =>
      [
        c.email,
        c.name,
        c.segment,
        c.ordersCount,
        c.netSpend,
        c.grossSpend,
        c.refundedAmount,
        c.firstOrderAt,
        c.lastOrderAt,
        c.daysSinceOrder ?? "",
        c.cities.join("; "),
        c.tags.join("; "),
        c.registeredAt,
        c.lastSeenAt,
        c.notes.replace(/\n/g, " "),
      ]
        .map(csvEscape)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const drawerCustomer = drawerEmail
    ? customers.find((c) => c.email === drawerEmail) || null
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading customers…
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Customers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated from your orders. Filter by segment, add notes and tags,
            and export everything to CSV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-2" /> Export CSV
          </Button>
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
        </div>
      </header>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<Crown className="w-4 h-4" />}
            label="VIP customers"
            value={summary.vip.toLocaleString()}
            hint={`Net spend ≥ ${peso(10000)}`}
          />
          <Stat
            icon={<Award className="w-4 h-4" />}
            label="Repeat"
            value={summary.repeat.toLocaleString()}
            hint="2+ orders"
          />
          <Stat
            icon={<TrendingDown className="w-4 h-4" />}
            label="At-risk"
            value={summary.atRisk.toLocaleString()}
            hint="No order in 60+ days"
          />
          <Stat
            icon={<UserPlus className="w-4 h-4" />}
            label="Total LTV"
            value={peso(summary.totalLtv)}
            hint={`${summary.total.toLocaleString()} customers`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name, city, tag…"
            className="h-9 pl-8"
          />
        </div>
        <Select
          value={segmentFilter}
          onValueChange={(v) => setSegmentFilter(v as Segment | "all")}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="repeat">Repeat</SelectItem>
            <SelectItem value="one_time">One-time</SelectItem>
            <SelectItem value="at_risk">At-risk</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {customers.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          {customers.length === 0
            ? "No customers yet. Once orders come in they'll be aggregated here."
            : "No customers match the current filters."}
        </div>
      ) : (
        <ScrollableTable>
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">
                  Segment
                </th>
                <th className="text-right px-4 py-3">Orders</th>
                <th className="text-right px-4 py-3">Net spend</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">
                  Last order
                </th>
                <th className="text-left px-4 py-3 hidden xl:table-cell">
                  Tags
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.email}
                  className="border-t border-border/40 hover:bg-card/30 cursor-pointer"
                  onClick={() => setDrawerEmail(c.email)}
                >
                  <td className="px-4 py-3 min-w-[200px]">
                    <div className="font-medium truncate max-w-[260px] flex items-center gap-1.5">
                      <span className="truncate">{c.name || c.email}</span>
                      {c.notes.trim() ? (
                        <StickyNote
                          className="w-3.5 h-3.5 text-amber-500 shrink-0"
                          aria-label="Has internal notes"
                        />
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                      {c.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${SEGMENT_CLS[c.segment]}`}
                    >
                      {SEGMENT_LABEL[c.segment]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.ordersCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {peso(c.netSpend)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                    {c.lastOrderAt ? (
                      <>
                        {formatDate(c.lastOrderAt)}
                        {c.daysSinceOrder !== null
                          ? ` · ${c.daysSinceOrder}d ago`
                          : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-muted rounded"
                        >
                          {t}
                        </span>
                      ))}
                      {c.tags.length > 4 ? (
                        <span className="text-[10px] text-muted-foreground">
                          +{c.tags.length - 4}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}

      <CustomerDrawer
        customer={drawerCustomer}
        onClose={() => setDrawerEmail(null)}
        onSaved={(next) => {
          setCustomers((prev) =>
            prev.map((c) =>
              c.email === next.email
                ? { ...c, notes: next.notes, tags: next.tags }
                : c,
            ),
          );
        }}
      />
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

function CustomerDrawer({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: (next: { email: string; notes: string; tags: string[] }) => void;
}) {
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (customer) {
      setNotes(customer.notes);
      setTags(customer.tags);
      setTagInput("");
      setLoadingOrders(true);
      void fetchCustomerOrders(customer.email)
        .then((list) => setOrders(list))
        .catch(() => setOrders([]))
        .finally(() => setLoadingOrders(false));
    }
  }, [customer]);

  if (!customer) {
    return (
      <Sheet open={false} onOpenChange={(open) => !open && onClose()}>
        <SheetContent />
      </Sheet>
    );
  }

  const addTag = (raw: string) => {
    const trimmed = raw.trim().slice(0, 32);
    if (!trimmed) return;
    if (tags.includes(trimmed)) return;
    if (tags.length >= 16) return;
    setTags([...tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMeta(customer.email, notes, tags);
      onSaved({ email: customer.email, notes, tags });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-w-md w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{customer.name || customer.email}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium truncate">{customer.email}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Segment</span>
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${SEGMENT_CLS[customer.segment]}`}
              >
                {SEGMENT_LABEL[customer.segment]}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Orders</span>
              <span>{customer.ordersCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Net spend</span>
              <span className="tabular-nums">{peso(customer.netSpend)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">First order</span>
              <span>{formatDate(customer.firstOrderAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Last order</span>
              <span>{formatDate(customer.lastOrderAt)}</span>
            </div>
            {customer.cities.length > 0 ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Cities</span>
                <span className="truncate">{customer.cities.join(", ")}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag (e.g. wholesale, gifted)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim() || tags.length >= 16}
              >
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Up to 16 tags · 32 chars each.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">Notes</Label>
            <textarea
              id="cust-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              maxLength={4000}
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Internal notes. Only admins see these."
            />
            <p className="text-xs text-muted-foreground">
              {notes.length.toLocaleString()} / 4,000 characters
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              Save
            </Button>
          </div>

          <div>
            <Label>Order history</Label>
            {loadingOrders ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
              </div>
            ) : orders.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No orders yet.
              </p>
            ) : (
              <ul className="space-y-1.5 mt-1">
                {orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded border border-border/40 bg-card/40 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-medium">{o.id}</div>
                      <div className="text-muted-foreground">
                        {formatDate(o.createdAt)} ·{" "}
                        {o.status.replace(/_/g, " ")}
                        {o.voucherCode ? ` · ${o.voucherCode}` : ""}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      {peso(o.total)}
                      {o.refund?.status === "succeeded" ? (
                        <div className="text-rose-500 text-[10px] uppercase tracking-wider">
                          Refunded
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
