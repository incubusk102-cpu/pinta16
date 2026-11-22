import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import {
  clearWelcomeBonus,
  getWelcomeBonus,
  markWelcomeBonusApplied,
  subscribeWelcomeBonus,
  wasWelcomeBonusApplied,
  type WelcomeBonusState,
} from "@/lib/welcomeBonus";

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/**
 * Sticky bottom-right pill that counts down the visitor's 24h welcome
 * bonus and auto-applies the code when items are in the cart. Hides
 * itself once the bonus expires or is dismissed.
 */
const WelcomeBonusCountdown = () => {
  const { itemCount, voucher, applyVoucher } = useCart();
  const [bonus, setBonus] = useState<WelcomeBonusState | null>(() =>
    getWelcomeBonus(),
  );
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = subscribeWelcomeBonus(() => setBonus(getWelcomeBonus()));
    return unsub;
  }, []);

  useEffect(() => {
    if (!bonus) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [bonus?.code, bonus?.expiresAt]);

  // Auto-apply once the visitor builds a cart, unless they've already
  // applied a different code manually.
  useEffect(() => {
    if (!bonus) return;
    if (itemCount === 0) return;
    if (voucher.applied) return;
    if (wasWelcomeBonusApplied()) return;
    applyVoucher(bonus.code);
    markWelcomeBonusApplied();
  }, [bonus, itemCount, voucher.applied, applyVoucher]);

  // If the auto-applied code was the welcome bonus itself, mark it so
  // we don't keep retrying once the visitor removes it.
  useEffect(() => {
    if (!bonus) return;
    if (voucher.applied && voucher.code === bonus.code) {
      markWelcomeBonusApplied();
    }
  }, [voucher.applied, voucher.code, bonus]);

  if (!bonus || dismissed) return null;
  const remaining = bonus.expiresAt - now;
  if (remaining <= 0) return null;
  // Don't compete with a real cart drawer — the CartDrawer already
  // shows the applied code prominently.
  if (voucher.applied && voucher.code === bonus.code && itemCount > 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[80] max-w-[calc(100vw-2rem)] sm:max-w-sm"
      >
        <div className="rounded-md border border-amber-300/60 bg-gradient-to-br from-amber-50 via-amber-100/90 to-amber-50 dark:border-amber-700/60 dark:from-amber-950 dark:via-amber-900 dark:to-amber-950 shadow-xl shadow-amber-900/10 p-4 pr-9 relative">
          <button
            type="button"
            aria-label="Dismiss welcome bonus"
            onClick={() => {
              setDismissed(true);
              clearWelcomeBonus();
            }}
            className="absolute top-2 right-2 p-1 rounded-full text-amber-900/70 hover:text-amber-900 hover:bg-amber-200/60 dark:text-amber-100/70 dark:hover:bg-amber-900/40"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-amber-200/80 dark:bg-amber-800/60 flex items-center justify-center">
              <Gift
                className="w-4 h-4 text-amber-700 dark:text-amber-200"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-800/80 dark:text-amber-200/80">
                Your welcome gift
              </p>
              <p className="mt-0.5 text-sm font-medium text-amber-950 dark:text-amber-50">
                Use code{" "}
                <code className="font-mono tracking-wider">{bonus.code}</code>{" "}
                before it expires
              </p>
              <p className="mt-2 text-xs text-amber-900/85 dark:text-amber-200/85">
                Expires in{" "}
                <span
                  className="font-mono text-sm font-semibold text-amber-950 dark:text-amber-50"
                  aria-live="polite"
                >
                  {formatRemaining(remaining)}
                </span>
              </p>
              {!voucher.applied && itemCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    applyVoucher(bonus.code);
                    markWelcomeBonusApplied();
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-amber-900 text-amber-50 text-[11px] uppercase tracking-[0.15em] hover:bg-amber-800"
                >
                  Apply now
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WelcomeBonusCountdown;
