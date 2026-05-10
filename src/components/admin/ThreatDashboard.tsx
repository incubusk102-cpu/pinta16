import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Skull,
  Unlock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface ThreatEvent {
  t: string;
  type: string;
  ip: string;
  path: string;
  detail: string;
  ua: string;
  cc?: string;
}

interface ThreatStats {
  total: number;
  byType: Record<string, number>;
  byIp: Record<string, number>;
  updatedAt: string | null;
}

interface AutobanConfig {
  enabled: boolean;
  threshold: number;
  windowMinutes: number;
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutWindowMinutes: number;
  updatedAt: string | null;
}

interface AccountLockout {
  subject: string;
  attempts: number;
  lockedUntil: string;
}

interface SecurityEventsResponse {
  stats: ThreatStats;
  events: ThreatEvent[];
  autoban: AutobanConfig;
  lockouts: AccountLockout[];
  bannedIps: string[];
  hours: number;
  bound: boolean;
}

const THREAT_LABELS: Record<string, { label: string; color: string }> = {
  scanner: { label: "Scanner probe", color: "text-red-500" },
  csrf: { label: "CSRF attempt", color: "text-orange-500" },
  "ip-blocked": { label: "Blocked IP", color: "text-rose-600" },
  "body-too-large": { label: "Oversize body", color: "text-amber-500" },
  "rate-limit": { label: "Rate limited", color: "text-yellow-500" },
  "path-traversal": { label: "Path traversal", color: "text-red-600" },
  "auth-failed": { label: "Login failure", color: "text-fuchsia-500" },
  "account-locked": { label: "Account locked", color: "text-purple-500" },
  "country-blocked": { label: "Country blocked", color: "text-blue-500" },
};

// Convert a 2-letter ISO country code into the matching emoji flag. Falls
// back to the raw code (or empty string) if conversion fails so we never
// throw inside a render path.
const countryFlag = (cc?: string): string => {
  if (!cc || cc.length !== 2) return "";
  const upper = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const base = 0x1f1e6;
  const codePoints = [...upper].map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
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

function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number | string;
  icon: typeof Shield;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${className || "text-muted-foreground"}`} />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="text-2xl font-semibold mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

const AUTO_REFRESH_MS = 30_000;

export function ThreatDashboard() {
  const [data, setData] = useState<SecurityEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pendingIp, setPendingIp] = useState<string | null>(null);
  const [pendingSubject, setPendingSubject] = useState<string | null>(null);

  // Auto-ban draft state
  const [autobanDraft, setAutobanDraft] = useState<AutobanConfig | null>(null);
  const [savingAutoban, setSavingAutoban] = useState(false);

  const refresh = useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const token = getAdminToken() ?? "";
      const result = await fetchJson<SecurityEventsResponse>(
        "/api/security-events?hours=24&limit=300",
        { token },
      );
      setData(result);
      setAutobanDraft((prev) => prev ?? result.autoban);
    } catch (err) {
      if (!silent) {
        toast.error(
          err instanceof Error ? err.message : "Could not load threat data",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Polling timer when auto-refresh is on. Uses a ref so we can keep the
  // latest `refresh` callback without resetting the interval on every
  // render.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void refreshRef.current({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const topAttackers = useMemo(() => {
    if (!data?.stats.byIp) return [];
    return Object.entries(data.stats.byIp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [data]);

  const typeBreakdown = useMemo(() => {
    if (!data?.stats.byType) return [];
    return Object.entries(data.stats.byType).sort((a, b) => b[1] - a[1]);
  }, [data]);

  // The country we last saw any given IP from. Used to render a small flag
  // beside the IP in stat lists which only have aggregate counts.
  const ipCountryMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!data?.events) return map;
    for (const e of data.events) {
      if (e.ip && e.cc && !map[e.ip]) map[e.ip] = e.cc;
    }
    return map;
  }, [data]);

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    let list = data.events;
    if (typeFilter !== "all") {
      list = list.filter((e) => e.type === typeFilter);
    }
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(
        (e) =>
          e.type.toLowerCase().includes(q) ||
          e.ip.toLowerCase().includes(q) ||
          e.path.toLowerCase().includes(q) ||
          e.detail.toLowerCase().includes(q) ||
          (e.cc || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, filter, typeFilter]);

  const hourlyTimeline = useMemo(() => {
    if (!data?.events) return [];
    const buckets: Record<string, number> = {};
    for (const e of data.events) {
      const hour = e.t.slice(0, 13);
      buckets[hour] = (buckets[hour] || 0) + 1;
    }
    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-24);
  }, [data]);

  const maxHourly = useMemo(
    () => Math.max(1, ...hourlyTimeline.map(([, v]) => v)),
    [hourlyTimeline],
  );

  const saveAutoban = async () => {
    if (!autobanDraft) return;
    setSavingAutoban(true);
    try {
      const token = getAdminToken() ?? "";
      const result = await fetchJson<{ autoban: AutobanConfig }>(
        "/api/security-events",
        {
          token,
          method: "POST",
          body: JSON.stringify({
            action: "save-autoban",
            config: autobanDraft,
          }),
        },
      );
      setAutobanDraft(result.autoban);
      if (data) {
        setData({ ...data, autoban: result.autoban });
      }
      toast.success("Active defense settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAutoban(false);
    }
  };

  const banIp = async (ip: string) => {
    if (!ip) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Ban ${ip}? They will be blocked from every endpoint.`)
    ) {
      return;
    }
    setPendingIp(ip);
    try {
      const token = getAdminToken() ?? "";
      const result = await fetchJson<{ bannedIps: string[] }>(
        "/api/security-events",
        {
          token,
          method: "POST",
          body: JSON.stringify({ action: "ban-ip", ip }),
        },
      );
      if (data) {
        setData({ ...data, bannedIps: result.bannedIps });
      }
      toast.success(`Banned ${ip}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ban failed");
    } finally {
      setPendingIp(null);
    }
  };

  const unbanIp = async (ip: string) => {
    if (!ip) return;
    setPendingIp(ip);
    try {
      const token = getAdminToken() ?? "";
      const result = await fetchJson<{ bannedIps: string[] }>(
        "/api/security-events",
        {
          token,
          method: "POST",
          body: JSON.stringify({ action: "unban-ip", ip }),
        },
      );
      if (data) {
        setData({ ...data, bannedIps: result.bannedIps });
      }
      toast.success(`Unbanned ${ip}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unban failed");
    } finally {
      setPendingIp(null);
    }
  };

  const unlockAccount = async (subject: string) => {
    if (!subject) return;
    setPendingSubject(subject);
    try {
      const token = getAdminToken() ?? "";
      await fetchJson<{ ok: boolean }>("/api/security-events", {
        token,
        method: "POST",
        body: JSON.stringify({ action: "unlock-account", subject }),
      });
      if (data) {
        setData({
          ...data,
          lockouts: data.lockouts.filter((l) => l.subject !== subject),
        });
      }
      toast.success(`Cleared lockout for ${subject}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setPendingSubject(null);
    }
  };

  const exportCsv = async () => {
    try {
      const token = getAdminToken() ?? "";
      const res = await fetch("/api/security-events?format=csv&hours=168", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `threat-events-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded threat events CSV");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  const resetEvents = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Wipe all security events? This clears threat history and stats. Continue?",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const token = getAdminToken() ?? "";
      const result = await fetchJson<{ deleted: number; skipped?: boolean }>(
        "/api/security-events",
        {
          token,
          method: "POST",
          body: JSON.stringify({ action: "reset" }),
        },
      );
      if (result.skipped) {
        toast.info("SECURITY_EVENTS binding missing; nothing to reset");
      } else {
        toast.success(`Cleared ${result.deleted} event key(s)`);
      }
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const autobanChanged = useMemo(() => {
    if (!data || !autobanDraft) return false;
    const s = data.autoban;
    return (
      s.enabled !== autobanDraft.enabled ||
      s.threshold !== autobanDraft.threshold ||
      s.windowMinutes !== autobanDraft.windowMinutes ||
      s.lockoutEnabled !== autobanDraft.lockoutEnabled ||
      s.lockoutThreshold !== autobanDraft.lockoutThreshold ||
      s.lockoutWindowMinutes !== autobanDraft.lockoutWindowMinutes
    );
  }, [data, autobanDraft]);

  const stats = data?.stats;
  const bannedIps = data?.bannedIps ?? [];
  const lockouts = data?.lockouts ?? [];
  const bannedSet = useMemo(() => new Set(bannedIps), [bannedIps]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-500" />
            Threat Dashboard
          </h2>
          <p className="text-xs text-muted-foreground">
            Real-time view of blocked attacks, top attacker IPs, and active
            defense controls. Events auto-expire after 7 days.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-2 py-1 rounded-md border border-border/60">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">
              Auto-refresh (30s)
            </Label>
          </div>
          <Button onClick={() => void exportCsv()} variant="outline" size="sm">
            <Download className="w-4 h-4" />
            <span className="ml-2">Export CSV</span>
          </Button>
          <Button
            onClick={resetEvents}
            variant="outline"
            size="sm"
            disabled={resetting || loading}
          >
            {resetting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span className="ml-2">Clear history</span>
          </Button>
          <Button
            onClick={() => void refresh()}
            variant="outline"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {data && !data.bound && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          <strong>SECURITY_EVENTS KV namespace not bound.</strong> Create the
          namespace in the Cloudflare dashboard (Workers &amp; Pages → KV →
          Create namespace), paste the id into <code>wrangler.toml</code>, then
          redeploy. Threat logging is inactive until bound.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total threats blocked"
          value={stats?.total ?? 0}
          icon={Shield}
          className="text-emerald-500"
        />
        <StatCard
          label="Unique attacker IPs"
          value={stats?.byIp ? Object.keys(stats.byIp).length : 0}
          icon={Ban}
          className="text-red-500"
        />
        <StatCard
          label="Attack types seen"
          value={stats?.byType ? Object.keys(stats.byType).length : 0}
          icon={AlertTriangle}
          className="text-amber-500"
        />
        <StatCard
          label="Events (last 24h)"
          value={data?.events.length ?? 0}
          icon={Zap}
          className="text-blue-500"
        />
      </div>

      {/* 24h Timeline */}
      {hourlyTimeline.length > 0 && (
        <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <header className="p-3 border-b border-border/60 bg-muted/20">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              24-hour attack timeline
            </span>
          </header>
          <div className="p-4">
            <div className="flex items-end gap-px h-24">
              {hourlyTimeline.map(([hour, count]) => (
                <div
                  key={hour}
                  className="flex-1 group relative"
                  title={`${hour}:00 — ${count} event(s)`}
                >
                  <div
                    className="w-full bg-red-500/70 rounded-t-sm transition-all group-hover:bg-red-500"
                    style={{
                      height: `${Math.max(2, (count / maxHourly) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {hourlyTimeline[0]?.[0]?.slice(11)}:00
              </span>
              <span className="text-[10px] text-muted-foreground">
                {hourlyTimeline[hourlyTimeline.length - 1]?.[0]?.slice(11)}:00
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Currently banned + Locked accounts side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-500" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Currently banned IPs ({bannedIps.length})
            </span>
          </header>
          <div className="p-4">
            {bannedIps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No IPs are currently banned.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {bannedIps.map((ip) => (
                  <li key={ip} className="flex items-center justify-between">
                    <span className="font-mono text-xs flex items-center gap-1.5">
                      {countryFlag(ipCountryMap[ip]) && (
                        <span title={ipCountryMap[ip]}>
                          {countryFlag(ipCountryMap[ip])}
                        </span>
                      )}
                      {ip}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={pendingIp === ip}
                      onClick={() => void unbanIp(ip)}
                    >
                      {pendingIp === ip ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5" />
                      )}
                      <span className="ml-1">Unban</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-500" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Locked accounts ({lockouts.length})
            </span>
          </header>
          <div className="p-4">
            {lockouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accounts are currently locked.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {lockouts.map((l) => (
                  <li
                    key={l.subject}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs truncate">
                        {l.subject === "__admin__" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] mr-1.5"
                          >
                            ADMIN
                          </Badge>
                        ) : null}
                        {l.subject === "__admin__" ? "" : l.subject}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {l.attempts} attempts · until{" "}
                        {new Date(l.lockedUntil).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={pendingSubject === l.subject}
                      onClick={() => void unlockAccount(l.subject)}
                    >
                      {pendingSubject === l.subject ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span className="ml-1">Unlock</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Attack type breakdown + Top attackers side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Attack types */}
        <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <header className="p-3 border-b border-border/60 bg-muted/20">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Attack types
            </span>
          </header>
          <div className="p-4 space-y-2">
            {typeBreakdown.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No threats recorded yet.
              </p>
            )}
            {typeBreakdown.map(([type, count]) => {
              const info = THREAT_LABELS[type] || {
                label: type,
                color: "text-muted-foreground",
              };
              const pct = stats?.total
                ? Math.round((count / stats.total) * 100)
                : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span
                    className={`text-xs font-mono w-32 truncate ${info.color}`}
                  >
                    {info.label}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                    {count.toLocaleString()} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top attacker IPs */}
        <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <header className="p-3 border-b border-border/60 bg-muted/20">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Top attacker IPs
            </span>
          </header>
          <div className="p-4">
            {topAttackers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No attacker IPs recorded yet.
              </p>
            )}
            <ul className="space-y-1.5">
              {topAttackers.map(([ip, count]) => {
                const isBanned = bannedSet.has(ip);
                return (
                  <li
                    key={ip}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="font-mono text-xs flex items-center gap-1.5 min-w-0 flex-1">
                      {countryFlag(ipCountryMap[ip]) && (
                        <span title={ipCountryMap[ip]}>
                          {countryFlag(ipCountryMap[ip])}
                        </span>
                      )}
                      <span className="truncate">{ip}</span>
                    </span>
                    <Badge variant="destructive" className="text-[10px]">
                      {count} event{count !== 1 ? "s" : ""}
                    </Badge>
                    {isBanned ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={pendingIp === ip}
                        onClick={() => void unbanIp(ip)}
                      >
                        {pendingIp === ip ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                        <span className="ml-1">Unban</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={pendingIp === ip}
                        onClick={() => void banIp(ip)}
                      >
                        {pendingIp === ip ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Ban className="w-3.5 h-3.5" />
                        )}
                        <span className="ml-1">Ban</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      {/* Active defense controls (auto-ban + lockout) */}
      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Active defense
          </span>
        </header>
        <div className="p-4 space-y-6 max-w-2xl">
          {/* Auto-ban */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-semibold">
                Auto-ban repeat offenders
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically add an IP to the block list when it triggers more
              than the threshold of any threat events inside the time window.
              Banned IPs appear in the Currently Banned IPs section above and
              can be removed manually.
            </p>
            <div className="flex items-center gap-3">
              <Switch
                checked={autobanDraft?.enabled ?? false}
                onCheckedChange={(checked) =>
                  setAutobanDraft((prev) =>
                    prev ? { ...prev, enabled: checked } : prev,
                  )
                }
                disabled={!autobanDraft}
              />
              <Label className="text-sm">
                {autobanDraft?.enabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Threshold (events before ban)</Label>
                <Input
                  type="number"
                  min={3}
                  max={1000}
                  value={autobanDraft?.threshold ?? 20}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setAutobanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              threshold: Math.max(3, Math.min(1000, v)),
                            }
                          : prev,
                      );
                    }
                  }}
                  className="w-full"
                  disabled={!autobanDraft}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Window (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={autobanDraft?.windowMinutes ?? 60}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setAutobanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              windowMinutes: Math.max(5, Math.min(1440, v)),
                            }
                          : prev,
                      );
                    }
                  }}
                  className="w-full"
                  disabled={!autobanDraft}
                />
              </div>
            </div>
          </div>

          {/* Account lockout */}
          <div className="space-y-3 border-t border-border/40 pt-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-semibold">
                Brute-force account lockout
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Lock an account after too many failed logins, regardless of source
              IP. Defends against credential stuffing across botnets. The error
              message is intentionally identical to a wrong password so
              attackers can&rsquo;t enumerate which emails exist.
            </p>
            <div className="flex items-center gap-3">
              <Switch
                checked={autobanDraft?.lockoutEnabled ?? true}
                onCheckedChange={(checked) =>
                  setAutobanDraft((prev) =>
                    prev ? { ...prev, lockoutEnabled: checked } : prev,
                  )
                }
                disabled={!autobanDraft}
              />
              <Label className="text-sm">
                {autobanDraft?.lockoutEnabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Failures before lockout</Label>
                <Input
                  type="number"
                  min={3}
                  max={50}
                  value={autobanDraft?.lockoutThreshold ?? 5}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setAutobanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              lockoutThreshold: Math.max(3, Math.min(50, v)),
                            }
                          : prev,
                      );
                    }
                  }}
                  className="w-full"
                  disabled={!autobanDraft}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lockout window (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={autobanDraft?.lockoutWindowMinutes ?? 15}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setAutobanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              lockoutWindowMinutes: Math.max(
                                1,
                                Math.min(1440, v),
                              ),
                            }
                          : prev,
                      );
                    }
                  }}
                  className="w-full"
                  disabled={!autobanDraft}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void saveAutoban()}
              disabled={!autobanChanged || savingAutoban}
            >
              {savingAutoban ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Save active defense settings</span>
            </Button>
          </div>
        </div>
      </section>

      {/* Recent threat events */}
      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent threats ({filteredEvents.length})
          </span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeBreakdown.map(([type]) => (
                  <SelectItem key={type} value={type}>
                    {THREAT_LABELS[type]?.label ?? type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter (IP / path / detail…)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        {data === null ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {(data?.events.length ?? 0) === 0
              ? "No threat events recorded yet. Attacks will appear here when blocked."
              : "No events match the filter."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40 text-xs max-h-96 overflow-y-auto">
            {filteredEvents.map((e, idx) => {
              const info = THREAT_LABELS[e.type] || {
                label: e.type,
                color: "text-muted-foreground",
              };
              const isBanned = e.ip ? bannedSet.has(e.ip) : false;
              return (
                <li key={`${e.t}-${idx}`} className="p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono font-semibold ${info.color}`}>
                      {info.label}
                    </span>
                    {e.cc && (
                      <span className="text-base leading-none" title={e.cc}>
                        {countryFlag(e.cc)}
                      </span>
                    )}
                    {e.ip && (
                      <span className="font-mono text-foreground/80">
                        {e.ip}
                      </span>
                    )}
                    {e.ip &&
                      (isBanned ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          disabled={pendingIp === e.ip}
                          onClick={() => void unbanIp(e.ip)}
                        >
                          {pendingIp === e.ip ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                          <span className="ml-1">Unban</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          disabled={pendingIp === e.ip}
                          onClick={() => void banIp(e.ip)}
                        >
                          {pendingIp === e.ip ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Ban className="w-3 h-3" />
                          )}
                          <span className="ml-1">Ban</span>
                        </Button>
                      ))}
                    <span className="text-muted-foreground ml-auto">
                      {new Date(e.t).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </span>
                  </div>
                  {e.path && (
                    <p className="text-muted-foreground font-mono truncate">
                      {e.path}
                    </p>
                  )}
                  {e.detail && (
                    <p className="text-muted-foreground">{e.detail}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
