import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import {
  useCart,
  type CompletedOrder,
  type OrderRefund,
} from "@/contexts/CartContext";
import { toast } from "sonner";
import { jsonAuthHeaders } from "@/lib/api";

interface RefundBannerProps {
  orderId: string;
  status: OrderRefund["status"];
  amount: number;
  requestedAt: string;
  completedAt?: string;
  failureMessage?: string;
  onRefreshed?: (order: CompletedOrder) => void;
}

const statusCopy: Record<
  OrderRefund["status"],
  { title: string; tone: "warn" | "success" | "error" }
> = {
  pending: {
    title: "Refund in progress via QR Ph",
    tone: "warn",
  },
  succeeded: {
    title: "Refund completed",
    tone: "success",
  },
  failed: {
    title: "Refund failed",
    tone: "error",
  },
};

const RefundBanner = ({
  orderId,
  status,
  amount,
  requestedAt,
  completedAt,
  failureMessage,
  onRefreshed,
}: RefundBannerProps) => {
  const { applyOrderUpdate } = useCart();
  const [checking, setChecking] = useState(false);
  const lastSeenStatusRef = useRef(status);

  useEffect(() => {
    if (status !== "pending") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({ action: "check-refund", orderId }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.order && !cancelled) {
          applyOrderUpdate(data.order);
          onRefreshed?.(data.order);
        }
      } catch {
        /* ignore polling errors */
      }
    };
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, orderId, applyOrderUpdate, onRefreshed]);

  useEffect(() => {
    if (
      lastSeenStatusRef.current !== status &&
      (status === "succeeded" || status === "failed")
    ) {
      lastSeenStatusRef.current = status;
      if (status === "succeeded") {
        toast.success(`Refund of ₱${amount.toLocaleString()} completed`);
      } else {
        toast.error(failureMessage || "Refund failed");
      }
    }
  }, [status, amount, failureMessage]);

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ action: "check-refund", orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.order) {
        applyOrderUpdate(data.order);
        onRefreshed?.(data.order);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not check status",
      );
    } finally {
      setChecking(false);
    }
  };

  const copy = statusCopy[status];
  const toneClasses =
    copy.tone === "success"
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
      : copy.tone === "error"
        ? "bg-destructive/10 border-destructive/30 text-destructive"
        : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300";

  return (
    <div
      className={`p-4 border rounded-sm space-y-2 ${toneClasses}`}
      role="status"
    >
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4" />
        <p className="font-body text-xs tracking-wider uppercase">
          {copy.title}
        </p>
        {status === "pending" && (
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={checking}
            className="ml-auto inline-flex items-center gap-1 text-[11px] underline hover:no-underline disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Check now
          </button>
        )}
      </div>
      <p className="text-xs">Amount: ₱{amount.toLocaleString()}</p>
      <p className="text-[11px] opacity-80">
        Requested {new Date(requestedAt).toLocaleString()}
        {completedAt
          ? ` · Updated ${new Date(completedAt).toLocaleString()}`
          : ""}
      </p>
      {status === "pending" && (
        <p className="text-[11px] opacity-80">
          We're waiting for PayMongo / QR Ph to confirm the refund. This is
          usually quick but can take up to a few banking days. We'll notify you
          as soon as it lands in your wallet.
        </p>
      )}
      {status === "failed" && failureMessage && (
        <p className="text-[11px] opacity-80">Reason: {failureMessage}</p>
      )}
    </div>
  );
};

export default RefundBanner;
