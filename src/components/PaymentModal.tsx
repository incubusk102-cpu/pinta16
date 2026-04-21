import { useState, useEffect, useCallback } from "react";
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

type PaymentStatus = "loading" | "awaiting_payment" | "checking" | "succeeded" | "failed";

const PaymentModal = ({ paymentIntentId, qrCodeUrl, total, onSuccess, onClose }: PaymentModalProps) => {
  const [status, setStatus] = useState<PaymentStatus>("awaiting_payment");
  const [statusMessage, setStatusMessage] = useState("");

  const checkPaymentStatus = useCallback(async () => {
    setStatus("checking");
    setStatusMessage("Verifying payment...");

    try {
      const data = await checkPaymentStatusFn({ data: { paymentIntentId } });
      const paymentStatus = data.attributes?.status;

      if (paymentStatus === "chargeable" || paymentStatus === "paid") {
        setStatus("succeeded");
        setStatusMessage("Payment successful!");
      } else if (paymentStatus === "pending") {
        setStatus("awaiting_payment");
        setStatusMessage("Waiting for payment. Please scan the QR code and complete payment.");
      } else if (paymentStatus === "failed" || paymentStatus === "expired" || paymentStatus === "cancelled") {
        setStatus("failed");
        setStatusMessage(`Payment ${paymentStatus}. Please try again.`);
      } else {
        setStatus("awaiting_payment");
        setStatusMessage(`Status: ${paymentStatus}`);
      }
    } catch (error) {
      console.error("Status check failed:", error);
      setStatus("awaiting_payment");
      setStatusMessage("Could not verify payment. Please try again.");
    }
  }, [paymentIntentId]);

  useEffect(() => {
    if (status === "succeeded") {
      const timer = setTimeout(() => onSuccess(), 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onSuccess]);

  // Auto-polling disabled — user must tap "Check Payment Status" manually after paying

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-card border border-border/20 rounded-sm max-w-md w-full p-8 relative"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-accent rounded-sm transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>

          {status === "succeeded" ? (
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
              >
                <CheckCircle className="w-20 h-20 mx-auto mb-6 text-success" />
              </motion.div>
              <h3 className="font-display text-2xl text-foreground mb-2">Payment Successful!</h3>
              <p className="font-body text-sm text-muted-foreground">Your order is being confirmed...</p>
              <p className="font-body text-xs text-muted-foreground mt-4">Amount paid: ₱{total.toLocaleString()}</p>
            </motion.div>
          ) : (
            <div className="text-center">
              <div className="mb-6">
                <QrCode className="w-10 h-10 mx-auto mb-3 text-[#0066FF]" />
                <h3 className="font-display text-xl text-foreground mb-1">Pay with QR Ph</h3>
                <p className="font-body text-xs text-muted-foreground">Scan with GCash, Maya, or any QR Ph-enabled app</p>
              </div>

              <div className="mb-6 p-4 bg-muted/30 border border-border/10 rounded-sm">
                <p className="font-body text-2xl font-semibold text-foreground mb-1">₱{total.toLocaleString()}</p>
                <p className="font-body text-[10px] text-muted-foreground">Total Amount</p>
              </div>

              {qrCodeUrl ? (
                <div className="mb-6">
                  <a
                    href={qrCodeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block w-full py-4 px-6 bg-[#0066FF] text-white font-body text-xs tracking-[0.2em] uppercase hover:bg-[#0052CC] transition-all duration-300 rounded-sm"
                  >
                    Open QR Ph Payment Page
                  </a>
                  <p className="font-body text-[10px] text-muted-foreground mt-3">
                    Tap above to open PayMongo's secure QR page. Scan with GCash, Maya, or any QR Ph app, then return here.
                  </p>
                </div>
              ) : (
                <div className="mb-6 flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0066FF] mb-3" />
                  <p className="font-body text-xs text-muted-foreground">Generating QR code...</p>
                </div>
              )}

              {statusMessage && (
                <p className="font-body text-xs text-muted-foreground mb-4">{statusMessage}</p>
              )}

              <button
                onClick={checkPaymentStatus}
                disabled={status === "checking"}
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
                    Check Payment Status
                  </>
                )}
              </button>

              <p className="font-body text-[10px] text-muted-foreground/50 mt-4">
                After paying, tap "Check Payment Status" to confirm your order.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentModal;
