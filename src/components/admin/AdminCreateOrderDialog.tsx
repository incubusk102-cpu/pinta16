import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { getAdminToken } from "@/contexts/AdminAuthContext";

/**
 * Manual order entry for the admin. Used to recover orders whose
 * client-side POST never reached the server (rare — Cloudflare bot
 * challenge, body-size cap, network blip during checkout). The form
 * intentionally exposes only the fields that matter for record-keeping
 * and downstream notifications; advanced fields like payment intent
 * IDs and voucher codes can be filled in afterwards via the regular
 * order edit flow.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface ItemDraft {
  id: string;
  title: string;
  price: string;
  quantity: string;
}

const newItem = (): ItemDraft => ({
  id: "",
  title: "",
  price: "",
  quantity: "1",
});

const ORDER_ID_RE = /^ORD-[A-Z0-9]+$/;

export function AdminCreateOrderDialog({ open, onClose, onCreated }: Props) {
  const [orderId, setOrderId] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [status, setStatus] = useState<string>("confirmed");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setOrderId("");
    setCreatedAt("");
    setStatus("confirmed");
    setFullName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setCity("");
    setNotes("");
    setShippingFee("0");
    setItems([newItem()]);
  };

  const subtotal = items.reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    return sum + price * qty;
  }, 0);
  const total = subtotal + (Number(shippingFee) || 0);

  const handleSubmit = async () => {
    // Client-side validation mirrors the server so the user sees
    // mistakes immediately instead of after a 400.
    if (orderId && !ORDER_ID_RE.test(orderId)) {
      toast.error(
        "Order ID must look like ORD-XXXX (uppercase letters and digits)",
      );
      return;
    }
    if (items.some((it) => !it.title.trim())) {
      toast.error("Every item needs a title");
      return;
    }
    if (!fullName || !email || !phone || !address || !city) {
      toast.error("Fill in name, email, phone, address, and city");
      return;
    }
    setSubmitting(true);
    try {
      const token = getAdminToken();
      const orderPayload = {
        ...(orderId ? { id: orderId } : {}),
        items: items.map((it) => ({
          id: it.id,
          title: it.title.trim(),
          price: Number(it.price) || 0,
          quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        })),
        orderInfo: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          city: city.trim(),
          notes: notes.trim(),
        },
        subtotal,
        shippingFee: Number(shippingFee) || 0,
        discount: 0,
        total,
        freeShipping: (Number(shippingFee) || 0) === 0,
        estimatedCreationDays: "",
        createdAt: createdAt
          ? new Date(createdAt).toISOString()
          : new Date().toISOString(),
        status,
      };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "admin-create", order: orderPayload }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        order?: { id?: string };
      } | null;
      if (!res.ok) {
        const detail = data?.error || `HTTP ${res.status}`;
        toast.error(`Couldn't create order: ${detail}`);
        return;
      }
      toast.success(`Created ${data?.order?.id ?? "order"}`);
      onCreated();
      reset();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Network error creating order",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create order manually</DialogTitle>
          <DialogDescription>
            Use this when a customer's order didn't sync from their phone. Their
            data will be saved server-side and the customer will appear in the
            orders list. Email notifications are not auto-sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ord-id">Order ID</Label>
              <Input
                id="ord-id"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                placeholder="ORD-2896EC16 (auto if blank)"
              />
            </div>
            <div>
              <Label htmlFor="ord-created">Created at</Label>
              <Input
                id="ord-created"
                type="datetime-local"
                value={createdAt}
                onChange={(e) => setCreatedAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ord-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="ord-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="in_progress">
                  Painting in progress
                </SelectItem>
                <SelectItem value="out_for_delivery">
                  Out for delivery
                </SelectItem>
                <SelectItem value="received">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 border-t pt-3">
            <h3 className="text-sm font-medium">Customer</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cust-name">Full name *</Label>
                <Input
                  id="cust-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cust-email">Email *</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cust-phone">Phone *</Label>
                <Input
                  id="cust-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cust-city">City / Municipality *</Label>
                <Input
                  id="cust-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cust-addr">Address *</Label>
              <Textarea
                id="cust-addr"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea
                id="cust-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Items</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setItems((prev) => [...prev, newItem()])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add item
              </Button>
            </div>
            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-end border rounded-md p-2"
              >
                <div className="col-span-5">
                  <Label htmlFor={`item-title-${idx}`}>Title</Label>
                  <Input
                    id={`item-title-${idx}`}
                    value={item.title}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === idx ? { ...it, title: e.target.value } : it,
                        ),
                      )
                    }
                    placeholder="Blossoming Pink Tulips Stylized Floral Art"
                  />
                </div>
                <div className="col-span-3">
                  <Label htmlFor={`item-price-${idx}`}>Price (₱)</Label>
                  <Input
                    id={`item-price-${idx}`}
                    type="number"
                    inputMode="decimal"
                    value={item.price}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === idx ? { ...it, price: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="col-span-3">
                  <Label htmlFor={`item-qty-${idx}`}>Qty</Label>
                  <Input
                    id={`item-qty-${idx}`}
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === idx ? { ...it, quantity: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label={`Remove item ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t pt-3">
            <h3 className="text-sm font-medium">Totals</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ord-shipping">Shipping fee (₱)</Label>
                <Input
                  id="ord-shipping"
                  type="number"
                  inputMode="decimal"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Subtotal: ₱{subtotal.toLocaleString()} · Total: ₱
              {total.toLocaleString()}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
