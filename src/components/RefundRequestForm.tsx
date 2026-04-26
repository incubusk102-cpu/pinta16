import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CompletedOrder,
  RefundRequestReason,
} from "@/contexts/CartContext";
import { toast } from "sonner";

const REASON_OPTIONS: { value: RefundRequestReason; label: string }[] = [
  { value: "damaged", label: "Arrived damaged" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "no_longer_wanted", label: "No longer wanted" },
  { value: "other", label: "Other reason (explain below)" },
];

export interface RefundRequestFormProps {
  order: CompletedOrder;
  onSubmitted: (updated: CompletedOrder) => void;
}

export function RefundRequestForm({
  order,
  onSubmitted,
}: RefundRequestFormProps) {
  const [reason, setReason] = useState<RefundRequestReason>("damaged");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (note.trim().length < 10) {
      return toast.error(
        "Please describe the issue in at least 10 characters.",
      );
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return toast.error("Please enter the email used to place this order.");
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "customer-refund-request",
          orderId: order.id,
          email: email.trim(),
          reason,
          note: note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success("Refund request submitted");
      onSubmitted(data.order);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pt-3 border-t border-border/20 space-y-3"
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <Undo2 className="w-4 h-4" /> Request a return / refund
      </div>
      <p className="text-xs text-muted-foreground">
        We'll review your request and get back to you within 2 business days.
      </p>

      <div>
        <Label htmlFor="refund-reason">Reason</Label>
        <Select
          value={reason}
          onValueChange={(v) => setReason(v as RefundRequestReason)}
        >
          <SelectTrigger id="refund-reason">
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
      </div>

      <div>
        <Label htmlFor="refund-email">
          Email used at checkout
          <span className="ml-1 text-[10px] text-muted-foreground">
            (verifies you placed this order)
          </span>
        </Label>
        <Input
          id="refund-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <Label htmlFor="refund-note">What happened?</Label>
        <Textarea
          id="refund-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Tell us what went wrong. The more detail the better."
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          {note.length}/1000 · min 10 characters.
        </p>
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Submit refund request
      </Button>
    </form>
  );
}
