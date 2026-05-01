import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Mail,
  X,
} from "lucide-react";
import { toast } from "sonner";
import GoogleNavSignIn from "@/components/GoogleNavSignIn";
import { useHeroSlides, type HeroSlide } from "@/contexts/HeroSlidesContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useUserAuth } from "@/contexts/UserAuthContext";

// localStorage key — once the visitor closes / accepts the modal we
// don't show it again on subsequent visits. Bumping the suffix here
// would re-arm the modal for every existing visitor.
const SEEN_KEY = "canvhub:newuser-modal:seen-v1";
const CAROUSEL_INTERVAL_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;
// Custom event admins fire from /admin → New-user modal → "Preview" so
// they can pop the modal open from the admin UI regardless of
// localStorage / signed-in / route filters.
export const PREVIEW_EVENT = "canvhub:preview-newuser-modal";

// Built-in fallback slides for the modal carousel when the admin
// hasn't uploaded any Hero Slides yet. Pulls from the product
// placeholder set already shipped under public/images/ so the modal
// always pops with imagery instead of a flat gradient. Once the admin
// adds real Hero Slides under Admin → Hero slider, those take over.
const DEFAULT_FALLBACK_SLIDES: HeroSlide[] = [
  {
    id: "_default-1",
    image: "/images/1.png",
    eyebrow: "Canvas Hub",
    headline: "Affordable Art, Authentic Stories",
    subtext: "",
    ctaLabel: "",
    ctaHref: "",
    align: "center",
  },
  {
    id: "_default-2",
    image: "/images/2.png",
    eyebrow: "Hand-curated",
    headline: "Limited prints, ready to ship",
    subtext: "",
    ctaLabel: "",
    ctaHref: "",
    align: "center",
  },
  {
    id: "_default-3",
    image: "/images/4.png",
    eyebrow: "New here?",
    headline: "Welcome — your discount is waiting",
    subtext: "",
    ctaLabel: "",
    ctaHref: "",
    align: "center",
  },
];

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
  const { slides } = useHeroSlides();
  const modal = config.newUserModal;
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
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

  // Preview trigger — admin clicks "Preview modal" in /admin → New-user
  // modal. Bypasses every gating rule (localStorage seen, signed-in,
  // /admin route filter) and explicitly does NOT mark the modal as seen
  // on close, so the admin can preview repeatedly without clearing
  // localStorage.
  useEffect(() => {
    const handler = () => {
      setShowEmailForm(false);
      setSubmitted(false);
      setEmail("");
      setCopied(false);
      setPreviewMode(true);
      setOpen(true);
    };
    window.addEventListener(PREVIEW_EVENT, handler);
    return () => window.removeEventListener(PREVIEW_EVENT, handler);
  }, []);

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

  const close = () => {
    setOpen(false);
    if (previewMode) {
      // Don't burn the visitor's seen-flag from a preview — admin needs
      // to be able to re-open it. Reset the trigger latch too so a
      // second preview after a real trigger still works.
      setPreviewMode(false);
      triggeredRef.current = false;
      return;
    }
    markSeen();
  };

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
      className="fixed inset-0 z-[1100] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="newuser-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-3xl max-h-full overflow-hidden rounded-md border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full text-white/90 bg-black/30 hover:bg-black/50 hover:text-white transition-colors md:text-muted-foreground md:bg-transparent md:hover:bg-muted/60"
        >
          <X className="w-4 h-4" />
        </button>

        {previewMode && (
          <div className="absolute top-3 left-3 z-20 px-2 py-1 rounded-sm bg-foreground/85 text-background text-[10px] uppercase tracking-[0.2em] font-medium">
            Preview
          </div>
        )}

        <div className="grid md:grid-cols-2 max-h-[85vh] overflow-y-auto md:overflow-hidden">
          <ModalHeroCarousel slides={slides} headline={modal.headline} />
          <div className="flex flex-col px-6 py-7 md:py-9 md:px-8 md:overflow-y-auto">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                New here?
              </p>
              <h2
                id="newuser-modal-title"
                className="mt-2 font-display text-2xl md:text-3xl text-foreground leading-tight"
              >
                {modal.headline}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">{modal.body}</p>
            </div>

            {modal.voucherCode && (
              <div className="mt-5 rounded-md border border-dashed border-foreground/30 bg-muted/30 p-3 flex items-center gap-3">
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

            <div className="mt-6 space-y-3">
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
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                        Sending…
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
      </div>
    </div>
  );
}

// Hero carousel inside the modal — pulls from the existing Hero Slides
// gallery so admins don't manage a second image set. Falls back to a
// gradient placeholder if no slides are configured. Auto-rotates every
// 5s, supports prev/next arrows + dots + touch swipe, and pauses on
// hover so visitors can read longer captions.
const ModalHeroCarousel = ({
  slides,
  headline,
}: {
  slides: HeroSlide[];
  headline: string;
}) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const adminSlides = slides.filter((s) => Boolean(s?.image));
  const usable = adminSlides.length > 0 ? adminSlides : DEFAULT_FALLBACK_SLIDES;
  const total = usable.length;

  useEffect(() => {
    if (total <= 1 || paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [total, paused]);

  // Reset to the first slide if the slide list shrinks beneath our index
  useEffect(() => {
    if (index >= total && total > 0) setIndex(0);
  }, [index, total]);

  const goPrev = () =>
    setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total));
  const goNext = () => setIndex((i) => (total === 0 ? 0 : (i + 1) % total));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      if (dx > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  // `usable` always has at least the built-in fallback slides, so we
  // never need an empty-state branch — the carousel always renders
  // imagery. Headline is unused here because slide captions take over.
  void headline;

  return (
    <div
      className="relative aspect-[5/4] md:aspect-auto md:min-h-[480px] bg-foreground/5 overflow-hidden group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {usable.map((s, i) => (
        <div
          key={s.id || `${i}-${s.image}`}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={i !== index}
        >
          <img
            src={s.image}
            alt={s.headline || "Canvas Hub"}
            className="w-full h-full object-cover"
            loading={i === 0 ? "eager" : "lazy"}
          />
          {(s.eyebrow || s.headline) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          )}
          {(s.eyebrow || s.headline) && (
            <div className="absolute left-5 right-5 bottom-5 md:left-6 md:right-6 md:bottom-6 text-white">
              {s.eyebrow && (
                <p className="text-[10px] md:text-[11px] uppercase tracking-[0.25em] opacity-90">
                  {s.eyebrow}
                </p>
              )}
              {s.headline && (
                <p className="mt-1.5 font-display text-lg md:text-xl leading-tight drop-shadow">
                  {s.headline}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute left-0 right-0 bottom-2 flex items-center justify-center gap-1.5">
            {usable.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${
                  i === index
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/50 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
