import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  ShieldCheck,
  ShieldOff,
  Copy,
  Download,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface TwoFaStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
  enabledAt: string | null;
}

interface SetupPayload {
  secret: string;
  uri: string;
  recoveryCodes: string[];
}

const fetchJson = async <T,>(
  url: string,
  init: RequestInit & { token: string },
): Promise<T> => {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const res = await fetch(url, { ...init, headers });
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

const downloadText = (filename: string, body: string) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([body], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const copyToClipboard = async (value: string, what: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    toast.error("Clipboard not available");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Could not copy");
  }
};

export function Admin2FASection() {
  const [status, setStatus] = useState<TwoFaStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [setupPayload, setSetupPayload] = useState<SetupPayload | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  const refresh = async () => {
    setLoadingStatus(true);
    try {
      const token = getAdminToken() ?? "";
      const data = await fetchJson<TwoFaStatus>(
        "/api/admin-auth?action=2fa-status",
        { token },
      );
      setStatus(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load 2FA");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const beginSetup = async () => {
    setSetupBusy(true);
    try {
      const token = getAdminToken() ?? "";
      const data = await fetchJson<SetupPayload>("/api/admin-auth", {
        token,
        method: "POST",
        body: JSON.stringify({ action: "setup-2fa" }),
      });
      setSetupPayload(data);
      setShowRecovery(true);
      setSetupCode("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start 2FA setup",
      );
    } finally {
      setSetupBusy(false);
    }
  };

  const verifySetup = async () => {
    if (!setupPayload) return;
    if (setupCode.replace(/\D/g, "").length !== 6) {
      return toast.error("Enter the 6-digit code from your authenticator");
    }
    setVerifyBusy(true);
    try {
      const token = getAdminToken() ?? "";
      await fetchJson<{ ok: true }>("/api/admin-auth", {
        token,
        method: "POST",
        body: JSON.stringify({ action: "verify-2fa", code: setupCode.trim() }),
      });
      toast.success("2FA enabled");
      setSetupPayload(null);
      setSetupCode("");
      setShowRecovery(false);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code not accepted");
    } finally {
      setVerifyBusy(false);
    }
  };

  const cancelSetup = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Discard the QR code and recovery codes? You will not be able to recover them.",
      )
    ) {
      return;
    }
    setSetupPayload(null);
    setSetupCode("");
    setShowRecovery(false);
  };

  const disable2fa = async () => {
    if (!disablePassword) {
      return toast.error("Enter your admin password");
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Disable 2FA? Anyone with the admin password will be able to log in without a code.",
      )
    ) {
      return;
    }
    setDisableBusy(true);
    try {
      const token = getAdminToken() ?? "";
      await fetchJson<{ ok: true }>("/api/admin-auth", {
        token,
        method: "POST",
        body: JSON.stringify({
          action: "disable-2fa",
          password: disablePassword,
        }),
      });
      toast.success("2FA disabled");
      setDisablePassword("");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setDisableBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Two-factor authentication (TOTP)
        </span>
      </header>
      <div className="p-4 space-y-4 max-w-2xl">
        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : status?.enabled && !setupPayload ? (
          <>
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>
                2FA is <strong>enabled</strong>
                {status.enabledAt
                  ? ` since ${new Date(status.enabledAt).toLocaleDateString(
                      "en-PH",
                      { timeZone: "Asia/Manila" },
                    )}`
                  : ""}
                .
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {status.recoveryCodesRemaining} recovery code
              {status.recoveryCodesRemaining === 1 ? "" : "s"} remaining. Each
              login asks for the 6-digit code from your authenticator (or one
              recovery code if you lose access to your phone).
            </p>
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border/40">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="disable-2fa-pw" className="text-xs">
                  Admin password (to disable)
                </Label>
                <Input
                  id="disable-2fa-pw"
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Required to turn off 2FA"
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => void disable2fa()}
                disabled={disableBusy || !disablePassword}
              >
                {disableBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <ShieldOff className="w-4 h-4 mr-1" />
                )}
                Disable 2FA
              </Button>
            </div>
          </>
        ) : setupPayload ? (
          <>
            <p className="text-sm text-muted-foreground">
              Scan this QR with Google Authenticator, 1Password, Authy, or any
              standard authenticator app. Then enter the 6-digit code below to
              activate.
            </p>
            <div className="flex flex-wrap items-start gap-6">
              <div className="bg-white p-3 rounded-md border border-border/60">
                <QRCodeSVG
                  value={setupPayload.uri}
                  size={176}
                  level="M"
                  marginSize={2}
                />
              </div>
              <div className="flex-1 min-w-[260px] space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Manual setup secret
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="font-mono text-xs bg-muted/40 px-2 py-1 rounded select-all break-all">
                      {setupPayload.secret}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void copyToClipboard(setupPayload.secret, "secret")
                      }
                      className="shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {showRecovery && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Recovery codes — save these now
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Each code works once if you lose your authenticator. They
                      will <strong>not</strong> be shown again.
                    </p>
                    <div className="grid grid-cols-2 gap-1 mt-2 text-xs font-mono">
                      {setupPayload.recoveryCodes.map((code) => (
                        <span
                          key={code}
                          className="bg-muted/40 px-2 py-1 rounded select-all"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadText(
                          "canvhub-admin-recovery-codes.txt",
                          [
                            "Canvas Hub admin recovery codes",
                            "(each works once; store somewhere safe)",
                            "",
                            ...setupPayload.recoveryCodes,
                          ].join("\n"),
                        )
                      }
                      className="mt-2"
                    >
                      <Download className="w-3 h-3 mr-1" /> Download .txt
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border/40">
              <div className="flex-1 min-w-[180px]">
                <Label htmlFor="setup-code" className="text-xs">
                  Code from authenticator
                </Label>
                <Input
                  id="setup-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={setupCode}
                  onChange={(e) =>
                    setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123 456"
                  autoComplete="one-time-code"
                />
              </div>
              <Button
                onClick={() => void verifySetup()}
                disabled={verifyBusy || setupCode.length !== 6}
              >
                {verifyBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-1" />
                )}
                Activate 2FA
              </Button>
              <Button variant="outline" onClick={cancelSetup}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldOff className="w-4 h-4" />
              <span>
                2FA is <strong>not enabled</strong>.
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, login asks for a 6-digit code from your
              authenticator app on top of the password. We&apos;ll also generate
              8 single-use recovery codes in case you lose access to the app.
            </p>
            <Button onClick={() => void beginSetup()} disabled={setupBusy}>
              {setupBusy ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <KeyRound className="w-4 h-4 mr-1" />
              )}
              Set up 2FA
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
