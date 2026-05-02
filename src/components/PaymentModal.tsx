import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle, QrCode, RefreshCw } from "lucide-react";
import { checkPaymentStatus as checkPaymentStatusFn } from "@/utils/payment.functions";

interface PaymentModalProps {
  paymentIntentId: string;
  qrCodeUrl: string | null;
  total: number;
  onSuccess: () => void;
  onClose: () => void;
}

type PaymentStatus =
  | "loading"
  | "awaiting_payment"
  | "checking"
  | "succeeded"
  | "failed";

// How often to silently re-check payment status with PayMongo while
// the modal is open. Each poll consumes one Workers KV write on the
// /api/check-payment rate-limit counter (free tier: 1k writes / day),
// so the cadence is tuned to be responsive enough that a customer
// doesn't notice the wait but slow enough that one parked checkout
// can't burn the whole site's daily KV write budget. 8s = ~7 polls /
// minute, well under the existing 30 req/min rate-limit ceiling and
// well-paced for QR-Ph payments which clear in 5-30 seconds anyway.
const POLL_INTERVAL_MS = 8000;
// Stop auto-polling after this long. PayMongo QR-Ph intents expire on
// their side after a few minutes; we don't want to keep hitting their
// API forever for a tab the user left open and walked away from.
const POLL_MAX_DURATION_MS = 10 * 60 * 1000;

const PaymentModal = ({
  paymentIntentId,
  qrCodeUrl,
  total,
  onSuccess,
  onClose,
}: PaymentModalProps) => {
  const [status, setStatus] = useState<PaymentStatus>("awaiting_payment");
  const [statusMessage, setStatusMessage] = useState("");
  // Latest status in a ref so the polling loop can read it without
  // having to re-create itself on every state change (which would
  // reset the interval and double-poll).
  const statusRef = useRef<PaymentStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const applyPaymentStatus = useCallback(
    (paymentStatus: string | undefined) => {
      if (paymentStatus === "succeeded") {
        setStatus("succeeded");
        setStatusMessage("Payment successful!");
      } else if (paymentStatus === "awaiting_next_action") {
        setStatus("awaiting_payment");
        setStatusMessage(
          "Waiting for payment. Please scan the QR code and complete payment.",
        );
      } else if (paymentStatus === "processing") {
        setStatus("awaiting_payment");
        setStatusMessage(
          "Payment is processing. We'll confirm automatically in a moment.",
        );
      } else if (paymentStatus === "awaiting_payment_method") {
        setStatus("failed");
        setStatusMessage("Payment session expired. Please start again.");
      } else if (paymentStatus) {
        setStatus("awaiting_payment");
        setStatusMessage(`Status: ${paymentStatus}`);
      }
    },
    [],
  );

  const checkPaymentStatus = useCallback(async () => {
    setStatus("checking");
    setStatusMessage("Verifying payment...");

    try {
      const data = await checkPaymentStatusFn({ data: { paymentIntentId } });
      applyPaymentStatus(data.attributes?.status);
    } catch (error) {
      console.error("Status check failed:", error);
      setStatus("awaiting_payment");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Could not verify payment. Please try again.",
      );
    }
  }, [paymentIntentId, applyPaymentStatus]);

  // Background poller: silently re-checks payment status with PayMongo
  // every few seconds while the modal is open. Customers who scan the
  // QR Ph code and pay through GCash / Maya often forget to come back
  // to the tab and tap "Check Payment Status", which previously left
  // the order unconfirmed even though the money was transferred.
  // Auto-polling closes that gap by promoting the intent to "succeeded"
  // as soon as PayMongo reports it.
  useEffect(() => {
    if (!paymentIntentId) return;
    // Don't start polling until the QR code is rendered — there's
    // nothing to confirm yet, and it just burns rate-limit budget.
    if (!qrCodeUrl) return;

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      // Skip while a manual "Check now" request or another poll is in
      // flight, and stop entirely once we reach a terminal state.
      const current = statusRef.current;
      if (current === "checking") return;
      if (current === "succeeded" || current === "failed") return;
      if (Date.now() - startedAt > POLL_MAX_DURATION_MS) return;

      try {
        const data = await checkPaymentStatusFn({ data: { paymentIntentId } });
        if (cancelled) return;
        applyPaymentStatus(data.attributes?.status);
      } catch (error) {
        // Swallow transient errors silently — the next tick will retry,
        // and we don't want to flash an error toast at the customer
        // every few seconds for a flaky network.
        if (!cancelled) {
          console.warn("Auto status check failed:", error);
        }
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    // Kick off an immediate first poll so customers who paid before the
    // modal was even open get confirmed without waiting a full tick.
    poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [paymentIntentId, qrCodeUrl, applyPaymentStatus]);

  useEffect(() => {
    if (status === "succeeded") {
      const timer = setTimeout(() => onSuccess(), 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onSuccess]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-card border border-border/20 rounded-sm max-w-md w-full p-8 relative"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-accent rounded-sm transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>

          {status === "succeeded" ? (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
              >
                <CheckCircle className="w-20 h-20 mx-auto mb-6 text-success" />
              </motion.div>
              <h3 className="font-display text-2xl text-foreground mb-2">
                Payment Successful!
              </h3>
              <p className="font-body text-sm text-muted-foreground">
                Your order is being confirmed...
              </p>
              <p className="font-body text-xs text-muted-foreground mt-4">
                Amount paid: ₱{total.toLocaleString()}
              </p>
            </motion.div>
          ) : (
            <div className="text-center">
              <div className="mb-6">
                <QrCode className="w-10 h-10 mx-auto mb-3 text-[#0066FF]" />
                <h3 className="font-display text-xl text-foreground mb-1">
                  Pay with QR Ph
                </h3>
                <p className="font-body text-xs text-muted-foreground">
                  Scan with GCash, Maya, or any QR Ph-enabled app
                </p>
              </div>

              <div className="mb-6 p-4 bg-muted/30 border border-border/10 rounded-sm">
                <p className="font-body text-2xl font-semibold text-foreground mb-1">
                  ₱{total.toLocaleString()}
                </p>
                <p className="font-body text-[10px] text-muted-foreground">
                  Total Amount
                </p>
              </div>

              {qrCodeUrl ? (
                <div className="mb-6">
                  <img
                    src={qrCodeUrl}
                    alt="QR Ph code"
                    className="mx-auto w-full max-w-xs rounded-sm border border-border/20 bg-white p-3"
                    loading="lazy"
                    decoding="async"
                  />
                  <p className="font-body text-[10px] text-muted-foreground mt-3">
                    Scan this QR code using GCash, Maya, or any QR Ph-enabled
                    app. We'll detect your payment automatically.
                  </p>
                </div>
              ) : (
                <div className="mb-6 flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0066FF] mb-3" />
                  <p className="font-body text-xs text-muted-foreground">
                    Generating QR code...
                  </p>
                </div>
              )}

              {qrCodeUrl && status !== "failed" && (
                <div className="mb-3 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <p className="font-body text-[10px]">
                    Waiting for payment — checking automatically…
                  </p>
                </div>
              )}

              {statusMessage && (
                <p className="font-body text-xs text-muted-foreground mb-4">
                  {statusMessage}
                </p>
              )}

              <button
                onClick={checkPaymentStatus}
                disabled={status === "checking" || !qrCodeUrl}
                className="w-full py-3 bg-foreground text-background font-body text-xs tracking-[0.2em] uppercase hover:bg-foreground/90 disabled:opacity-50 transition-all duration-300 rounded-sm flex items-center justify-center gap-2"
              >
                {status === "checking" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Check Now
                  </>
                )}
              </button>

              <p className="font-body text-[10px] text-muted-foreground/50 mt-4">
                Your order confirms automatically once payment is received. Use
                "Check Now" if you don't want to wait.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentModal;
