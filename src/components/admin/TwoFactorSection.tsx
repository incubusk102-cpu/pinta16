import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminToken, useAdminAuth } from "@/contexts/AdminAuthContext";

const API = "/api/admin-2fa";

interface SetupInitResponse {
  secret: string;
  otpauthUrl: string;
  issuer: string;
  account: string;
  recoveryCodes: string[];
  recoveryHashes: unknown[];
}

interface StatusResponse {
  enabled: boolean;
  recoveryCodesRemaining: number;
  updatedAt: string | null;
}

const fetchJson = async <T,>(
  input: string,
  init: RequestInit & { token?: string },
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

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Could not copy — select and copy manually");
  }
};

function RecoveryCodesPanel({
  codes,
  onAcknowledge,
}: {
  codes: string[];
  onAcknowledge: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const formatted = useMemo(() => codes.join("\n"), [codes]);

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">
            Save these recovery codes somewhere safe
          </p>
          <p className="text-xs text-muted-foreground">
            Each code works once. They&apos;re your only way back into the admin
            panel if you lose your authenticator app. We won&apos;t show them
            again.
          </p>
        </div>
      </div>
      <pre className="font-mono text-sm bg-background rounded p-3 whitespace-pre-wrap break-words">
        {formatted}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copyToClipboard(formatted)}
        >
          <Copy className="w-3 h-3 mr-1" /> Copy all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const blob = new Blob(
              [`Canvas Hub admin recovery codes\n\n${formatted}\n`],
              { type: "text/plain" },
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "canvhub-admin-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download .txt
        </Button>
        <label className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          I&apos;ve saved them
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!acknowledged}
        onClick={onAcknowledge}
      >
        Done
      </Button>
    </div>
  );
}

export function TwoFactorSection() {
  const { refreshAuthMeta } = useAdminAuth();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // setup state
  const [setup, setSetup] = useState<SetupInitResponse | null>(null);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [savedCodes, setSavedCodes] = useState<string[] | null>(null);

  // disable state
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableSubmitting, setDisableSubmitting] = useState(false);

  // regenerate state
  const [regenCode, setRegenCode] = useState("");
  const [regenSubmitting, setRegenSubmitting] = useState(false);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<StatusResponse>(API, { method: "GET" });
      setStatus(data);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not load 2FA status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Render the otpauth URL into a QR code data-URL whenever setup changes.
  useEffect(() => {
    if (!setup?.otpauthUrl) {
      setSetupQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setSetupQr(url);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setSetupQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setup?.otpauthUrl]);

  const beginSetup = async () => {
    const token = getAdminToken();
    if (!token) {
      toast.error("Sign in again before enabling 2FA");
      return;
    }
    setSetupSubmitting(true);
    try {
      const data = await fetchJson<SetupInitResponse>(API, {
        method: "POST",
        body: JSON.stringify({ action: "setup-init" }),
        token,
      });
      setSetup(data);
      setSetupCode("");
      setSavedCodes(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start 2FA setup",
      );
    } finally {
      setSetupSubmitting(false);
    }
  };

  const cancelSetup = () => {
    setSetup(null);
    setSetupCode("");
    setSavedCodes(null);
  };

  const verifySetup = async () => {
    if (!setup) return;
    if (setupCode.length !== 6) {
      toast.error("Enter the 6-digit code from your authenticator app");
      return;
    }
    const token = getAdminToken();
    if (!token) return;
    setSetupSubmitting(true);
    try {
      await fetchJson<{ enabled: boolean }>(API, {
        method: "POST",
        body: JSON.stringify({
          action: "setup-verify",
          secret: setup.secret,
          code: setupCode,
          recoveryHashes: setup.recoveryHashes,
        }),
        token,
      });
      toast.success("Two-factor authentication enabled");
      setSavedCodes(setup.recoveryCodes);
      setSetup(null);
      setSetupCode("");
      await refreshStatus();
      await refreshAuthMeta();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setSetupSubmitting(false);
    }
  };

  const disable = async () => {
    if (!disablePassword || disableCode.length !== 6) {
      toast.error("Enter your password and a 6-digit code");
      return;
    }
    const token = getAdminToken();
    if (!token) return;
    setDisableSubmitting(true);
    try {
      await fetchJson<{ enabled: boolean }>(API, {
        method: "POST",
        body: JSON.stringify({
          action: "disable",
          password: disablePassword,
          code: disableCode,
        }),
        token,
      });
      toast.success("Two-factor authentication disabled");
      setDisablePassword("");
      setDisableCode("");
      await refreshStatus();
      await refreshAuthMeta();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setDisableSubmitting(false);
    }
  };

  const regenerate = async () => {
    if (regenCode.length !== 6) {
      toast.error("Enter the 6-digit code from your authenticator app");
      return;
    }
    const token = getAdminToken();
    if (!token) return;
    setRegenSubmitting(true);
    try {
      const data = await fetchJson<{ recoveryCodes: string[] }>(API, {
        method: "POST",
        body: JSON.stringify({
          action: "regenerate-recovery",
          code: regenCode,
        }),
        token,
      });
      setRegenCodes(data.recoveryCodes);
      setRegenCode("");
      await refreshStatus();
      toast.success("New recovery codes issued");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not regenerate codes",
      );
    } finally {
      setRegenSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking 2FA status…
        </div>
      </section>
    );
  }

  // Setup wizard active
  if (setup) {
    return (
      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Set up two-factor auth</h2>
        </div>
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
          <li>
            Open Google Authenticator, 1Password, Authy, or any RFC 6238
            authenticator app.
          </li>
          <li>Scan the QR code or enter the secret manually.</li>
          <li>Type the 6-digit code below to confirm pairing.</li>
        </ol>
        <div className="grid sm:grid-cols-2 gap-4 items-start">
          <div className="bg-white rounded-lg p-3 inline-flex justify-center">
            {setupQr ? (
              <img src={setupQr} alt="2FA QR code" width={220} height={220} />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Or enter manually
            </Label>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs bg-background px-2 py-1 rounded break-all">
                {setup.secret}
              </code>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void copyToClipboard(setup.secret)}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Issuer: {setup.issuer} · Account: {setup.account} · 6 digits, 30 s
              step, SHA-1.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="setupCode">6-digit code</Label>
          <Input
            id="setupCode"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={setupCode}
            onChange={(e) =>
              setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={verifySetup}
            disabled={setupSubmitting || setupCode.length !== 6}
          >
            {setupSubmitting ? "Verifying…" : "Enable 2FA"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={cancelSetup}
            disabled={setupSubmitting}
          >
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  // Just-finished setup → show recovery codes once
  if (savedCodes) {
    return (
      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <h2 className="font-display text-lg">2FA enabled</h2>
        </div>
        <RecoveryCodesPanel
          codes={savedCodes}
          onAcknowledge={() => setSavedCodes(null)}
        />
      </section>
    );
  }

  // Just-regenerated → show new recovery codes once
  if (regenCodes) {
    return (
      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">New recovery codes</h2>
        </div>
        <RecoveryCodesPanel
          codes={regenCodes}
          onAcknowledge={() => setRegenCodes(null)}
        />
      </section>
    );
  }

  if (!status?.enabled) {
    return (
      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display text-lg">Two-factor authentication</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Add a second factor to your admin login. Even if your password is
          guessed or leaked, an attacker still can&apos;t sign in without your
          authenticator app.
        </p>
        <Button type="button" onClick={beginSetup} disabled={setupSubmitting}>
          {setupSubmitting ? "Generating…" : "Enable 2FA"}
        </Button>
      </section>
    );
  }

  // Enabled — show disable + regenerate
  return (
    <div className="space-y-6">
      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <h2 className="font-display text-lg">2FA is enabled</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {status.recoveryCodesRemaining} recovery code
          {status.recoveryCodesRemaining === 1 ? "" : "s"} remaining.
          {status.updatedAt
            ? ` Last updated ${new Date(status.updatedAt).toLocaleString()}.`
            : ""}
        </p>
      </section>

      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Regenerate recovery codes</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Issues 10 new single-use codes and invalidates the old set. Confirm
          with a current 6-digit code.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <Label htmlFor="regenCode">Current code</Label>
            <Input
              id="regenCode"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={regenCode}
              onChange={(e) =>
                setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              autoComplete="one-time-code"
            />
          </div>
          <Button
            type="button"
            onClick={regenerate}
            disabled={regenSubmitting || regenCode.length !== 6}
          >
            {regenSubmitting ? "Working…" : "Regenerate"}
          </Button>
        </div>
      </section>

      <section className="bg-card/40 border border-border/60 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-destructive" />
          <h2 className="font-display text-lg">Disable 2FA</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Removes the second factor. Requires your current password and a
          6-digit code.
        </p>
        <div className="space-y-2">
          <div>
            <Label htmlFor="disablePassword">Current password</Label>
            <Input
              id="disablePassword"
              type="password"
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="disableCode">Current code</Label>
            <Input
              id="disableCode"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              autoComplete="one-time-code"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          onClick={disable}
          disabled={
            disableSubmitting || !disablePassword || disableCode.length !== 6
          }
        >
          {disableSubmitting ? "Working…" : "Disable 2FA"}
        </Button>
      </section>
    </div>
  );
}
