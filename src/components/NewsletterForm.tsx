import { FormEvent, useCallback, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import Turnstile, { isTurnstileEnabled } from "./Turnstile";

interface Props {
  source?: string;
  className?: string;
}

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function NewsletterForm({
  source = "footer",
  className = "",
}: Props) {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const handleToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const handleExpire = useCallback(() => setTurnstileToken(null), []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setMessage({ kind: "error", text: t("newsletter.invalidEmail") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          source,
          // Only included when Turnstile is enabled. Server falls open
          // (skips verification) if its secret key isn't set, so missing
          // token here is fine in dev / before dashboard widget exists.
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: t("newsletter.error") });
        return;
      }
      if (data.already) {
        setMessage({ kind: "info", text: t("newsletter.alreadySubscribed") });
      } else {
        setMessage({ kind: "success", text: t("newsletter.success") });
        setEmail("");
        setName("");
      }
    } catch {
      setMessage({ kind: "error", text: t("newsletter.error") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={`w-full max-w-md ${className}`}
      aria-label={t("newsletter.title")}
    >
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder={t("newsletter.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={t("newsletter.email")}
            className="w-full pl-9 pr-3 py-3 bg-background border border-border rounded-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/40"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground text-background font-body text-xs tracking-[0.2em] uppercase rounded-sm hover:bg-foreground/90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("newsletter.submitting")}
            </>
          ) : (
            t("newsletter.submit")
          )}
        </button>
      </div>
      <input
        type="text"
        autoComplete="name"
        placeholder={t("newsletter.namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("newsletter.namePlaceholder")}
        className="mt-2 w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/40"
      />
      {isTurnstileEnabled() && (
        <div className="mt-2">
          <Turnstile
            action="newsletter"
            appearance="interaction-only"
            onToken={handleToken}
            onExpire={handleExpire}
          />
        </div>
      )}
      {message && (
        <p
          role="status"
          className={`mt-2 text-xs ${
            message.kind === "success"
              ? "text-emerald-500"
              : message.kind === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {message.text}
        </p>
      )}
      <p className="mt-2 text-[11px] tracking-[0.1em] uppercase text-muted-foreground/80">
        {t("newsletter.privacy")}
      </p>
    </form>
  );
}
