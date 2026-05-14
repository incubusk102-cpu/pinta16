import { useEffect } from "react";
import { Toaster as Sonner } from "sonner";
import { animate } from "animejs";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Layer an anime.js scale + glow burst on top of sonner's default
// enter transition. Sonner doesn't expose per-toast hooks, so we
// observe its container with a `MutationObserver` and play the
// burst on every newly-mounted `[data-sonner-toast]` element. The
// observer is singleton-scoped to the lifetime of the `<Toaster>`.
// Silent under prefers-reduced-motion.
const attachToastObserver = (target: Element) => {
  const handleEnter = (toast: HTMLElement) => {
    animate(toast, {
      scale: [0.94, 1.02, 1],
      duration: 360,
      ease: "outBack(1.4)",
    });
    animate(toast, {
      boxShadow: [
        "0 0 0 0 rgba(255,255,255,0)",
        "0 0 28px 6px rgba(255,255,255,0.12)",
        "0 0 0 0 rgba(255,255,255,0)",
      ],
      duration: 720,
      ease: "outQuad",
    });
  };
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches("[data-sonner-toast]")) {
          handleEnter(n);
        }
      });
    }
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
};

const useSonnerMotionLayer = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prefersReducedMotion()) return;
    let cleanup: (() => void) | undefined;
    // Sonner mounts its toaster <ol> lazily on the first toast.
    // Poll briefly so we don't miss early toasts fired during the
    // initial route render. Stops once attached or the host
    // unmounts (250ms cap × 8 attempts = ~2s).
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      const root = document.querySelector("ol[data-sonner-toaster]");
      if (root) {
        cleanup = attachToastObserver(root);
        window.clearInterval(interval);
      } else if (attempts >= 8) {
        window.clearInterval(interval);
      }
    }, 250);
    return () => {
      window.clearInterval(interval);
      cleanup?.();
    };
  }, []);
};

const Toaster = ({ ...props }: ToasterProps) => {
  useSonnerMotionLayer();
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
