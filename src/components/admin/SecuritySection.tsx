import { useEffect, useMemo, useState } from "react";
import { ThreatDashboard } from "./ThreatDashboard";
import { Admin2FASection } from "./Admin2FASection";
import { AdminPasskeysSection } from "./AdminPasskeysSection";
import {
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Unlock,
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
import { Slider } from "@/components/ui/slider";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface AuditEvent {
  at: string;
  type: string;
  outcome: string;
  ip?: string;
  browser?: string;
  os?: string;
  device?: string;
  userAgent?: string;
  subject?: string;
  detail?: string;
}

// Backend response when ?type= / ?subject= / ?outcome= / ?before= are
// supplied to /api/admin-auth?action=audit. Used by the "PII access"
// panel and the per-customer access-history filter.
interface PiiAuditResponse {
  events: AuditEvent[];
  hasMore: boolean;
}

interface RateLimit {
  windowMs: number;
  max: number;
}

interface SecurityConfig {
  rateLimits: Record<string, RateLimit>;
  turnstileMode: "off" | "soft" | "hard";
  maxBodyBytes: number;
  ipBlockList: string[];
  adminCountryAllowlist: string[];
  loginAlertEnabled: boolean;
  loginAlertEmail: string;
  updatedAt: string | null;
}

interface SecurityConfigResponse {
  config: SecurityConfig;
  defaults: SecurityConfig;
  buckets: string[];
  turnstileModes: Array<"off" | "soft" | "hard">;
  bodyBytesMin: number;
  bodyBytesMax: number;
  bound: boolean;
  turnstileConfigured: boolean;
}

const formatMs = (ms: number) => {
  if (ms % 60_000 === 0) {
    const m = ms / 60_000;
    return m === 1 ? "1 minute" : `${m} minutes`;
  }
  if (ms % 1_000 === 0) {
    const s = ms / 1_000;
    return s === 1 ? "1 second" : `${s} seconds`;
  }
  return `${ms}ms`;
};

const bytesToMb = (b: number) => Math.round((b / (1024 * 1024)) * 10) / 10;
const mbToBytes = (mb: number) => Math.round(mb * 1024 * 1024);

const TURNSTILE_LABELS: Record<"off" | "soft" | "hard", string> = {
  off: "Off — bypass verification entirely",
  soft: "Soft — verify and log failures, never block",
  hard: "Hard — block requests that fail verification",
};

const fetchJson = async <T,>(
  input: string,
  init: RequestInit & { token: string },
): Promise<T> => {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const res = await fetch(input, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
};

interface SummaryCardProps {
  label: string;
  value: number;
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

export function SecuritySection() {
  // Audit log state (kept identical to the previous inline implementation
  // so existing audit-log entries render unchanged).
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [filter, setFilter] = useState<string>("");

  // PII access panel state. Lives alongside the general audit log but
  // queries the backend with type="pii." so the panel only ever sees
  // PII-touching admin actions (customer / order / user / newsletter /
  // abandoned-cart / export-backup reads & writes).
  const [piiEvents, setPiiEvents] = useState<AuditEvent[] | null>(null);
  const [piiHasMore, setPiiHasMore] = useState(false);
  const [loadingPii, setLoadingPii] = useState(false);
  const [piiSubject, setPiiSubject] = useState<string>("");

  // Live-tunable security config state. `serverConfig` is the last value the
  // backend confirmed; `draft` is the value the admin is currently editing.
  // The Save buttons are disabled when the draft equals the server value to
  // discourage redundant writes.
  const [serverConfig, setServerConfig] = useState<SecurityConfig | null>(null);
  const [meta, setMeta] = useState<Omit<
    SecurityConfigResponse,
    "config"
  > | null>(null);
  const [draft, setDraft] = useState<SecurityConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingTurnstile, setSavingTurnstile] = useState(false);
  const [savingBodyCap, setSavingBodyCap] = useState(false);
  const [savingIpList, setSavingIpList] = useState(false);
  const [savingRateLimits, setSavingRateLimits] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [ipText, setIpText] = useState<string>("");
  const [countryText, setCountryText] = useState<string>("");
  const [savingCountries, setSavingCountries] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);

  const refreshAudit = async () => {
    setLoadingAudit(true);
    try {
      const token = getAdminToken() ?? "";
      const data = await fetchJson<{ events: AuditEvent[] }>(
        "/api/admin-auth?action=audit&limit=300",
        { token },
      );
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not load audit log",
      );
    } finally {
      setLoadingAudit(false);
    }
  };

  // Pull the most-recent 200 PII access entries (or up to 200 entries
  // whose subject matches the filter) from the audit log. We pass
  // type="pii." to the paginated endpoint so it returns only the
  // structured `pii.<resource>.<action>` rows the recordPiiAccess()
  // helper writes — unrelated audit events stay in the panel below.
  const refreshPiiEvents = async (subject = piiSubject) => {
    setLoadingPii(true);
    try {
      const token = getAdminToken() ?? "";
      const params = new URLSearchParams({
        action: "audit",
        type: "pii.",
        limit: "200",
      });
      const trimmed = subject.trim();
      if (trimmed) params.set("subject", trimmed);
      const data = await fetchJson<PiiAuditResponse>(
        `/api/admin-auth?${params.toString()}`,
        { token },
      );
      setPiiEvents(Array.isArray(data.events) ? data.events : []);
      setPiiHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not load PII access events",
      );
    } finally {
      setLoadingPii(false);
    }
  };

  const refreshConfig = async () => {
    setLoadingConfig(true);
    try {
      const token = getAdminToken() ?? "";
      const data = await fetchJson<SecurityConfigResponse>(
        "/api/security-config",
        { token },
      );
      setServerConfig(data.config);
      setDraft(data.config);
      setIpText(data.config.ipBlockList.join("\n"));
      setCountryText((data.config.adminCountryAllowlist ?? []).join(", "));
      const { config: _config, ...rest } = data;
      void _config;
      setMeta(rest);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not load security config",
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    void refreshAudit();
    void refreshConfig();
    void refreshPiiEvents("");
    // refreshPiiEvents is intentionally omitted from deps — we only
    // want the initial load here. Subsequent refreshes happen via the
    // refresh button and the subject filter form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEvents = (events ?? []).filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      e.type.toLowerCase().includes(q) ||
      e.outcome.toLowerCase().includes(q) ||
      (e.ip || "").toLowerCase().includes(q) ||
      (e.subject || "").toLowerCase().includes(q) ||
      (e.detail || "").toLowerCase().includes(q) ||
      (e.browser || "").toLowerCase().includes(q) ||
      (e.os || "").toLowerCase().includes(q)
    );
  });

  const failedLogins = (events ?? []).filter(
    (e) =>
      (e.type === "admin.login" || e.type === "user.login") &&
      e.outcome === "failure",
  );

  const buckets = meta?.buckets ?? [];
  const turnstileModes = meta?.turnstileModes ?? ["off", "soft", "hard"];
  const bodyBytesMin = meta?.bodyBytesMin ?? 1024 * 1024;
  const bodyBytesMax = meta?.bodyBytesMax ?? 10 * 1024 * 1024;

  const saveSection = async (
    patch: Partial<SecurityConfig>,
    setBusy: (b: boolean) => void,
    successMessage: string,
  ) => {
    setBusy(true);
    try {
      const token = getAdminToken() ?? "";
      const data = await fetchJson<{ config: SecurityConfig }>(
        "/api/security-config",
        {
          token,
          method: "POST",
          body: JSON.stringify({ action: "save", config: patch }),
        },
      );
      setServerConfig(data.config);
      setDraft(data.config);
      setIpText(data.config.ipBlockList.join("\n"));
      setCountryText((data.config.adminCountryAllowlist ?? []).join(", "));
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const resetCounters = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Wipe every rate-limit counter? This unblocks every IP that's currently rate-limited (including any user who's been hammering the API). Continue?",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const token = getAdminToken() ?? "";
      const data = await fetchJson<{ deleted: number; skipped?: boolean }>(
        "/api/security-config",
        {
          token,
          method: "POST",
          body: JSON.stringify({ action: "reset-rate-limits" }),
        },
      );
      if (data.skipped) {
        toast.info("RATE_LIMITS binding missing; nothing to reset");
      } else {
        toast.success(`Cleared ${data.deleted} rate-limit counter(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const turnstileChanged =
    serverConfig && draft && serverConfig.turnstileMode !== draft.turnstileMode;
  const bodyCapChanged =
    serverConfig && draft && serverConfig.maxBodyBytes !== draft.maxBodyBytes;
  const ipListChangedRaw = useMemo(() => {
    if (!serverConfig) return false;
    const parsed = ipText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length !== serverConfig.ipBlockList.length) return true;
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i] !== serverConfig.ipBlockList[i]) return true;
    }
    return false;
  }, [ipText, serverConfig]);
  const parsedCountries = useMemo(
    () =>
      countryText
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{2}$/.test(s)),
    [countryText],
  );
  const countriesChanged = useMemo(() => {
    if (!serverConfig) return false;
    const cur = serverConfig.adminCountryAllowlist ?? [];
    if (cur.length !== parsedCountries.length) return true;
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] !== parsedCountries[i]) return true;
    }
    return false;
  }, [serverConfig, parsedCountries]);
  const alertChanged =
    serverConfig &&
    draft &&
    (serverConfig.loginAlertEnabled !== draft.loginAlertEnabled ||
      serverConfig.loginAlertEmail !== draft.loginAlertEmail);

  const rateLimitsChanged = useMemo(() => {
    if (!serverConfig || !draft) return false;
    const a = serverConfig.rateLimits;
    const b = draft.rateLimits;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (a[k]?.windowMs !== b[k]?.windowMs) return true;
      if (a[k]?.max !== b[k]?.max) return true;
    }
    return false;
  }, [serverConfig, draft]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl">Security</h1>
          <p className="text-xs text-muted-foreground">
            Monitor and fight back. Threat dashboard shows blocked attacks in
            real time. Tune rate limits, Turnstile mode, body-size cap, and IP
            block list below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              void refreshAudit();
              void refreshConfig();
            }}
            variant="outline"
            disabled={loadingAudit || loadingConfig}
          >
            {loadingAudit || loadingConfig ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Recorded events" value={events?.length ?? 0} />
        <SummaryCard
          label="Failed logins (recent)"
          value={failedLogins.length}
        />
        <SummaryCard
          label="Unique IPs"
          value={
            new Set(
              (events ?? [])
                .map((e) => e.ip)
                .filter((ip): ip is string => Boolean(ip)),
            ).size
          }
        />
      </div>

      <ThreatDashboard />

      {meta && !meta.bound && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          <strong>SECURITY_CONFIG KV namespace not bound.</strong> The panel
          shows current behavior but Save will fail. Create the namespace in
          Cloudflare dashboard (Workers &amp; Pages → KV → Create namespace),
          paste the id into <code>wrangler.toml</code>, then redeploy.
        </div>
      )}

      <AdminPasskeysSection />

      <Admin2FASection />

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            PII access ({piiEvents?.length ?? 0})
            {piiHasMore && (
              <span className="ml-1 text-amber-600">
                (newer entries truncated)
              </span>
            )}
          </span>
          <form
            className="flex items-center gap-2 ml-auto"
            onSubmit={(e) => {
              e.preventDefault();
              void refreshPiiEvents(piiSubject);
            }}
          >
            <Input
              placeholder="Filter by subject (email, order id…)"
              value={piiSubject}
              onChange={(e) => setPiiSubject(e.target.value)}
              className="w-72"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={loadingPii}
            >
              {loadingPii ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            {piiSubject && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPiiSubject("");
                  void refreshPiiEvents("");
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </div>
        {piiEvents === null ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : piiEvents.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {piiSubject
              ? `No PII access events match "${piiSubject}".`
              : "No PII access events recorded yet."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {piiEvents.map((e, idx) => (
              <li key={`pii-${e.at}-${idx}`} className="p-3 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-foreground">{e.type}</span>
                  <span className="text-muted-foreground">{e.outcome}</span>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(e.at).toLocaleString()}
                  </span>
                </div>
                {(e.subject || e.detail) && (
                  <p className="text-muted-foreground">
                    {e.subject && (
                      <button
                        type="button"
                        className="text-foreground/80 underline-offset-2 hover:underline"
                        onClick={() => {
                          setPiiSubject(e.subject || "");
                          void refreshPiiEvents(e.subject || "");
                        }}
                        title="View access history for this subject"
                      >
                        {e.subject}
                      </button>
                    )}
                    {e.subject && e.detail && " — "}
                    {e.detail}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {e.ip && <span className="font-mono">{e.ip}</span>}
                  {e.ip && (e.browser || e.os) && " · "}
                  {e.browser && e.os && (
                    <span>
                      {e.browser} on {e.os} ({e.device || "device"})
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Country allow-list (admin login)
          </span>
        </header>
        <div className="p-4 space-y-3 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Restrict admin login to specific countries. Two-letter ISO codes
            (e.g. <code>PH</code>, <code>US</code>), comma- or space-separated.
            Logins from outside the list are rejected with the same generic
            error as a wrong password and recorded as a{" "}
            <code>country-blocked</code> event. Leave empty to allow any
            country.
          </p>
          <p className="text-xs text-muted-foreground">
            Country comes from Cloudflare&apos;s <code>cf-ipcountry</code>{" "}
            header. If you travel, add the country before you leave or you will
            lock yourself out.
          </p>
          <div className="space-y-2">
            <Label htmlFor="country-allowlist" className="text-xs">
              Allowed countries
            </Label>
            <Input
              id="country-allowlist"
              value={countryText}
              onChange={(e) => setCountryText(e.target.value.toUpperCase())}
              placeholder="PH"
              className="font-mono"
            />
            <div className="text-xs text-muted-foreground">
              {parsedCountries.length === 0
                ? "All countries allowed (default)."
                : `${parsedCountries.length} countr${
                    parsedCountries.length === 1 ? "y" : "ies"
                  } allowed: ${parsedCountries.join(", ")}`}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection(
                  { adminCountryAllowlist: parsedCountries },
                  setSavingCountries,
                  parsedCountries.length === 0
                    ? "Country allow-list cleared"
                    : `Allow-list: ${parsedCountries.join(", ")}`,
                )
              }
              disabled={!countriesChanged || savingCountries}
            >
              {savingCountries ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save allow-list</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Login email alert
          </span>
        </header>
        <div className="p-4 space-y-3 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Send an email every time someone successfully logs into{" "}
            <code>/admin</code>. Acts as a tripwire: if you ever get an email
            about a login you didn&apos;t make, rotate the password immediately.
          </p>
          <div className="flex items-center gap-2">
            <input
              id="login-alert-enabled"
              type="checkbox"
              className="w-4 h-4 accent-current"
              checked={Boolean(draft?.loginAlertEnabled)}
              onChange={(e) =>
                setDraft((prev) =>
                  prev
                    ? { ...prev, loginAlertEnabled: e.target.checked }
                    : prev,
                )
              }
            />
            <Label htmlFor="login-alert-enabled" className="text-sm">
              Send an email on every successful admin login
            </Label>
          </div>
          <div>
            <Label htmlFor="login-alert-email" className="text-xs">
              Recipient (optional)
            </Label>
            <Input
              id="login-alert-email"
              type="email"
              value={draft?.loginAlertEmail ?? ""}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, loginAlertEmail: e.target.value } : prev,
                )
              }
              placeholder="you@example.com"
              disabled={!draft?.loginAlertEnabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Falls back to the <code>EMAIL_ADMIN_RECIPIENT</code> /{" "}
              <code>EMAIL_BCC</code> env vars if blank.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                draft &&
                saveSection(
                  {
                    loginAlertEnabled: draft.loginAlertEnabled,
                    loginAlertEmail: draft.loginAlertEmail,
                  },
                  setSavingAlert,
                  draft.loginAlertEnabled
                    ? "Login alerts on"
                    : "Login alerts off",
                )
              }
              disabled={!alertChanged || savingAlert}
              variant="success"
            >
              {savingAlert ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save login alerts</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Turnstile (CAPTCHA)
          </span>
        </header>
        <div className="p-4 space-y-3 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Cloudflare Turnstile gate on public-facing POSTs (newsletter,
            signup, login). Toggle to <strong>Soft</strong> while tuning to see
            real-world fail rates without locking real users out.
          </p>
          {meta && !meta.turnstileConfigured && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <strong>TURNSTILE_SECRET_KEY</strong> is not configured on this
              deploy. Verification is skipped regardless of the mode below until
              the secret is set.
            </p>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select
                value={draft?.turnstileMode ?? "hard"}
                onValueChange={(value) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          turnstileMode: value as "off" | "soft" | "hard",
                        }
                      : prev,
                  )
                }
                disabled={!draft || loadingConfig}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {turnstileModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {TURNSTILE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() =>
                draft &&
                saveSection(
                  { turnstileMode: draft.turnstileMode },
                  setSavingTurnstile,
                  `Turnstile mode set to ${draft.turnstileMode}`,
                )
              }
              disabled={!turnstileChanged || savingTurnstile}
              variant="success"
            >
              {savingTurnstile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save CAPTCHA mode</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Body-size cap
          </span>
        </header>
        <div className="p-4 space-y-4 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Maximum size of any single request body before the server returns
            413. Default 5 MB covers storefront-config saves with embedded hero
            images.
          </p>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <div className="flex justify-between items-baseline mb-2">
                <Label className="text-xs">Cap</Label>
                <span className="text-sm font-mono">
                  {draft ? `${bytesToMb(draft.maxBodyBytes)} MB` : "—"}
                </span>
              </div>
              <Slider
                value={[draft?.maxBodyBytes ?? bodyBytesMin]}
                onValueChange={(v) =>
                  setDraft((prev) =>
                    prev
                      ? { ...prev, maxBodyBytes: v[0] ?? prev.maxBodyBytes }
                      : prev,
                  )
                }
                min={bodyBytesMin}
                max={bodyBytesMax}
                step={mbToBytes(0.5)}
                disabled={!draft || loadingConfig}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{bytesToMb(bodyBytesMin)} MB</span>
                <span>{bytesToMb(bodyBytesMax)} MB</span>
              </div>
            </div>
            <Button
              onClick={() =>
                draft &&
                saveSection(
                  { maxBodyBytes: draft.maxBodyBytes },
                  setSavingBodyCap,
                  `Body cap set to ${bytesToMb(draft.maxBodyBytes)} MB`,
                )
              }
              disabled={!bodyCapChanged || savingBodyCap}
              variant="success"
            >
              {savingBodyCap ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save body cap</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            IP block list
          </span>
        </header>
        <div className="p-4 space-y-3 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            One IP per line (or whitespace / comma separated). Matched requests
            are short-circuited with 403 across every endpoint. Use sparingly —
            Cloudflare WAF rules in the dashboard are a better tool for
            sustained blocks at scale.
          </p>
          <Textarea
            value={ipText}
            onChange={(e) => setIpText(e.target.value)}
            rows={6}
            placeholder="203.0.113.42&#10;2001:db8::1"
            className="font-mono text-xs"
            disabled={loadingConfig}
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {serverConfig?.ipBlockList?.length ?? 0} IP(s) currently blocked
            </p>
            <Button
              onClick={() => {
                const parsed = ipText
                  .split(/[\s,]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                void saveSection(
                  { ipBlockList: parsed },
                  setSavingIpList,
                  `Saved ${parsed.length} IP(s)`,
                );
              }}
              disabled={!ipListChangedRaw || savingIpList}
              variant="success"
            >
              {savingIpList ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save list</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Per-endpoint rate limits
          </span>
          <Button
            onClick={() => void resetCounters()}
            variant="warning"
            size="sm"
            disabled={resetting}
          >
            {resetting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            <span className="ml-2">Unblock everyone</span>
          </Button>
        </header>
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Sliding-window limits enforced per-IP at the bucket level. Defaults
            match what the code shipped before this panel — tweak the values
            below to tighten or loosen, then click <em>Save</em>. Buckets ending
            in <code>:&lt;id&gt;</code> resolve to their family root (e.g.{" "}
            <code>user-change-password</code>).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="text-left p-2">Bucket</th>
                  <th className="text-left p-2">Window</th>
                  <th className="text-left p-2">Max requests</th>
                  <th className="text-left p-2">Default</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((bucket) => {
                  const current = draft?.rateLimits?.[bucket];
                  const def = meta?.defaults.rateLimits?.[bucket];
                  return (
                    <tr key={bucket} className="border-b border-border/30">
                      <td className="p-2 font-mono text-xs">{bucket}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={3600}
                            value={
                              current
                                ? Math.round(current.windowMs / 1000)
                                : def
                                  ? Math.round(def.windowMs / 1000)
                                  : 60
                            }
                            onChange={(e) => {
                              const seconds = Number(e.target.value);
                              if (!Number.isFinite(seconds)) return;
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      rateLimits: {
                                        ...prev.rateLimits,
                                        [bucket]: {
                                          windowMs: Math.max(1, seconds) * 1000,
                                          max:
                                            prev.rateLimits[bucket]?.max ??
                                            def?.max ??
                                            10,
                                        },
                                      },
                                    }
                                  : prev,
                              );
                            }}
                            className="w-24 text-right"
                          />
                          <span className="text-xs text-muted-foreground">
                            seconds
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={1}
                          max={10000}
                          value={current?.max ?? def?.max ?? 10}
                          onChange={(e) => {
                            const max = Number(e.target.value);
                            if (!Number.isFinite(max)) return;
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    rateLimits: {
                                      ...prev.rateLimits,
                                      [bucket]: {
                                        windowMs:
                                          prev.rateLimits[bucket]?.windowMs ??
                                          def?.windowMs ??
                                          60_000,
                                        max: Math.max(1, max),
                                      },
                                    },
                                  }
                                : prev,
                            );
                          }}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {def ? `${def.max} / ${formatMs(def.windowMs)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                draft &&
                saveSection(
                  { rateLimits: draft.rateLimits },
                  setSavingRateLimits,
                  "Rate limits saved",
                )
              }
              disabled={!rateLimitsChanged || savingRateLimits}
              variant="success"
            >
              {savingRateLimits ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save rate limits</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Audit log ({filteredEvents.length})
          </span>
          <Input
            placeholder="Filter (type / IP / email / browser…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto w-72"
          />
        </div>
        {events === null ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {events.length === 0
              ? "No audit events yet."
              : "No events match the filter."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {filteredEvents.map((e, idx) => (
              <li key={`${e.at}-${idx}`} className="p-3 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-foreground">{e.type}</span>
                  <span
                    className={
                      e.outcome === "failure"
                        ? "text-rose-500"
                        : e.outcome === "success"
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                    }
                  >
                    {e.outcome}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(e.at).toLocaleString()}
                  </span>
                </div>
                {(e.subject || e.detail) && (
                  <p className="text-muted-foreground">
                    {e.subject && (
                      <span className="text-foreground/80">{e.subject}</span>
                    )}
                    {e.subject && e.detail && " — "}
                    {e.detail}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {e.ip && <span className="font-mono">{e.ip}</span>}
                  {e.ip && (e.browser || e.os) && " · "}
                  {e.browser && e.os && (
                    <span>
                      {e.browser} on {e.os} ({e.device || "device"})
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
