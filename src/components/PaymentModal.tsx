import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  CheckCircle,
  QrCode,
  RefreshCw,
  Download,
  ChevronDown,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { checkPaymentStatus as checkPaymentStatusFn } from "@/utils/payment.functions";
import { formatPHP } from "@/lib/format";
import { useInertBackground } from "@/hooks/useInertBackground";

interface PaymentModalProps {
  paymentIntentId: string;
  qrCodeUrl: string | null;
  total: number;
  onSuccess: () => void;
  onClose: () => void;
}

type PaymentStatus =
  | "awaiting_payment"
  | "checking"
  | "succeeded"
  | "failed"
  | "timeout";

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
  // PaymentModal is only ever rendered inside the CheckoutForm drawer
  // once a payment intent exists, so its mounted lifetime is exactly
  // the modal's open window. Marking the main page content as `inert`
  // hides it from assistive technology and keyboard focus while the
  // QR / status UI is showing on top. Ref-counts with the
  // CheckoutForm's own inert lock so the page only becomes
  // interactive again once every overlay closes.
  useInertBackground(true);
  // Latest status in a ref so the polling loop can read it without
  // having to re-create itself on every state change (which would
  // reset the interval and double-poll).
  const statusRef = useRef<PaymentStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  // Count consecutive background-poll failures so we can prompt the
  // customer to take over manually after several silent retries.
  // Reset on any successful poll or manual check.
  const consecutiveErrorsRef = useRef(0);

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
        // PayMongo leaves brand-new intents in this state until the
        // first attach call lands, and occasionally bounces back to it
        // when a wallet hand-off fails mid-stream but the intent is
        // still spendable. Treat it as in-progress so the customer can
        // re-scan, NOT as a hard failure.
        setStatus("awaiting_payment");
        setStatusMessage(
          "Waiting for payment. Please scan the QR code and complete payment.",
        );
      } else if (paymentStatus === "expired") {
        // Terminal: PayMongo has explicitly retired this intent. The
        // QR will no longer accept funds — the customer needs to start
        // a fresh payment from checkout.
        setStatus("failed");
        setStatusMessage(
          "Payment session expired. Please close this and try again.",
        );
      } else if (paymentStatus === "cancelled") {
        // Terminal: customer (or PayMongo) cancelled the intent before
        // it cleared. Surface this via the failed branch so the modal
        // shows a clean "try again" UX instead of a bare status line.
        setStatus("failed");
        setStatusMessage(
          "Payment was cancelled. Please close this and try again.",
        );
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
      consecutiveErrorsRef.current = 0;
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
      if (
        current === "succeeded" ||
        current === "failed" ||
        current === "timeout"
      ) {
        return;
      }
      if (Date.now() - startedAt > POLL_MAX_DURATION_MS) {
        // Surface the cap to the customer so the modal stops looking
        // like it's still working when we've actually given up. They
        // can tap Try Again to start a fresh intent.
        setStatus("timeout");
        setStatusMessage("Payment session timed out. Please try again.");
        return;
      }

      try {
        const data = await checkPaymentStatusFn({ data: { paymentIntentId } });
        if (cancelled) return;
        consecutiveErrorsRef.current = 0;
        applyPaymentStatus(data.attributes?.status);
      } catch (error) {
        // Swallow transient errors silently — the next tick will retry,
        // and we don't want to flash an error toast at the customer
        // every few seconds for a flaky network. After 3 misses in a
        // row, surface a hint so the customer knows they can take over
        // manually instead of staring at a frozen modal.
        if (!cancelled) {
          console.warn("Auto status check failed:", error);
          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= 3) {
            setStatusMessage(
              "Having trouble connecting. Tap Check Now to retry manually.",
            );
          }
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

  // Save the QR PNG to the customer's device so they can import it
  // from their gallery in GCash / Maya. PayMongo returns the QR Ph
  // image as a base64 `data:image/png;base64,...` URL on the
  // payment-intent attach response, so we decode it directly into a
  // Blob and trigger a same-origin `<a download>` click. Going through
  // `fetch()` round-trips a data URL through the network stack and
  // can fail inside in-app browsers (Facebook / Messenger / IG
  // webviews), and a `window.open(dataURL)` fallback navigates the
  // current tab to the raw data URL on those same browsers — which
  // tears down the React modal and abandons the live payment intent.
  // We never call window.open here for that reason; the worst-case
  // path just shows a hint to long-press the QR instead.
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const dataUrlToBlob = useCallback((dataUrl: string): Blob => {
    const commaIndex = dataUrl.indexOf(",");
    if (!dataUrl.startsWith("data:") || commaIndex < 0) {
      throw new Error("Not a data URL");
    }
    const meta = dataUrl.slice(5, commaIndex);
    const isBase64 = /;base64$/i.test(meta);
    const mime = meta.replace(/;base64$/i, "") || "image/png";
    const payload = dataUrl.slice(commaIndex + 1);
    const decoded = isBase64 ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!qrCodeUrl || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = qrCodeUrl.startsWith("data:")
        ? dataUrlToBlob(qrCodeUrl)
        : await fetch(qrCodeUrl).then((r) => {
            if (!r.ok) throw new Error(`status ${r.status}`);
            return r.blob();
          });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `canvhub-qrph-${paymentIntentId || "payment"}.png`;
      // Deliberately no target attribute. On Android Chrome,
      // `<a target="_blank" download>` for a blob: URL opens a
      // transient tab that auto-closes after the download starts,
      // which on a single-tab Chrome session looks identical to "the
      // site closed." Plain anchor clicks with just `download` fire
      // the OS download manager from the current tab and leave the
      // payment modal mounted.
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Hold the object URL long enough for the OS download manager to
      // hand the blob off; revoking immediately can cancel the save on
      // some Android webviews.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.warn("QR download failed:", error);
      setDownloadError(
        "Couldn't auto-save. Long-press the QR image and tap Save image instead — the QR and payment session are still active.",
      );
    } finally {
      setDownloading(false);
    }
  }, [qrCodeUrl, paymentIntentId, downloading, dataUrlToBlob]);

  // The import-from-gallery guide is collapsed by default so the QR
  // and amount stay the visual focus for the majority of customers
  // who will scan with a second device. Customers paying from the
  // same phone tap the toggle and get step-by-step instructions for
  // each wallet.
  const [guideOpen, setGuideOpen] = useState(false);

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
          role="dialog"
          aria-modal="true"
          aria-label="Complete payment"
        >
          <button
            onClick={() => {
              if (
                status === "awaiting_payment" &&
                !window.confirm(
                  "A payment is still in progress. Are you sure you want to close?",
                )
              ) {
                return;
              }
              onClose();
            }}
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
                Amount paid: {formatPHP(total)}
              </p>
            </motion.div>
          ) : status === "timeout" ? (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 mx-auto mb-6 text-destructive" />
              <h3 className="font-display text-xl text-foreground mb-2">
                Payment session timed out. Please try again.
              </h3>
              <p className="font-body text-xs text-muted-foreground mb-6">
                We stopped checking after waiting too long for confirmation.
                Your QR code is no longer being monitored.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-foreground text-background font-body text-xs tracking-[0.2em] uppercase hover:bg-foreground/90 transition-all duration-300 rounded-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          ) : status === "failed" ? (
            <div className="text-center py-8">
              <XCircle className="w-16 h-16 mx-auto mb-6 text-destructive" />
              <h3 className="font-display text-xl text-foreground mb-2">
                Payment couldn't be completed
              </h3>
              {statusMessage && (
                <p className="font-body text-xs text-muted-foreground mb-6">
                  {statusMessage}
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-destructive text-destructive-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-destructive/90 transition-all duration-300 rounded-sm flex items-center justify-center gap-2"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="mb-6">
                <QrCode className="w-10 h-10 mx-auto mb-3 text-[#0066FF]" />
                <h3 className="font-display text-xl text-foreground mb-1">
                  Pay with QR Ph
                </h3>
                <p className="font-body text-xs text-muted-foreground">
                  Scan with another device, or save the QR and import it from
                  your GCash / Maya app on this phone.
                </p>
              </div>

              <div className="mb-6 p-4 bg-muted/30 border border-border/10 rounded-sm">
                <p className="font-body text-2xl font-semibold text-foreground mb-1">
                  {formatPHP(total)}
                </p>
                <p className="font-body text-[10px] text-muted-foreground">
                  Total Amount
                </p>
              </div>

              {/* Import-from-gallery guide. Collapsed by default; the
                  customer paying from the same phone they're checking
                  out on opens it for step-by-step instructions on
                  loading the saved QR image inside their wallet. */}
              <div className="mb-5 text-left border border-border/30 rounded-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGuideOpen((open) => !open)}
                  aria-expanded={guideOpen}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <span className="font-body text-xs uppercase tracking-[0.18em] text-foreground">
                    How to import the QR in GCash / Maya
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-foreground/70 transition-transform ${
                      guideOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {guideOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 font-body text-[11px] leading-relaxed text-muted-foreground">
                        <div>
                          <p className="font-semibold text-foreground tracking-[0.18em] uppercase text-[10px] mb-2">
                            GCash
                          </p>
                          <ol className="space-y-1.5 list-decimal list-inside">
                            <li>Tap Save QR below.</li>
                            <li>
                              Open GCash and tap{" "}
                              <span className="text-foreground">Pay QR</span>.
                            </li>
                            <li>
                              Tap the{" "}
                              <span className="text-foreground">
                                upload / gallery icon
                              </span>{" "}
                              and pick the saved image.
                            </li>
                            <li>Confirm the amount and tap Pay.</li>
                          </ol>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground tracking-[0.18em] uppercase text-[10px] mb-2">
                            Maya
                          </p>
                          <ol className="space-y-1.5 list-decimal list-inside">
                            <li>Tap Save QR below.</li>
                            <li>
                              Open Maya and tap{" "}
                              <span className="text-foreground">
                                Scan to Pay
                              </span>
                              .
                            </li>
                            <li>
                              Tap the{" "}
                              <span className="text-foreground">
                                gallery icon
                              </span>{" "}
                              and pick the saved image.
                            </li>
                            <li>Confirm the amount and tap Pay.</li>
                          </ol>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                  {/* Loading skeleton above sits underneath the QR; the
                      conditional below shows a shimmer while PayMongo's
                      attach call is in flight and qrCodeUrl is null. */}
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="mt-3 inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-foreground/20 text-foreground font-body text-[11px] tracking-[0.2em] uppercase hover:bg-accent disabled:opacity-50 transition-all rounded-sm"
                  >
                    {downloading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {downloading ? "Saving..." : "Save QR"}
                  </button>
                  {downloadError && (
                    <p className="font-body text-[10px] text-destructive mt-2">
                      {downloadError}
                    </p>
                  )}
                  <p className="font-body text-[10px] text-muted-foreground mt-3">
                    Scan this QR with another device, or tap Save QR and import
                    it from your gallery in GCash or Maya. We'll detect your
                    payment automatically.
                  </p>
                </div>
              ) : (
                <div
                  className="mb-6 flex flex-col items-center justify-center py-8"
                  role="status"
                  aria-live="polite"
                  aria-label="Generating QR code"
                >
                  <div
                    className="mx-auto w-full max-w-xs aspect-square rounded-sm border border-border/20 bg-muted/40 animate-pulse"
                    aria-hidden="true"
                  />
                  <p className="font-body text-xs text-muted-foreground mt-3">
                    Generating QR code...
                  </p>
                </div>
              )}

              {qrCodeUrl && (
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
