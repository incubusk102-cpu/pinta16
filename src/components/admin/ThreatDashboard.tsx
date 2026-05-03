import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Skull,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface ThreatEvent {
  t: string;
  type: string;
  ip: string;
  path: string;
  detail: string;
  ua: string;
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
  updatedAt: string | null;
}

interface SecurityEventsResponse {
  stats: ThreatStats;
  events: ThreatEvent[];
  autoban: AutobanConfig;
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

export function ThreatDashboard() {
  const [data, setData] = useState<SecurityEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [resetting, setResetting] = useState(false);

  // Auto-ban draft state
  const [autobanDraft, setAutobanDraft] = useState<AutobanConfig | null>(null);
  const [savingAutoban, setSavingAutoban] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAdminToken() ?? "";
      const result = await fetchJson<SecurityEventsResponse>(
        "/api/security-events?hours=24&limit=300",
        { token },
      );
      setData(result);
      setAutobanDraft(result.autoban);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load threat data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    if (!filter) return data.events;
    const q = filter.toLowerCase();
    return data.events.filter(
      (e) =>
        e.type.toLowerCase().includes(q) ||
        e.ip.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q),
    );
  }, [data, filter]);

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
      toast.success(
        `Auto-ban ${result.autoban.enabled ? "enabled" : "disabled"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAutoban(false);
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
      s.windowMinutes !== autobanDraft.windowMinutes
    );
  }, [data, autobanDraft]);

  const stats = data?.stats;

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
        <div className="flex items-center gap-2">
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
              {topAttackers.map(([ip, count]) => (
                <li key={ip} className="flex items-center justify-between">
                  <span className="font-mono text-xs">{ip}</span>
                  <Badge variant="destructive" className="text-[10px]">
                    {count} event{count !== 1 ? "s" : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Auto-ban controls */}
      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
          <Ban className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Auto-ban (active defense)
          </span>
        </header>
        <div className="p-4 space-y-4 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Automatically add repeat offenders to the IP block list when they
            exceed the threat threshold within the configured time window.
            Banned IPs appear in the IP block list above and can be removed
            manually.
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
                        ? { ...prev, threshold: Math.max(3, Math.min(1000, v)) }
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
              <span className="ml-2">Save auto-ban settings</span>
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
          <Input
            placeholder="Filter (type / IP / path…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto w-72"
          />
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
              return (
                <li key={`${e.t}-${idx}`} className="p-3 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono font-semibold ${info.color}`}>
                      {info.label}
                    </span>
                    {e.ip && (
                      <span className="font-mono text-foreground/80">
                        {e.ip}
                      </span>
                    )}
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
