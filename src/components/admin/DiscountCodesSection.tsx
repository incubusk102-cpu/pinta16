import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  XCircle,
  Filter,
  Loader2,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import ScrollableTable from "./ScrollableTable";

type CodeType = "percent" | "fixed" | "flat" | "free_shipping";

type CodeStatus = "active" | "disabled" | "expired" | "exhausted";

interface CodeStats {
  uses: number;
  totalDiscount: number;
  grossRevenue: number;
  uniqueCustomers: number;
  lastRedeemedAt: string;
}

interface CodeItem {
  code: string;
  type: CodeType;
  value: number;
  freeShipping: boolean;
  minSpend: number;
  usageLimit: number | null;
  usageCount: number;
  maxRedemptionsPerCustomer: number;
  expiresAt: string | null;
  enabled: boolean;
  description: string;
  status: CodeStatus;
  stats: CodeStats | null;
  effectiveUses: number;
}

interface ListSummary {
  total: number;
  active: number;
  disabled: number;
  expired: number;
  exhausted: number;
  totalRedemptions: number;
  totalDiscountGiven: number;
  totalGrossRevenue: number;
}

interface ListResponse {
  items: CodeItem[];
  summary: ListSummary;
  d1Available: boolean;
}

interface RedemptionRow {
  orderId: string;
  customerEmail: string;
  discount: number;
  total: number;
  redeemedAt: string;
}

interface DetailResponse {
  promo: CodeItem;
  recentRedemptions: RedemptionRow[];
  d1Available: boolean;
}

type StatusFilter = "all" | CodeStatus;

const TYPE_OPTIONS: { value: CodeType; label: string }[] = [
  { value: "percent", label: "Percent off (%)" },
  { value: "fixed", label: "Fixed amount off (₱)" },
  { value: "flat", label: "Flat order price (₱)" },
  { value: "free_shipping", label: "Free shipping" },
];

const STATUS_LABEL: Record<CodeStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
  exhausted: "Used up",
};

const STATUS_CLS: Record<CodeStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  disabled: "bg-muted text-muted-foreground",
  expired: "bg-red-500/15 text-red-600 dark:text-red-400",
  exhausted: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Used up" },
];

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const formatPhp = (n: number) => phpFormatter.format(Math.max(0, n));

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
};

const formatDateShort = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
};

// Convert "2026-05-15T13:35:55.215Z" (or similar) to the value an
// <input type="datetime-local"> expects: "YYYY-MM-DDTHH:mm" in local
// time. Returns empty string when the input is unparsable so the field
// goes blank instead of showing "Invalid Date".
const toDateTimeLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

const fromDateTimeLocal = (value: string) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const formatDiscountSummary = (p: CodeItem): string => {
  if (p.type === "percent") return `${p.value}% off`;
  if (p.type === "flat") return `Flat ${formatPhp(p.value)}`;
  if (p.type === "fixed") return `${formatPhp(p.value)} off`;
  return "Free shipping";
};

async function api<T>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, {
    method: init?.method || (init?.json !== undefined ? "POST" : "GET"),
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message =
      (data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

interface FormState {
  code: string;
  type: CodeType;
  value: string;
  freeShipping: boolean;
  minSpend: string;
  usageLimit: string;
  maxRedemptionsPerCustomer: string;
  expiresAt: string;
  enabled: boolean;
  description: string;
}

const emptyForm = (): FormState => ({
  code: "",
  type: "percent",
  value: "",
  freeShipping: false,
  minSpend: "",
  usageLimit: "",
  maxRedemptionsPerCustomer: "",
  expiresAt: "",
  enabled: true,
  description: "",
});

const formFromCode = (p: CodeItem): FormState => ({
  code: p.code,
  type: p.type,
  value: p.type === "free_shipping" ? "" : String(p.value),
  freeShipping: p.freeShipping,
  minSpend: p.minSpend ? String(p.minSpend) : "",
  usageLimit: p.usageLimit ? String(p.usageLimit) : "",
  maxRedemptionsPerCustomer: p.maxRedemptionsPerCustomer
    ? String(p.maxRedemptionsPerCustomer)
    : "",
  expiresAt: toDateTimeLocal(p.expiresAt),
  enabled: p.enabled,
  description: p.description,
});

export const DiscountCodesSection = () => {
  const [items, setItems] = useState<CodeItem[]>([]);
  const [summary, setSummary] = useState<ListSummary | null>(null);
  const [d1Available, setD1Available] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Editor state — controlled separately from the list to keep
  // typing snappy on a long list of codes.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorBusy, setEditorBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await api<ListResponse>("/api/admin/discount-codes");
      setItems(data.items);
      setSummary(data.summary);
      setD1Available(data.d1Available);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load codes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return items.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (q && !p.code.includes(q) && !p.description.toUpperCase().includes(q))
        return false;
      return true;
    });
  }, [items, filter, search]);

  const openCreate = useCallback(() => {
    setEditorMode("create");
    setForm(emptyForm());
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((p: CodeItem) => {
    setEditorMode("edit");
    setForm(formFromCode(p));
    setEditorOpen(true);
  }, []);

  const openDetail = useCallback(async (code: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await api<DetailResponse>(
        `/api/admin/discount-codes?action=get&code=${encodeURIComponent(code)}`,
      );
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load code");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) {
      toast.error("Code is required");
      return;
    }
    const value =
      form.type === "free_shipping" ? 0 : Math.floor(Number(form.value) || 0);
    if (form.type !== "free_shipping" && value <= 0) {
      toast.error("Discount value must be greater than zero");
      return;
    }
    if (form.type === "percent" && value > 100) {
      toast.error("Percent discount cannot exceed 100");
      return;
    }
    setEditorBusy(true);
    try {
      await api<{ promo: CodeItem; created: boolean }>(
        "/api/admin/discount-codes?action=save",
        {
          json: {
            promo: {
              code,
              type: form.type,
              value,
              freeShipping:
                form.type === "free_shipping" ? true : form.freeShipping,
              minSpend: Math.floor(Number(form.minSpend) || 0),
              usageLimit: form.usageLimit
                ? Math.floor(Number(form.usageLimit))
                : null,
              maxRedemptionsPerCustomer: Math.floor(
                Number(form.maxRedemptionsPerCustomer) || 0,
              ),
              expiresAt: fromDateTimeLocal(form.expiresAt),
              enabled: form.enabled,
              description: form.description,
            },
          },
        },
      );
      toast.success(`Code ${code} saved`);
      setEditorOpen(false);
      await loadList(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditorBusy(false);
    }
  }, [form, loadList]);

  const handleToggle = useCallback(
    async (p: CodeItem) => {
      try {
        await api<{ code: string; enabled: boolean }>(
          "/api/admin/discount-codes?action=toggle",
          { json: { code: p.code } },
        );
        toast.success(`Code ${p.code} ${p.enabled ? "disabled" : "enabled"}`);
        await loadList(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Toggle failed");
      }
    },
    [loadList],
  );

  const handleDelete = useCallback(
    async (code: string) => {
      try {
        await api<{ code: string }>("/api/admin/discount-codes?action=delete", {
          json: { code },
        });
        toast.success(`Code ${code} deleted`);
        setConfirmDelete(null);
        if (detail?.promo.code === code) setDetail(null);
        await loadList(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [detail, loadList],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl">Discount codes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Create, edit, and disable discount codes. Codes apply at checkout
            and feed the announcement bar and welcome modal. Per-code redemption
            stats come straight from the D1 ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadList()}
            disabled={refreshing}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            New code
          </Button>
        </div>
      </header>

      {!d1Available && (
        <div className="flex items-start gap-2 text-sm rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-medium">D1 not bound — analytics unavailable</p>
            <p className="text-muted-foreground mt-0.5">
              Per-code redemption counts and revenue figures need the D1
              binding. Codes still work; the panel just falls back to the
              KV-tracked global usage counter.
            </p>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard
            label="Codes"
            value={String(summary.total)}
            hint={`${summary.active} active`}
            icon={<Tag className="w-4 h-4" />}
          />
          <SummaryCard
            label="Redemptions"
            value={summary.totalRedemptions.toLocaleString("en-PH")}
            hint="lifetime"
            icon={<Percent className="w-4 h-4" />}
          />
          <SummaryCard
            label="Discount given"
            value={formatPhp(summary.totalDiscountGiven)}
            hint="lifetime"
            icon={<Users className="w-4 h-4" />}
          />
          <SummaryCard
            label="Gross revenue"
            value={formatPhp(summary.totalGrossRevenue)}
            hint="orders with a code"
            icon={<TrendingUp className="w-4 h-4" />}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or description"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-1">
            {FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={filter === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <section className="bg-card/40 border border-border/60 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading codes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "No discount codes yet. Click \u201CNew code\u201D to create one."
              : "No codes match the current filters."}
          </div>
        ) : (
          <ScrollableTable bordered={false}>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/40 text-left">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Discount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Uses</th>
                  <th className="px-3 py-2 font-medium">Discount given</th>
                  <th className="px-3 py-2 font-medium">Revenue</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.code}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-mono text-sm font-semibold hover:underline"
                        onClick={() => void openDetail(p.code)}
                      >
                        {p.code}
                      </button>
                      {p.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {p.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {formatDiscountSummary(p)}
                      {p.minSpend > 0 && (
                        <span className="text-[11px] text-muted-foreground block">
                          min {formatPhp(p.minSpend)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CLS[p.status]}`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm tabular-nums">
                      {p.effectiveUses.toLocaleString("en-PH")}
                      {p.usageLimit ? (
                        <span className="text-[11px] text-muted-foreground">
                          {" / "}
                          {p.usageLimit.toLocaleString("en-PH")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-sm tabular-nums">
                      {p.stats ? formatPhp(p.stats.totalDiscount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm tabular-nums">
                      {p.stats ? formatPhp(p.stats.grossRevenue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">
                      {formatDateShort(p.expiresAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(p)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleToggle(p)}
                        >
                          {p.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDelete(p.code)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editorMode === "create" ? "New discount code" : "Edit code"}
            </DialogTitle>
            <DialogDescription>
              Customers redeem this at checkout. Disable a code to hide it from
              the announcement bar without losing its analytics.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dc-code">Code</Label>
              <Input
                id="dc-code"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase().slice(0, 30),
                  }))
                }
                placeholder="SUMMER15"
                disabled={editorMode === "edit"}
              />
              {editorMode === "edit" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Renaming a code would orphan its redemption history. Create a
                  new code instead.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="dc-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type: v as CodeType }))
                }
              >
                <SelectTrigger id="dc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.type !== "free_shipping" && (
              <div>
                <Label htmlFor="dc-value">
                  {form.type === "percent"
                    ? "Percent (1–100)"
                    : form.type === "flat"
                      ? "Flat order price (₱)"
                      : "Amount (₱)"}
                </Label>
                <Input
                  id="dc-value"
                  type="number"
                  min={form.type === "flat" ? 0 : 1}
                  max={form.type === "percent" ? 100 : undefined}
                  value={form.value}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, value: e.target.value }))
                  }
                />
              </div>
            )}
            <div>
              <Label htmlFor="dc-min">Minimum spend (₱)</Label>
              <Input
                id="dc-min"
                type="number"
                min={0}
                value={form.minSpend}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minSpend: e.target.value }))
                }
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="dc-limit">Total usage limit</Label>
              <Input
                id="dc-limit"
                type="number"
                min={0}
                value={form.usageLimit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, usageLimit: e.target.value }))
                }
                placeholder="Leave empty for unlimited"
              />
            </div>
            <div>
              <Label htmlFor="dc-per-customer">Max uses per customer</Label>
              <Input
                id="dc-per-customer"
                type="number"
                min={0}
                value={form.maxRedemptionsPerCustomer}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxRedemptionsPerCustomer: e.target.value,
                  }))
                }
                placeholder="0 = unlimited"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="dc-expires">Expires</Label>
              <Input
                id="dc-expires"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expiresAt: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="dc-desc">Description</Label>
              <Textarea
                id="dc-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    description: e.target.value.slice(0, 200),
                  }))
                }
                placeholder="Internal note — shown to customers in the announcement bar."
                rows={2}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              {form.type !== "free_shipping" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.freeShipping}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        freeShipping: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  Also grant free shipping
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, enabled: e.target.checked }))
                  }
                  className="h-4 w-4"
                />
                Enabled
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={editorBusy}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={editorBusy}>
              {editorBusy ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {editorMode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detail) || detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setDetailLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.promo.code || "Loading…"}</DialogTitle>
            <DialogDescription>
              Per-code redemption history and headline figures.
            </DialogDescription>
          </DialogHeader>
          {detailLoading && !detail ? (
            <div className="p-6 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard
                  label="Uses"
                  value={(
                    detail.promo.stats?.uses ?? detail.promo.usageCount
                  ).toLocaleString("en-PH")}
                />
                <StatCard
                  label="Unique customers"
                  value={(
                    detail.promo.stats?.uniqueCustomers ?? 0
                  ).toLocaleString("en-PH")}
                />
                <StatCard
                  label="Discount given"
                  value={formatPhp(detail.promo.stats?.totalDiscount ?? 0)}
                />
                <StatCard
                  label="Gross revenue"
                  value={formatPhp(detail.promo.stats?.grossRevenue ?? 0)}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Last redeemed:{" "}
                {formatDate(detail.promo.stats?.lastRedeemedAt || null)}
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Recent redemptions</h3>
                {detail.recentRedemptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {detail.d1Available
                      ? "No orders have used this code yet."
                      : "D1 isn't bound — recent redemption list is empty."}
                  </p>
                ) : (
                  <ScrollableTable bordered={false}>
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr className="border-b border-border/40 text-left">
                          <th className="px-3 py-1.5 font-medium">When</th>
                          <th className="px-3 py-1.5 font-medium">Order</th>
                          <th className="px-3 py-1.5 font-medium">Customer</th>
                          <th className="px-3 py-1.5 font-medium">Discount</th>
                          <th className="px-3 py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.recentRedemptions.map((r) => (
                          <tr
                            key={`${r.orderId}-${r.redeemedAt}`}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">
                              {formatDate(r.redeemedAt)}
                            </td>
                            <td className="px-3 py-1.5 text-xs font-mono">
                              {r.orderId.slice(0, 10)}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {r.customerEmail || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-xs tabular-nums">
                              {formatPhp(r.discount)}
                            </td>
                            <td className="px-3 py-1.5 text-xs tabular-nums">
                              {formatPhp(r.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollableTable>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDetail(null);
                setDetailLoading(false);
              }}
            >
              Close
            </Button>
            {detail && (
              <Button onClick={() => openEdit(detail.promo)}>Edit code</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this code?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers who try to redeem <strong>{confirmDelete}</strong> will
              see an "Unknown code" error. Existing orders that already used
              this code are unaffected. The D1 redemption history is kept so
              your revenue reports stay accurate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <XCircle className="w-4 h-4 mr-2" />
              Keep discount code
            </AlertDialogCancel>
            <AlertDialogAction
              variant="dangerSoft"
              onClick={() =>
                confirmDelete ? void handleDelete(confirmDelete) : undefined
              }
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete discount code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}

const SummaryCard = ({ label, value, hint, icon }: SummaryCardProps) => (
  <div className="rounded-lg border border-border/60 bg-card/40 p-3">
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground/80">{icon}</span>
    </div>
    <p className="font-display text-xl mt-1">{value}</p>
    <p className="text-[10px] text-muted-foreground">{hint}</p>
  </div>
);

interface StatCardProps {
  label: string;
  value: string;
}

const StatCard = ({ label, value }: StatCardProps) => (
  <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
      {label}
    </p>
    <p className="font-display text-base mt-0.5 tabular-nums">{value}</p>
  </div>
);

export default DiscountCodesSection;
