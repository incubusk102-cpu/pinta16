import { useEffect } from "react";
import { toast } from "sonner";
import { getRecentlyViewed } from "@/lib/recentlyViewed";
import { isReturningVisitor, markVisit } from "@/lib/welcomeBack";
import { useProducts } from "@/contexts/ProductContext";
import { useUserAuth } from "@/contexts/UserAuthContext";

const SHOWN_KEY = "canvhub_welcomeback_shown";

const WelcomeBackToast = () => {
  const { products } = useProducts();
  const { user } = useUserAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasReturning = isReturningVisitor();
    markVisit();
    if (!wasReturning) return;
    // Show at most once per session.
    if (sessionStorage.getItem(SHOWN_KEY)) return;
    sessionStorage.setItem(SHOWN_KEY, "1");

    const firstName = user?.name?.trim().split(/\s+/)[0];
    const greeting = firstName
      ? `Welcome back, ${firstName}!`
      : "Welcome back!";

    const ids = getRecentlyViewed();
    const stillAvailable = ids
      .map((id) => products.find((p) => p.id === id))
      .find(
        (p): p is NonNullable<typeof p> =>
          Boolean(p) && (p!.availability ?? "available") === "available",
      );

    if (stillAvailable) {
      toast.success(greeting, {
        description: `"${stillAvailable.title}" is still available — pick up where you left off.`,
        duration: 6000,
      });
    } else {
      toast.success(greeting, {
        description: "We've added new pieces since your last visit.",
        duration: 5000,
      });
    }
  }, [products, user]);

  return null;
};

export default WelcomeBackToast;
