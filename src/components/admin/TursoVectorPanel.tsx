import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, AlertCircle, Database, Zap } from "lucide-react";
import { Button } from "../ui/button";

/**
 * Admin tile for the Turso vector-search backend (the "More like this"
 * rail). Mirrors the layout of `D1AnalyticsPanel` so operators have a
 * consistent mental model: each storage backend has its own status card
 * with a green/amber connection tag and one-click setup buttons.
 *
 * State machine:
 *
 *   1. Turso env vars not set            → show setup instructions.
 *   2. Connected, schema not applied     → show "Apply schema" button.
 *   3. Schema applied, no embeddings yet → show "Generate embeddings".
 *   4. Schema applied, ≥1 embedding      → show counts + re-embed button.
 *
 * If the Workers AI binding is missing we surface that warning before
 * the user tries to generate embeddings (otherwise they'd get a 503
 * after waiting).
 */

interface TursoStatus {
  available: boolean;
  schemaApplied: boolean;
  workersAi: boolean;
  embeddingModel: string;
  embeddingDims: number;
  message?: string;
  counts?: { paintings_vec: number; embedded: number };
}

function getAdminToken(): string {
  try {
    const raw = localStorage.getItem("canvhub_admin_session_v1");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed?.token || "";
  } catch {
    return "";
  }
}

export function TursoVectorPanel() {
  const [status, setStatus] = useState<TursoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyingSchema, setApplyingSchema] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/turso?action=status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as TursoStatus;
        setStatus(data);
      }
    } catch {
      // Silently degrade — the Turso panel is optional.
    } finally {
      setLoading(false);
    }
  };

  const runApplySchema = async () => {
    setApplyingSchema(true);
    setResultMsg(null);
    setErrorMsg(null);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/turso?action=apply-schema", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json()) as {
        success?: boolean;
        statementsExecuted?: number;
        error?: string;
        detail?: string;
      };
      if (data.success) {
        setResultMsg(
          `Schema applied: ${data.statementsExecuted ?? 0} statement(s) executed.`,
        );
        void fetchStatus();
      } else {
        setErrorMsg(
          `Schema apply failed: ${data.error || "unknown error"}${
            data.detail ? ` — ${data.detail}` : ""
          }`,
        );
      }
    } catch (err) {
      setErrorMsg(
        `Schema apply error: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setApplyingSchema(false);
    }
  };

  const runEmbedAll = async () => {
    setEmbedding(true);
    setResultMsg(null);
    setErrorMsg(null);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/turso?action=embed-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json()) as {
        success?: boolean;
        total?: number;
        embedded?: number;
        failed?: number;
        error?: string;
      };
      if (data.success) {
        const total = data.total ?? 0;
        const embedded = data.embedded ?? 0;
        const failed = data.failed ?? 0;
        setResultMsg(
          `Embedded ${embedded} of ${total} product(s)${failed ? `, ${failed} failed` : ""}.`,
        );
        void fetchStatus();
      } else {
        setErrorMsg(`Embed failed: ${data.error || "unknown error"}`);
      }
    } catch (err) {
      setErrorMsg(
        `Embed error: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setEmbedding(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  // ── State 0: still loading ────────────────────────────────────────────────
  if (loading && !status) {
    return (
      <div className="border border-border/40 rounded-lg p-4 bg-card/40 flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading vector search status…</span>
      </div>
    );
  }

  if (!status) return null;

  // ── State 1: Turso env vars not set ───────────────────────────────────────
  if (!status.available) {
    return (
      <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-wider">
            Vector Search (Turso)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
            Not configured
          </span>
        </div>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p>
              Turso isn&apos;t connected yet. The &ldquo;More like this&rdquo;
              rail on the product page is currently using the rule-based
              fallback (category / medium / year scoring).
            </p>
            <p>
              To enable AI similarity:{" "}
              <a
                href="https://turso.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                sign up
              </a>{" "}
              → create database <code>canvhub</code> → generate auth token → add{" "}
              <code className="text-xs bg-muted px-1 rounded">
                TURSO_DATABASE_URL
              </code>{" "}
              and{" "}
              <code className="text-xs bg-muted px-1 rounded">
                TURSO_AUTH_TOKEN
              </code>{" "}
              to Cloudflare Pages → Settings → Environment variables. See the
              setup block in <code>wrangler.toml</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── State 2: connected, schema not applied ────────────────────────────────
  if (status.available && !status.schemaApplied) {
    return (
      <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-wider">
            Vector Search (Turso)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30">
            Connected — schema not applied
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Turso is reachable but the <code>paintings_vec</code> table
          doesn&apos;t exist yet. Click below to create it (idempotent, safe to
          re-run).
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => void runApplySchema()}
            disabled={applyingSchema}
            className="h-8 text-xs"
          >
            {applyingSchema ? "Applying schema…" : "Apply schema"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchStatus()}
            disabled={loading}
            className="h-8 text-xs"
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
        {resultMsg && (
          <div className="text-xs p-2 rounded bg-muted/50 text-muted-foreground">
            {resultMsg}
          </div>
        )}
        {errorMsg && (
          <div className="text-xs p-2 rounded bg-red-500/10 text-red-600 border border-red-500/20">
            {errorMsg}
          </div>
        )}
      </div>
    );
  }

  // ── State 3 & 4: schema applied ───────────────────────────────────────────
  const total = status.counts?.paintings_vec ?? 0;
  const embedded = status.counts?.embedded ?? 0;

  return (
    <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-wider">
            Vector Search (Turso)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
            Connected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchStatus()}
            disabled={loading}
            className="h-7 text-xs"
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runEmbedAll()}
            disabled={embedding || !status.workersAi}
            className="h-7 text-xs"
            title={
              !status.workersAi
                ? "Workers AI binding (env.AI) not configured. See wrangler.toml."
                : "Re-embed every product in PRODUCTS KV."
            }
          >
            {embedding
              ? "Embedding…"
              : embedded > 0
                ? "Re-embed all"
                : "Generate embeddings"}
          </Button>
        </div>
      </div>

      {!status.workersAi && (
        <div className="text-xs p-2 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-start gap-2">
          <Zap className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Workers AI binding (<code>env.AI</code>) not configured. Embeddings
            can&apos;t be generated until the binding is added in{" "}
            <code>wrangler.toml</code> (already in this PR&apos;s diff). Push to
            redeploy, then come back here.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="border border-border/30 rounded-md p-3 bg-background/50">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Database className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Rows</span>
          </div>
          <p className="text-lg font-display">{total}</p>
          <p className="text-[11px] text-muted-foreground">paintings_vec</p>
        </div>
        <div className="border border-border/30 rounded-md p-3 bg-background/50">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">
              Embedded
            </span>
          </div>
          <p className="text-lg font-display">{embedded}</p>
          <p className="text-[11px] text-muted-foreground">
            of {total} ({total > 0 ? Math.round((embedded / total) * 100) : 0}
            %)
          </p>
        </div>
        <div className="border border-border/30 rounded-md p-3 bg-background/50">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Model</span>
          </div>
          <p className="text-xs font-mono break-all">
            {status.embeddingModel.replace(/^@cf\//, "")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {status.embeddingDims}-dim
          </p>
        </div>
      </div>

      {embedded === 0 && total === 0 && status.workersAi && (
        <p className="text-xs text-muted-foreground">
          No products embedded yet. Click <strong>Generate embeddings</strong>{" "}
          to populate the index from <code>PRODUCTS</code> KV.
        </p>
      )}

      {resultMsg && (
        <div className="text-xs p-2 rounded bg-muted/50 text-muted-foreground">
          {resultMsg}
        </div>
      )}
      {errorMsg && (
        <div className="text-xs p-2 rounded bg-red-500/10 text-red-600 border border-red-500/20">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
