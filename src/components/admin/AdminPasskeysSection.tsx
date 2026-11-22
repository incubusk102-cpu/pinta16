import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2, Plus, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminToken, useAdminAuth } from "@/contexts/AdminAuthContext";

interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  transports?: string[];
  credentialDeviceType?: "singleDevice" | "multiDevice";
  backupState?: "backed-up" | "single-device";
}

interface PasskeysResponse {
  passkeys: PasskeySummary[];
  requirePasskey: boolean;
  updatedAt: string | null;
}

const AUTH_API = "/api/admin-auth";

const formatRelative = (iso: string | null) => {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "never";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const isWebAuthnAvailable = () =>
  typeof window !== "undefined" &&
  typeof window.PublicKeyCredential !== "undefined";

export function AdminPasskeysSection() {
  const { refreshGate } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [requirePasskey, setRequirePasskey] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removePassword, setRemovePassword] = useState("");
  const [togglingPassword, setTogglingPassword] = useState("");
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${AUTH_API}?action=passkeys`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Could not load passkeys");
      const data = (await res.json()) as PasskeysResponse;
      setPasskeys(data.passkeys || []);
      setRequirePasskey(Boolean(data.requirePasskey));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load passkeys",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!isWebAuthnAvailable()) {
      toast.error("This browser does not support passkeys");
      return;
    }
    const trimmed = newName.trim() || "Passkey";
    setAdding(true);
    try {
      const token = getAdminToken();
      if (!token) throw new Error("Not authenticated");
      // Lazy-load the browser helper.
      const { startRegistration } = await import("@simplewebauthn/browser");
      const beginRes = await fetch(AUTH_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "passkey-register-begin" }),
      });
      if (!beginRes.ok) {
        const e = await beginRes.json().catch(() => ({}));
        throw new Error(e?.error || "Could not start registration");
      }
      const beginData = (await beginRes.json()) as {
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
        challengeId: string;
      };
      const credential = await startRegistration({
        optionsJSON: beginData.options,
      });
      const finishRes = await fetch(AUTH_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "passkey-register-finish",
          challengeId: beginData.challengeId,
          name: trimmed,
          response: credential,
        }),
      });
      if (!finishRes.ok) {
        const e = await finishRes.json().catch(() => ({}));
        throw new Error(e?.error || "Registration failed");
      }
      toast.success(`Passkey "${trimmed}" registered`);
      setNewName("");
      await refresh();
      // Keep the public gate state in sync — login screen needs to
      // know there's now a passkey on file.
      await refreshGate();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Passkey registration failed";
      // Browser cancellations are noisy; suppress the toast.
      if (!/cancell?ed|aborted|not allowed/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setAdding(false);
    }
  }, [newName, refresh, refreshGate]);

  const handleRemove = useCallback(
    async (id: string) => {
      const trimmed = removePassword.trim();
      if (!trimmed) {
        toast.error("Enter your admin password to remove this passkey");
        return;
      }
      setRemovingId(id);
      try {
        const token = getAdminToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch(AUTH_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "passkey-remove",
            id,
            password: trimmed,
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error || "Could not remove passkey");
        }
        toast.success("Passkey removed");
        setRemovePassword("");
        await refresh();
        await refreshGate();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not remove passkey",
        );
      } finally {
        setRemovingId(null);
      }
    },
    [refresh, refreshGate, removePassword],
  );

  const handleToggleRequire = useCallback(
    async (next: boolean) => {
      const trimmed = togglingPassword.trim();
      if (!trimmed) {
        toast.error("Enter your admin password");
        return;
      }
      if (next && passkeys.length === 0) {
        toast.error("Register a passkey first");
        return;
      }
      setToggling(true);
      try {
        const token = getAdminToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch(AUTH_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "passkey-require",
            required: next,
            password: trimmed,
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error || "Could not update setting");
        }
        toast.success(
          next
            ? "Password login disabled. Passkey is now required."
            : "Password login re-enabled.",
        );
        setTogglingPassword("");
        await refresh();
        await refreshGate();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update setting",
        );
      } finally {
        setToggling(false);
      }
    },
    [passkeys.length, refresh, refreshGate, togglingPassword],
  );

  return (
    <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <header className="p-3 border-b border-border/60 bg-muted/20 flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Passkeys (the strongest admin login)
        </span>
      </header>
      <div className="p-4 space-y-4 max-w-xl">
        {!isWebAuthnAvailable() && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            This browser does not expose the WebAuthn API. Open the admin from a
            current Chrome / Safari / Firefox build to register a passkey.
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Register a passkey on each device you log in from. Passkeys are
          phishing-proof — the browser cryptographically binds the signature to{" "}
          <code>{location.host}</code>, so a clone of the site can&apos;t replay
          it. Use Touch ID, Face ID, Windows Hello, a fingerprint reader, or a
          hardware key (YubiKey, etc).
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading passkeys…
          </div>
        ) : (
          <div className="space-y-3">
            {passkeys.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No passkeys yet. Register one below to harden your admin login.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {passkeys.map((pk) => (
                  <li
                    key={pk.id}
                    className="p-3 flex items-start gap-3 text-sm"
                  >
                    <Fingerprint className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{pk.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Added {formatRelative(pk.createdAt)} • Last used{" "}
                        {formatRelative(pk.lastUsedAt)}
                        {pk.backupState === "backed-up" && (
                          <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                            (synced across your devices)
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={removingId === pk.id}
                      onClick={() => handleRemove(pk.id)}
                      title="Remove passkey"
                    >
                      {removingId === pk.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-destructive" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-md border border-border/60 p-3 space-y-2">
              <Label htmlFor="passkey-add-name" className="text-xs">
                Add a new passkey
              </Label>
              <div className="flex gap-2">
                <Input
                  id="passkey-add-name"
                  type="text"
                  maxLength={40}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder='e.g. "iPhone 15", "Work laptop", "YubiKey"'
                  disabled={adding || !isWebAuthnAvailable()}
                />
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding || !isWebAuthnAvailable()}
                  className="shrink-0"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add passkey
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your browser will ask you to confirm with biometrics or a
                hardware key. The private key never leaves your device.
              </p>
            </div>

            {passkeys.length > 0 && (
              <div className="rounded-md border border-border/60 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  {requirePasskey ? (
                    <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Unlock className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {requirePasskey
                      ? "Password login is disabled"
                      : "Require passkey for admin login"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {requirePasskey
                    ? "An attacker with your password alone cannot sign in. Disable this only if you have lost access to all your passkeys (you can still get back in with a 2FA recovery code if 2FA is enabled)."
                    : "When on, the password login form is removed entirely. You can still recover with a 2FA recovery code if 2FA is enabled. Make sure you have tested signing in with your passkey first."}
                </p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label htmlFor="passkey-toggle-pw" className="text-xs">
                      Confirm with admin password
                    </Label>
                    <Input
                      id="passkey-toggle-pw"
                      type="password"
                      autoComplete="current-password"
                      value={togglingPassword}
                      onChange={(e) => setTogglingPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant={requirePasskey ? "outline" : "default"}
                    onClick={() => handleToggleRequire(!requirePasskey)}
                    disabled={toggling}
                    className="shrink-0"
                  >
                    {toggling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : requirePasskey ? (
                      "Re-enable password login"
                    ) : (
                      "Require passkey only"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {passkeys.length > 0 && (
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <Label htmlFor="passkey-remove-pw" className="text-xs">
                  Confirm password to enable removal
                </Label>
                <Input
                  id="passkey-remove-pw"
                  type="password"
                  autoComplete="current-password"
                  value={removePassword}
                  onChange={(e) => setRemovePassword(e.target.value)}
                  placeholder="Type your admin password before pressing the trash icon"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
