import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  StickyNote,
  Trash2,
  Users,
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

type SegmentId = string;

// Backend mirror of `SEGMENT_CONSTANTS` exposed via
// `/api/customers?action=list-segments`. Keep these unions in sync with
// `functions/api/_lib/segments.js`.
type SegmentField =
  | "netSpend"
  | "grossSpend"
  | "ordersCount"
  | "daysSinceOrder"
  | "registered";
type SegmentOp = "gte" | "gt" | "lte" | "lt" | "eq" | "neq";
type SegmentColor =
  | "amber"
  | "emerald"
  | "sky"
  | "rose"
  | "violet"
  | "fuchsia"
  | "teal"
  | "muted";

interface SegmentCondition {
  field: SegmentField;
  op: SegmentOp;
  value: number | boolean;
}

interface SegmentRule {
  id: SegmentId;
  label: string;
  color: SegmentColor;
  priority: number;
  conditions: SegmentCondition[];
}

interface SegmentsMeta {
  fields: SegmentField[];
  numericOps: SegmentOp[];
  booleanOps: SegmentOp[];
  colors: SegmentColor[];
  maxSegments: number;
  maxConditionsPerSegment: number;
}

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
  segment: SegmentId;
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
  totalLtv: number;
  segmentCounts: Record<SegmentId, number>;
}

const COLOR_CLS: Record<SegmentColor, string> = {
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  muted: "bg-muted text-muted-foreground",
};

const FIELD_LABEL: Record<SegmentField, string> = {
  netSpend: "Net spend (₱)",
  grossSpend: "Gross spend (₱)",
  ordersCount: "Orders count",
  daysSinceOrder: "Days since last order",
  registered: "Registered account",
};

const OP_LABEL: Record<SegmentOp, string> = {
  gte: "≥",
  gt: ">",
  lte: "≤",
  lt: "<",
  eq: "=",
  neq: "≠",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

const segmentBadgeCls = (segment: SegmentRule | undefined) =>
  COLOR_CLS[(segment?.color ?? "muted") as SegmentColor];

const segmentLabel = (id: SegmentId, segments: SegmentRule[]) =>
  segments.find((s) => s.id === id)?.label ?? id;

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
  return (await res.json()) as {
    customers: Customer[];
    summary: Summary;
    segments: SegmentRule[];
    segmentsUpdatedAt: string;
    segmentsIsDefault: boolean;
  };
};

const fetchSegmentRules = async () => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/customers?action=list-segments", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as {
    segments: SegmentRule[];
    updatedAt: string;
    isDefault: boolean;
    meta: SegmentsMeta;
  };
};

const saveSegmentRules = async (segments: SegmentRule[]) => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "save-segments", segments }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as {
    segments: SegmentRule[];
    updatedAt: string;
    isDefault: boolean;
  };
};

const resetSegmentRulesRequest = async () => {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "reset-segments" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as {
    segments: SegmentRule[];
    updatedAt: string;
    isDefault: boolean;
  };
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
  const [segments, setSegments] = useState<SegmentRule[]>([]);
  const [segmentsIsDefault, setSegmentsIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentId | "all">("all");
  const [drawerEmail, setDrawerEmail] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const load = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await fetchCustomers();
      setCustomers(data.customers);
      setSummary(data.summary);
      setSegments(data.segments || []);
      setSegmentsIsDefault(Boolean(data.segmentsIsDefault));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load customers",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const onRulesSaved = useCallback(
    (next: { segments: SegmentRule[]; isDefault: boolean }) => {
      setSegments(next.segments);
      setSegmentsIsDefault(next.isDefault);
      // Re-fetch customers so segment assignments reflect the new rules.
      void load();
    },
    [],
  );

  useEffect(() => {
    void load(false);
  }, []);

  const segmentById = useMemo(() => {
    const m = new Map<SegmentId, SegmentRule>();
    for (const s of segments) m.set(s.id, s);
    return m;
  }, [segments]);

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
            onClick={() => setRulesOpen(true)}
          >
            <Settings2 className="w-3.5 h-3.5 mr-2" /> Segment rules
            {!segmentsIsDefault ? (
              <span
                className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                aria-label="Custom segment rules in use"
              >
                Custom
              </span>
            ) : null}
          </Button>
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
          {segments
            .slice()
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 3)
            .map((s) => (
              <Stat
                key={s.id}
                icon={
                  <span
                    className={`w-4 h-4 rounded-sm ${segmentBadgeCls(s)}`}
                  />
                }
                label={s.label}
                value={(summary.segmentCounts?.[s.id] || 0).toLocaleString()}
                hint={summarizeSegment(s)}
              />
            ))}
          <Stat
            icon={<Users className="w-4 h-4" />}
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
          onValueChange={(v) => setSegmentFilter(v as SegmentId | "all")}
        >
          <SelectTrigger className="h-9 w-44">
            <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            {segments.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
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
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${segmentBadgeCls(segmentById.get(c.segment))}`}
                    >
                      {segmentLabel(c.segment, segments)}
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
        segments={segments}
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

      <SegmentRulesSheet
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onSaved={onRulesSaved}
      />
    </section>
  );
}

const summarizeSegment = (s: SegmentRule) => {
  if (s.conditions.length === 0) return "Catch-all";
  return s.conditions
    .map((c) => {
      if (c.field === "registered") {
        return `${FIELD_LABEL[c.field]} ${OP_LABEL[c.op]} ${c.value ? "yes" : "no"}`;
      }
      return `${FIELD_LABEL[c.field]} ${OP_LABEL[c.op]} ${c.value}`;
    })
    .join(" · ");
};

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
  segments,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  segments: SegmentRule[];
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
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${segmentBadgeCls(segments.find((s) => s.id === customer.segment))}`}
              >
                {segmentLabel(customer.segment, segments)}
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

interface SegmentDraft extends SegmentRule {
  // `_uid` is a stable client-side key for React lists; it is stripped
  // before posting to the API. Using it lets the user rename `id` without
  // remounting the row.
  _uid: string;
}

const draftFromRule = (rule: SegmentRule): SegmentDraft => ({
  ...rule,
  conditions: rule.conditions.map((c) => ({ ...c })),
  _uid:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
});

const stripDraftUid = (draft: SegmentDraft): SegmentRule => {
  const { _uid: _drop, ...rest } = draft;
  void _drop;
  return rest;
};

function SegmentRulesSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (next: { segments: SegmentRule[]; isDefault: boolean }) => void;
}) {
  const [drafts, setDrafts] = useState<SegmentDraft[]>([]);
  const [meta, setMeta] = useState<SegmentsMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void fetchSegmentRules()
      .then((data) => {
        setDrafts(data.segments.map(draftFromRule));
        setMeta(data.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load rules");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const usedIds = useMemo(
    () => new Set(drafts.map((d) => d.id).filter(Boolean)),
    [drafts],
  );

  const updateDraft = (uid: string, patch: Partial<SegmentDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d._uid === uid ? { ...d, ...patch } : d)),
    );
  };

  const updateCondition = (
    uid: string,
    index: number,
    patch: Partial<SegmentCondition>,
  ) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d._uid === uid
          ? {
              ...d,
              conditions: d.conditions.map((c, i) =>
                i === index ? ({ ...c, ...patch } as SegmentCondition) : c,
              ),
            }
          : d,
      ),
    );
  };

  const addCondition = (uid: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d._uid === uid &&
        (!meta || d.conditions.length < meta.maxConditionsPerSegment)
          ? {
              ...d,
              conditions: [
                ...d.conditions,
                { field: "netSpend", op: "gte", value: 0 },
              ],
            }
          : d,
      ),
    );
  };

  const removeCondition = (uid: string, index: number) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d._uid === uid
          ? {
              ...d,
              conditions: d.conditions.filter((_, i) => i !== index),
            }
          : d,
      ),
    );
  };

  const removeSegment = (uid: string) => {
    setDrafts((prev) => prev.filter((d) => d._uid !== uid));
  };

  const addSegment = () => {
    if (meta && drafts.length >= meta.maxSegments) return;
    let id = "segment";
    let suffix = 1;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `segment_${suffix}`;
    }
    setDrafts((prev) => [
      ...prev,
      draftFromRule({
        id,
        label: `Segment ${suffix === 1 ? prev.length + 1 : suffix}`,
        color: "muted",
        priority: 10,
        conditions: [],
      }),
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = drafts.map(stripDraftUid);
      const result = await saveSegmentRules(payload);
      onSaved({ segments: result.segments, isDefault: result.isDefault });
      toast.success("Segment rules saved");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const result = await resetSegmentRulesRequest();
      setDrafts(result.segments.map(draftFromRule));
      onSaved({ segments: result.segments, isDefault: result.isDefault });
      toast.success("Reset to default rules");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not reset";
      setError(msg);
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customer segment rules</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Define how customers are bucketed into segments. Rules are evaluated
            highest priority first; the first match wins. A rule with no
            conditions acts as a catch-all. These rules also drive the broadcast
            audience picker.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading rules…
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {drafts.map((d) => (
                  <SegmentEditorRow
                    key={d._uid}
                    draft={d}
                    meta={meta}
                    onChange={(patch) => updateDraft(d._uid, patch)}
                    onConditionChange={(i, patch) =>
                      updateCondition(d._uid, i, patch)
                    }
                    onConditionAdd={() => addCondition(d._uid)}
                    onConditionRemove={(i) => removeCondition(d._uid, i)}
                    onRemove={() => removeSegment(d._uid)}
                    duplicateId={drafts.filter((x) => x.id === d.id).length > 1}
                  />
                ))}
              </div>

              {drafts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No segments yet. Add at least one before saving.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSegment}
                  disabled={meta ? drafts.length >= meta.maxSegments : false}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add segment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleReset()}
                  disabled={resetting || saving}
                >
                  {resetting ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Reset to defaults
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">
                  {drafts.length}
                  {meta ? ` / ${meta.maxSegments}` : ""} segments
                </span>
              </div>

              {error ? (
                <p className="text-xs text-rose-500 break-words">{error}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
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
                  disabled={saving || drafts.length === 0}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save rules
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SegmentEditorRow({
  draft,
  meta,
  onChange,
  onConditionChange,
  onConditionAdd,
  onConditionRemove,
  onRemove,
  duplicateId,
}: {
  draft: SegmentDraft;
  meta: SegmentsMeta | null;
  onChange: (patch: Partial<SegmentDraft>) => void;
  onConditionChange: (index: number, patch: Partial<SegmentCondition>) => void;
  onConditionAdd: () => void;
  onConditionRemove: (index: number) => void;
  onRemove: () => void;
  duplicateId: boolean;
}) {
  const colors = meta?.colors ?? ([] as SegmentColor[]);
  const numericOps = meta?.numericOps ?? ([] as SegmentOp[]);
  const booleanOps = meta?.booleanOps ?? ([] as SegmentOp[]);
  const fields = meta?.fields ?? ([] as SegmentField[]);

  const conditionLimitReached =
    !!meta && draft.conditions.length >= meta.maxConditionsPerSegment;

  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px] space-y-1">
          <Label htmlFor={`seg-label-${draft._uid}`} className="text-xs">
            Label
          </Label>
          <Input
            id={`seg-label-${draft._uid}`}
            value={draft.label}
            maxLength={40}
            onChange={(e) => {
              const label = e.target.value;
              // Auto-generate slug from label only when the user hasn't
              // already typed a custom id (id matches a prior slug of the
              // label).
              onChange({
                label,
                id:
                  draft.id === slugify(draft.label) ? slugify(label) : draft.id,
              });
            }}
            className="h-8"
          />
        </div>
        <div className="w-36 space-y-1">
          <Label htmlFor={`seg-id-${draft._uid}`} className="text-xs">
            ID
          </Label>
          <Input
            id={`seg-id-${draft._uid}`}
            value={draft.id}
            maxLength={32}
            onChange={(e) => onChange({ id: slugify(e.target.value) })}
            className="h-8 font-mono text-xs"
            aria-invalid={duplicateId}
          />
        </div>
        <div className="w-28 space-y-1">
          <Label htmlFor={`seg-prio-${draft._uid}`} className="text-xs">
            Priority
          </Label>
          <Input
            id={`seg-prio-${draft._uid}`}
            type="number"
            min={0}
            max={1000}
            value={draft.priority}
            onChange={(e) =>
              onChange({ priority: Number(e.target.value) || 0 })
            }
            className="h-8 tabular-nums"
          />
        </div>
        <div className="w-32 space-y-1">
          <Label className="text-xs">Color</Label>
          <Select
            value={draft.color}
            onValueChange={(v) => onChange({ color: v as SegmentColor })}
          >
            <SelectTrigger className="h-8">
              <span
                className={`w-3 h-3 rounded-sm mr-2 ${COLOR_CLS[draft.color]}`}
              />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {colors.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="inline-flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-sm ${COLOR_CLS[c]}`} />
                    {c}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove segment ${draft.label || draft.id}`}
          className="text-muted-foreground hover:text-rose-500"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {duplicateId ? (
        <p className="text-[11px] text-rose-500">
          Duplicate segment ID. Each segment must have a unique slug.
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            Conditions (ALL must match · empty = catch-all)
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onConditionAdd}
            disabled={conditionLimitReached}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Condition
          </Button>
        </div>

        {draft.conditions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No conditions — this segment matches every customer that hasn't
            already been claimed by a higher-priority rule.
          </p>
        ) : (
          <div className="space-y-1.5">
            {draft.conditions.map((c, i) => (
              <ConditionEditor
                key={i}
                condition={c}
                fields={fields}
                numericOps={numericOps}
                booleanOps={booleanOps}
                onChange={(patch) => onConditionChange(i, patch)}
                onRemove={() => onConditionRemove(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  fields,
  numericOps,
  booleanOps,
  onChange,
  onRemove,
}: {
  condition: SegmentCondition;
  fields: SegmentField[];
  numericOps: SegmentOp[];
  booleanOps: SegmentOp[];
  onChange: (patch: Partial<SegmentCondition>) => void;
  onRemove: () => void;
}) {
  const isBoolean = condition.field === "registered";
  const opChoices = isBoolean ? booleanOps : numericOps;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={condition.field}
        onValueChange={(v) => {
          const nextField = v as SegmentField;
          const nextIsBoolean = nextField === "registered";
          onChange({
            field: nextField,
            op: nextIsBoolean ? "eq" : "gte",
            value: nextIsBoolean ? true : 0,
          });
        }}
      >
        <SelectTrigger className="h-8 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f} value={f}>
              {FIELD_LABEL[f] ?? f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={condition.op}
        onValueChange={(v) => onChange({ op: v as SegmentOp })}
      >
        <SelectTrigger className="h-8 w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opChoices.map((o) => (
            <SelectItem key={o} value={o}>
              {OP_LABEL[o] ?? o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isBoolean ? (
        <Select
          value={condition.value ? "true" : "false"}
          onValueChange={(v) => onChange({ value: v === "true" })}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">yes</SelectItem>
            <SelectItem value="false">no</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          type="number"
          value={typeof condition.value === "number" ? condition.value : 0}
          onChange={(e) => onChange({ value: Number(e.target.value) || 0 })}
          className="h-8 w-28 tabular-nums"
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-label="Remove condition"
        className="text-muted-foreground hover:text-rose-500"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
