import { useState } from "react";
import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  token: string;
}

type Dataset = "orders" | "customers" | "newsletter";
type Format = "csv" | "json";

const csvEscape = (value: unknown): string => {
  if (value == null) return "";
  let s: string;
  if (typeof value === "string") {
    s = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    s = String(value);
  } else {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  }
  // Defang spreadsheet formula injection (=, +, -, @, tab, CR).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const toCsv = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return "";
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>()),
  );
  const header = cols.map(csvEscape).join(",");
  const body = rows
    .map((row) => cols.map((c) => csvEscape(row[c])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
};

const downloadBlob = (data: string, filename: string, type: string) => {
  const blob = new Blob([data], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const flattenOrder = (
  o: Record<string, unknown> & { items?: Array<Record<string, unknown>> },
) => ({
  id: o.id,
  createdAt: o.createdAt,
  status: o.status,
  total: o.total,
  customerName: o.customerName ?? "",
  customerEmail: o.customerEmail ?? "",
  customerPhone: o.customerPhone ?? "",
  itemCount: Array.isArray(o.items) ? o.items.length : 0,
  itemTitles: Array.isArray(o.items)
    ? o.items.map((i) => i.title).join(" | ")
    : "",
  paymentMethod: o.paymentMethod ?? "",
  paymentStatus: o.paymentStatus ?? "",
  shipmentCourier:
    (o.shipment as Record<string, unknown> | undefined)?.courier ?? "",
  shipmentTracking:
    (o.shipment as Record<string, unknown> | undefined)?.trackingNumber ?? "",
  refundStatus: (o.refund as Record<string, unknown> | undefined)?.status ?? "",
  refundAmount: (o.refund as Record<string, unknown> | undefined)?.amount ?? "",
  refundReason: (o.refund as Record<string, unknown> | undefined)?.reason ?? "",
  cancelledReason: o.cancelledReason ?? "",
});

const flattenCustomer = (
  u: Record<string, unknown> & {
    addresses?: Array<Record<string, unknown>>;
  },
) => ({
  id: u.id,
  email: u.email,
  name: u.name ?? "",
  provider: u.provider ?? "password",
  createdAt: u.createdAt,
  lastSeenAt: u.lastSeenAt,
  addressCount: Array.isArray(u.addresses) ? u.addresses.length : 0,
  defaultAddressId: u.defaultAddressId ?? "",
});

const flattenSubscriber = (s: Record<string, unknown>) => ({
  email: s.email,
  name: s.name ?? "",
  source: s.source ?? "",
  subscribedAt: s.subscribedAt,
  provider: s.provider ?? "",
  forwardError: s.forwardError ?? "",
  forwardSkipped: s.forwardSkipped ?? "",
});

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export default function ExportPanel({ token }: Props) {
  const [busy, setBusy] = useState<`${Dataset}:${Format}` | null>(null);

  const run = async (dataset: Dataset, format: Format) => {
    setBusy(`${dataset}:${format}`);
    try {
      let rows: Record<string, unknown>[] = [];
      let raw: unknown = null;

      if (dataset === "orders") {
        const res = await fetch("/api/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Orders fetch failed (${res.status})`);
        const data = await res.json();
        const list = (data.orders || []) as Record<string, unknown>[];
        raw = list;
        rows = list.map(flattenOrder);
      } else if (dataset === "customers") {
        const res = await fetch("/api/users?action=list", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Customers fetch failed (${res.status})`);
        const data = await res.json();
        const list = (data.users || []) as Record<string, unknown>[];
        raw = list;
        rows = list.map(flattenCustomer);
      } else {
        const res = await fetch("/api/newsletter", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Newsletter fetch failed (${res.status})`);
        }
        const data = await res.json();
        const list = (data.subscribers || []) as Record<string, unknown>[];
        raw = list;
        rows = list.map(flattenSubscriber);
      }

      if (rows.length === 0) {
        toast.info("Nothing to export");
        return;
      }

      const filename = `canvas-hub-${dataset}-${stamp()}.${format}`;
      if (format === "csv") {
        downloadBlob(toCsv(rows), filename, "text/csv");
      } else {
        downloadBlob(
          JSON.stringify(raw, null, 2),
          filename,
          "application/json",
        );
      }
      toast.success(`Exported ${rows.length} ${dataset}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const ExportButton = ({
    dataset,
    format,
    label,
    icon,
  }: {
    dataset: Dataset;
    format: Format;
    label: string;
    icon: React.ReactNode;
  }) => {
    const key = `${dataset}:${format}` as const;
    const isBusy = busy === key;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void run(dataset, format)}
        disabled={busy != null}
        className="justify-start"
      >
        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : icon}
        {label}
      </Button>
    );
  };

  return (
    <section className="border border-border/40 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display text-base">Exports</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Download the full set of orders, customers, or newsletter subscribers.
        CSV is spreadsheet-friendly (cells starting with{" "}
        <code className="font-mono">=</code> /{" "}
        <code className="font-mono">+</code> /{" "}
        <code className="font-mono">-</code> /{" "}
        <code className="font-mono">@</code> are escaped); JSON preserves the
        full record shape.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <ExportButton
          dataset="orders"
          format="csv"
          label="Orders · CSV"
          icon={<FileSpreadsheet className="w-3.5 h-3.5 mr-2" />}
        />
        <ExportButton
          dataset="orders"
          format="json"
          label="Orders · JSON"
          icon={<FileJson className="w-3.5 h-3.5 mr-2" />}
        />
        <ExportButton
          dataset="customers"
          format="csv"
          label="Customers · CSV"
          icon={<FileSpreadsheet className="w-3.5 h-3.5 mr-2" />}
        />
        <ExportButton
          dataset="customers"
          format="json"
          label="Customers · JSON"
          icon={<FileJson className="w-3.5 h-3.5 mr-2" />}
        />
        <ExportButton
          dataset="newsletter"
          format="csv"
          label="Newsletter · CSV"
          icon={<FileSpreadsheet className="w-3.5 h-3.5 mr-2" />}
        />
        <ExportButton
          dataset="newsletter"
          format="json"
          label="Newsletter · JSON"
          icon={<FileJson className="w-3.5 h-3.5 mr-2" />}
        />
      </div>
    </section>
  );
}
