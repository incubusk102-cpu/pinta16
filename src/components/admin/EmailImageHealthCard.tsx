// Email image health card — shown inside the Order email and Welcome
// email admin sections. Lets the operator one-click probe every image
// the email renderer will reference and surfaces any that a real email
// client (Gmail / iCloud / Outlook image proxies) cannot fetch.
//
// Why this exists: Cloudflare Bot Fight Mode and aggressive WAF rules
// can intermittently 403 the image-proxy fetches that email clients
// perform when the recipient opens an email, leaving the recipient
// looking at broken-image icons instead of the brand logo, banner,
// and product images. The endpoint at /api/admin/email-image-health
// fakes a Gmail-image-proxy User-Agent and reports OK / blocked per
// asset so the admin knows whether to (a) toggle Bot Fight Mode off,
// (b) add a WAF Skip rule for the image paths, or (c) re-upload a
// smaller image.
//
// The card is intentionally read-only — it never mutates KV and never
// sends a real email — so it's safe to mount in any admin surface and
// safe to spam-click during debugging.

import { useCallback, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type HealthItem = {
  id: string;
  label: string;
  kind: "inline" | "remote";
  url: string;
  ok: boolean;
  note: string;
  status?: number;
  contentType?: string;
  elapsedMs?: number;
};

type HealthSummary = {
  ok: number;
  broken: number;
  inline: number;
  total: number;
};

type HealthResponse = {
  ok: true;
  origin: string;
  summary: HealthSummary;
  items: HealthItem[];
  probedAt: string;
};

const STATUS_CHIP: Record<HealthItem["kind"] | "broken", string> = {
  inline:
    "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  remote:
    "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  broken:
    "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
};

const formatChip = (item: HealthItem): { label: string; cls: string } => {
  if (!item.ok) return { label: "Blocked", cls: STATUS_CHIP.broken };
  if (item.kind === "inline")
    return { label: "Inlined", cls: STATUS_CHIP.inline };
  const ms = typeof item.elapsedMs === "number" ? `${item.elapsedMs} ms` : "OK";
  return { label: ms, cls: STATUS_CHIP.remote };
};

export const EmailImageHealthCard = () => {
  const [report, setReport] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-image-health", {
        method: "GET",
        credentials: "same-origin",
      });
      const json = (await res.json()) as HealthResponse | { error?: string };
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ||
          `Email image health check failed (HTTP ${res.status}).`;
        setError(msg);
        setReport(null);
        return;
      }
      setReport(json as HealthResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Email image health check failed: ${msg}`);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const broken = report?.summary.broken ?? 0;
  const overallHealthy = report ? broken === 0 : null;

  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-base font-display flex items-center gap-2">
            {overallHealthy === false ? (
              <ShieldAlert className="w-4 h-4 text-rose-600" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            )}
            Email image health
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Probes every image that the order / welcome email renderer will
            reference, using a Gmail-style User-Agent. If any entry shows{" "}
            <strong>Blocked</strong>, recipients will see a broken-image icon —
            usually because Cloudflare Bot Fight Mode is challenging the image
            proxy. Inlined assets cannot be blocked by the edge.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runCheck}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          Run check
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200 dark:border-rose-900"
        >
          {error}
        </div>
      ) : null}

      {report ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">
                {report.summary.total}
              </strong>{" "}
              total
            </span>
            <span className="text-emerald-700 dark:text-emerald-300">
              {report.summary.inline} inlined
            </span>
            <span className="text-sky-700 dark:text-sky-300">
              {report.summary.ok} reachable
            </span>
            <span
              className={
                report.summary.broken > 0
                  ? "text-rose-700 dark:text-rose-300"
                  : ""
              }
            >
              {report.summary.broken} blocked
            </span>
            <span>
              probed at{" "}
              {new Date(report.probedAt).toLocaleTimeString("en-PH", {
                timeZone: "Asia/Manila",
              })}{" "}
              PHT
            </span>
          </div>
          <ul className="divide-y rounded-lg border bg-background">
            {report.items.map((item) => {
              const chip = formatChip(item);
              return (
                <li
                  key={item.id}
                  className="px-3 py-2 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {item.label}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.note}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${chip.cls}`}
                  >
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ul>
          {report.summary.broken > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900 space-y-1">
              <p className="font-medium">How to unblock:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>
                  Cloudflare dashboard → Security → Bots → set{" "}
                  <strong>Bot Fight Mode</strong> to <em>Off</em> or use Super
                  Bot Fight Mode with <em>Verified Bots = Allow</em>.
                </li>
                <li>
                  Or add a WAF Skip rule for the path
                  <code className="mx-1">/api/welcome-asset/*</code>.
                </li>
                <li>
                  Re-run this check; the row should flip to <em>OK</em>.
                </li>
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default EmailImageHealthCard;
