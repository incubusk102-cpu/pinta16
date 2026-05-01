import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Copy, Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import GoogleNavSignIn from "@/components/GoogleNavSignIn";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useUserAuth } from "@/contexts/UserAuthContext";

// localStorage key — once the visitor closes / accepts the modal we
// don't show it again on subsequent visits. Bumping the suffix here
// would re-arm the modal for every existing visitor.
const SEEN_KEY = "canvhub:newuser-modal:seen-v1";

const isAdminRoute = () =>
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/admin");

const wasSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
};

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function NewUserModal() {
  const { config, loading } = useStorefrontConfig();
  const { user } = useUserAuth();
  const modal = config.newUserModal;
  const [open, setOpen] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  // Track whether this mount of the modal already fired a trigger so a
  // single visitor never gets the same dialog popping up twice in one
  // session if they navigate between routes.
  const triggeredRef = useRef(false);

  const eligible =
    !loading &&
    modal.enabled &&
    !user && // signed-in users have nothing new to gain
    !isAdminRoute() &&
    !wasSeen();

  // Time-based trigger
  useEffect(() => {
    if (!eligible || !modal.triggers.time || triggeredRef.current) return;
    const ms = Math.max(1, modal.timeSeconds) * 1000;
    const id = window.setTimeout(() => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      setOpen(true);
    }, ms);
    return () => window.clearTimeout(id);
  }, [eligible, modal.triggers.time, modal.timeSeconds]);

  // Scroll-depth trigger
  useEffect(() => {
    if (!eligible || !modal.triggers.scroll || triggeredRef.current) return;
    const threshold = Math.min(95, Math.max(5, modal.scrollPercent)) / 100;
    const handler = () => {
      if (triggeredRef.current) return;
      const doc = document.documentElement;
      const total = (doc.scrollHeight || 0) - (window.innerHeight || 0);
      if (total <= 0) return;
      const ratio = (window.scrollY || 0) / total;
      if (ratio >= threshold) {
        triggeredRef.current = true;
        setOpen(true);
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [eligible, modal.triggers.scroll, modal.scrollPercent]);

  // Exit-intent trigger (mouse leaves through the top of the viewport)
  useEffect(() => {
    if (!eligible || !modal.triggers.exitIntent || triggeredRef.current) return;
    const handler = (e: MouseEvent) => {
      if (triggeredRef.current) return;
      // Only when the cursor exits through the top edge — leaving through
      // the bottom or sides is too noisy on long pages and would fire
      // immediately on dropdown menu hover-outs.
      if (e.clientY <= 0 && e.relatedTarget === null) {
        triggeredRef.current = true;
        setOpen(true);
      }
    };
    document.addEventListener("mouseout", handler);
    return () => document.removeEventListener("mouseout", handler);
  }, [eligible, modal.triggers.exitIntent]);

  // Lock body scroll while the dialog is up
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const close = () => {
    setOpen(false);
    markSeen();
  };

  const handleCopy = async () => {
    if (!modal.voucherCode) return;
    try {
      await navigator.clipboard.writeText(modal.voucherCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy code");
    }
  };

  const handleSubmitEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source: "newuser-modal",
          voucherCode: modal.voucherCode || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        voucher?: { sent?: boolean; error?: string | null } | null;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data?.error || "Could not send the code right now");
        return;
      }
      setSubmitted(true);
      if (modal.voucherCode && data.voucher?.sent) {
        toast.success(`Sent ${modal.voucherCode} to ${email.trim()}`);
      } else if (modal.voucherCode) {
        // Subscribe persisted but the email transport wasn't configured.
        // Don't crash — the visitor still has the code on screen.
        toast.success("You're on the list. Code shown above.");
      } else {
        toast.success("Thanks for subscribing");
      }
    } catch {
      toast.error("Could not send the code right now");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="newuser-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-md border border-border bg-background shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-7 pb-2 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            New here?
          </p>
          <h2
            id="newuser-modal-title"
            className="mt-2 font-display text-2xl text-foreground"
          >
            {modal.headline}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{modal.body}</p>
        </div>

        {modal.voucherCode && (
          <div className="mx-6 mt-4 rounded-md border border-dashed border-foreground/30 bg-muted/30 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Welcome code
              </p>
              <code className="mt-1 block font-mono text-lg tracking-[0.18em] text-foreground truncate">
                {modal.voucherCode}
              </code>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.15em] rounded border border-border hover:bg-muted/60"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </>
              )}
            </button>
          </div>
        )}

        <div className="px-6 pt-5 pb-6 space-y-3">
          {!showEmailForm && (
            <>
              <GoogleNavSignIn active={open} />
              {modal.emailCaptureEnabled && modal.voucherCode && (
                <button
                  type="button"
                  onClick={() => setShowEmailForm(true)}
                  className="w-full text-center text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
                >
                  I just want the voucher
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="w-full text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                No thanks, keep browsing
              </button>
            </>
          )}

          {showEmailForm && !submitted && (
            <form onSubmit={handleSubmitEmail} className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter your email and we'll send the code over.
              </p>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                />
                <input
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-3 bg-background border border-border rounded-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/40"
                  disabled={submitting}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground text-background text-xs tracking-[0.2em] uppercase rounded-sm hover:bg-foreground/90 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…
                  </>
                ) : (
                  <>Email me the code</>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                disabled={submitting}
                className="w-full text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 hover:text-foreground"
              >
                Back
              </button>
            </form>
          )}

          {showEmailForm && submitted && (
            <div className="text-center space-y-3">
              <p className="text-sm text-foreground">
                Code on its way to{" "}
                <span className="font-medium">{email.trim()}</span>.
              </p>
              <button
                type="button"
                onClick={close}
                className="w-full inline-flex items-center justify-center px-6 py-3 bg-foreground text-background text-xs tracking-[0.2em] uppercase rounded-sm hover:bg-foreground/90"
              >
                Continue browsing
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
