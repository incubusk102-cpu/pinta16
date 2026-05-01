import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Stamp, Copy, X } from "lucide-react";
import { toast } from "sonner";
import {
  STAMPS_REQUIRED,
  PASSPORT_REWARD_PERCENT,
  PASSPORT_REWARD_CODE,
  dismissPassportReward,
  getPassportState,
  getStamps,
  subscribePassport,
} from "@/lib/passport";

/**
 * Floating gallery passport widget. Shows a small "X / 5 stamps" badge in
 * the bottom-left of the page; on full unlock it pops a celebration card
 * with the reward code the visitor can copy + apply at checkout. Dismissed
 * state persists so it stops nagging once the visitor has seen it.
 */
const PassportTracker = () => {
  const [stamps, setStamps] = useState<number>(0);
  const [unlocked, setUnlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setStamps(getStamps().length);
      const state = getPassportState();
      setUnlocked(state.unlocked);
      setDismissed(state.dismissed);
      if (state.unlocked && !state.dismissed) setRewardOpen(true);
    };
    sync();
    const unsub = subscribePassport(sync);
    return () => unsub();
  }, []);

  const handleClaim = async () => {
    try {
      await navigator.clipboard.writeText(PASSPORT_REWARD_CODE);
      toast.success("Code copied", {
        description: `Apply ${PASSPORT_REWARD_CODE} at checkout for ${PASSPORT_REWARD_PERCENT}% off.`,
      });
    } catch {
      toast.success(`Your code: ${PASSPORT_REWARD_CODE}`, {
        description: `Apply at checkout for ${PASSPORT_REWARD_PERCENT}% off.`,
      });
    }
    dismissPassportReward();
    setRewardOpen(false);
    setDismissed(true);
  };

  if (stamps === 0 && !unlocked) return null;

  const showWidget = !collapsed && !(unlocked && dismissed);

  return (
    <>
      <AnimatePresence>
        {showWidget && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ duration: 0.35 }}
            className="fixed left-3 bottom-3 sm:left-4 sm:bottom-4 z-40"
          >
            <button
              type="button"
              onClick={() => {
                if (unlocked) setRewardOpen(true);
                else setCollapsed(true);
              }}
              className="group flex items-center gap-2 rounded-full border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-lg hover:shadow-xl transition-shadow"
              aria-label="Gallery passport progress"
            >
              <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-primary/80 to-amber-500 text-primary-foreground">
                <Stamp className="w-3.5 h-3.5" />
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Passport
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {unlocked
                    ? `Reward unlocked!`
                    : `${stamps} / ${STAMPS_REQUIRED} stamps`}
                </span>
              </span>
              {!unlocked && (
                <span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline">
                  hide
                </span>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rewardOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setRewardOpen(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-primary/10 to-amber-500/10 relative">
                <button
                  type="button"
                  onClick={() => setRewardOpen(false)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-primary to-amber-500 text-primary-foreground">
                    <Sparkles className="w-5 h-5" />
                  </span>
                  <h2 className="font-display text-2xl text-foreground">
                    Passport completed!
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  You explored {STAMPS_REQUIRED} pieces. Here&apos;s a thank-you
                  on us:
                </p>
              </div>
              <div className="px-6 pb-6 pt-5 space-y-4">
                <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1.5">
                    Your reward
                  </div>
                  <div className="font-display text-3xl text-primary tracking-wide">
                    {PASSPORT_REWARD_CODE}
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    {PASSPORT_REWARD_PERCENT}% off your next order
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClaim}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Copy className="w-4 h-4" /> Copy code &amp; close
                </button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Apply this code at checkout. One use per visitor.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PassportTracker;
