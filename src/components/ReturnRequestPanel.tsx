import { useState } from "react";
import { Loader2, PackageX, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jsonAuthHeaders } from "@/lib/api";
import { useUserAuth } from "@/contexts/UserAuthContext";
import {
  useCart,
  type CompletedOrder,
  type ReturnRequest,
  type ReturnRequestReason,
  type ReturnRequestStatus,
} from "@/contexts/CartContext";

interface ReturnRequestPanelProps {
  order: CompletedOrder;
  onUpdated?: (order: CompletedOrder) => void;
}

const REASON_OPTIONS: { value: ReturnRequestReason; label: string }[] = [
  { value: "damaged_in_transit", label: "Damaged in transit" },
  { value: "wrong_item", label: "Wrong item delivered" },
  { value: "not_as_described", label: "Not as described" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "other", label: "Other" },
];

const REASON_LABEL: Record<ReturnRequestReason, string> = REASON_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<ReturnRequestReason, string>,
);

const STATUS_COPY: Record<
  ReturnRequestStatus,
  { title: string; tone: "info" | "success" | "warn" | "muted" | "error" }
> = {
  requested: { title: "Return requested", tone: "info" },
  approved: { title: "Return approved", tone: "success" },
  received: { title: "Return received", tone: "info" },
  completed: { title: "Return completed", tone: "success" },
  denied: { title: "Return denied", tone: "error" },
  cancelled: { title: "Return cancelled", tone: "muted" },
};

const TONE_CLASS: Record<
  "info" | "success" | "warn" | "muted" | "error",
  string
> = {
  info: "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300",
  success:
    "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
  muted: "bg-muted/40 border-border/40 text-muted-foreground",
  error: "bg-destructive/10 border-destructive/30 text-destructive",
};

const ReturnStatusCard = ({
  request,
  onCancel,
  cancelling,
}: {
  request: ReturnRequest;
  onCancel: () => void;
  cancelling: boolean;
}) => {
  const copy = STATUS_COPY[request.status] ?? {
    title: request.status,
    tone: "muted" as const,
  };
  return (
    <div className={`p-4 border rounded-sm space-y-2 ${TONE_CLASS[copy.tone]}`}>
      <div className="flex items-center gap-2">
        <PackageX className="w-4 h-4" />
        <p className="font-body text-xs tracking-wider uppercase">
          {copy.title}
        </p>
        {request.status === "requested" && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="ml-auto inline-flex items-center gap-1 text-[11px] underline hover:no-underline disabled:opacity-50"
          >
            {cancelling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Cancel return
          </button>
        )}
      </div>
      <p className="text-xs">
        Reason: {REASON_LABEL[request.reason] ?? request.reason}
      </p>
      {request.description && (
        <p className="text-[11px] opacity-80 whitespace-pre-wrap">
          {request.description}
        </p>
      )}
      {request.rmaNumber && (
        <p className="text-[11px] opacity-80">
          RMA: <span className="font-mono">{request.rmaNumber}</span>
        </p>
      )}
      {request.status === "denied" && request.denialReason && (
        <p className="text-[11px] opacity-80">
          Reason for denial: {request.denialReason}
        </p>
      )}
      {request.status === "completed" && request.refundAmount != null && (
        <p className="text-[11px] opacity-80">
          Refunded: ₱{(request.refundAmount / 100).toLocaleString()}
        </p>
      )}
      <p className="text-[11px] opacity-70">
        Requested {new Date(request.requestedAt).toLocaleString()}
        {request.decidedAt
          ? ` · Decided ${new Date(request.decidedAt).toLocaleString()}`
          : ""}
        {request.receivedAt
          ? ` · Received ${new Date(request.receivedAt).toLocaleString()}`
          : ""}
        {request.completedAt
          ? ` · Completed ${new Date(request.completedAt).toLocaleString()}`
          : ""}
      </p>
      {request.status === "approved" && (
        <p className="text-[11px] opacity-80">
          Please ship the item back. We'll mark the return received and process
          your refund as soon as it arrives.
        </p>
      )}
    </div>
  );
};

const FileReturnDialog = ({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmit: (
    reason: ReturnRequestReason,
    description: string,
  ) => void | Promise<void>;
  submitting: boolean;
}) => {
  const [reason, setReason] =
    useState<ReturnRequestReason>("damaged_in_transit");
  const [description, setDescription] = useState("");

  const reset = () => {
    setReason("damaged_in_transit");
    setDescription("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>File a return</DialogTitle>
          <DialogDescription>
            Tell us what went wrong with this order. Our team reviews every
            return within 1–2 business days.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Reason
            </span>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as ReturnRequestReason)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Details (required)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Describe the issue in a few sentences."
              className="mt-1 w-full bg-background border border-border rounded-md text-sm px-3 py-2"
            />
            <span className="text-[10px] text-muted-foreground">
              {description.length}/2000
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void onSubmit(reason, description)}
            disabled={submitting || description.trim().length === 0}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Submit return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ReturnRequestPanel = ({ order, onUpdated }: ReturnRequestPanelProps) => {
  const { applyOrderUpdate } = useCart();
  const { token } = useUserAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Authed POSTs need either a `cv_user_session` cookie + matching
  // `X-CSRF-Token` header (the standard cookie path) OR an
  // `Authorization: Bearer` header. Google's redirect-flow callback used
  // to land us on the SPA with only an in-memory token — no cookies —
  // which silently 401'd the return request. We now also fall back to
  // the bearer token so any in-memory-only session keeps working even
  // before the user re-logs in to pick up the new cookies.
  const buildAuthedJsonHeaders = (): Record<string, string> => {
    const headers = jsonAuthHeaders();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const existing = order.returnRequest;
  // A "received" order with no active return — or with a previously
  // denied/cancelled one — is eligible to file a fresh request.
  const isEligible =
    order.status === "received" &&
    (!existing ||
      existing.status === "denied" ||
      existing.status === "cancelled") &&
    !order.refund;

  const handleSubmit = async (
    reason: ReturnRequestReason,
    description: string,
  ) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: buildAuthedJsonHeaders(),
        body: JSON.stringify({
          action: "customer-return-request",
          orderId: order.id,
          reason,
          description: description.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.order) {
        applyOrderUpdate(data.order);
        onUpdated?.(data.order);
      }
      toast.success("Return request submitted");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not file return");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: buildAuthedJsonHeaders(),
        body: JSON.stringify({
          action: "customer-return-cancel",
          orderId: order.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.order) {
        applyOrderUpdate(data.order);
        onUpdated?.(data.order);
      }
      toast.success("Return cancelled");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not cancel return",
      );
    } finally {
      setCancelling(false);
    }
  };

  // Hide entirely when there's nothing to show. Specifically: don't show
  // the CTA on orders that are still in flight, and don't show a stale
  // "denied" card forever — once denied, the customer can re-file.
  const hasActiveRequest =
    existing && existing.status !== "denied" && existing.status !== "cancelled";
  if (!hasActiveRequest && !isEligible) return null;

  return (
    <div className="space-y-2">
      {hasActiveRequest && existing && (
        <ReturnStatusCard
          request={existing}
          onCancel={() => void handleCancel()}
          cancelling={cancelling}
        />
      )}
      {isEligible && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="text-xs"
          >
            <PackageX className="w-3.5 h-3.5 mr-1.5" />
            File a return
          </Button>
          <FileReturnDialog
            open={open}
            onOpenChange={setOpen}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        </>
      )}
    </div>
  );
};

export default ReturnRequestPanel;
