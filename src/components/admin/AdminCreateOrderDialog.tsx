import { useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { getAllArtworks, type DisplayArtwork } from "@/lib/artworks";
import ImageWithFallback from "@/components/ImageWithFallback";
import { cn } from "@/lib/utils";

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
  // The id of the linked artwork (e.g. "default-rice-field-guardians"
  // for a stock piece, "product-<uuid>" for an upload). Empty for
  // free-text custom items — those won't be reviewable since reviews
  // key off productId, but the manual order itself still saves fine.
  id: string;
  title: string;
  price: string;
  quantity: string;
  // Thumbnail captured at order time so the order tracker / review
  // prompt has something to show even if the underlying product is
  // later edited or deleted.
  image: string;
}

const newItem = (): ItemDraft => ({
  id: "",
  title: "",
  price: "",
  quantity: "1",
  image: "",
});

const ORDER_ID_RE = /^ORD-[A-Z0-9]+$/;

const formatPHP = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);

interface ProductPickerProps {
  value: ItemDraft;
  artworks: DisplayArtwork[];
  onPick: (artwork: DisplayArtwork) => void;
  onClearLink: () => void;
  onTitleChange: (title: string) => void;
  inputId: string;
}

/**
 * Searchable product picker for the manual-order form. Selecting an
 * artwork populates the item's id, title, price, and image so the
 * order item is linked to a real product — that's what makes it
 * reviewable from the customer's order tracker. We still allow free
 * text (the "Use as custom item" affordance + an editable title field
 * once linked) so admins can record one-off commissions that aren't
 * in the catalog yet.
 */
function ProductPicker({
  value,
  artworks,
  onPick,
  onClearLink,
  onTitleChange,
  inputId,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const linked = Boolean(value.id);
  const linkedArtwork = useMemo(
    () => (linked ? artworks.find((a) => a.id === value.id) : undefined),
    [artworks, linked, value.id],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return artworks;
    return artworks.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.medium.toLowerCase().includes(q),
    );
  }, [artworks, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={inputId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-auto min-h-10 w-full justify-between text-left font-normal py-1.5 px-2",
            !linked && !value.title && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {linked && linkedArtwork?.image ? (
              <ImageWithFallback
                src={linkedArtwork.image}
                alt=""
                className="w-9 h-9 object-cover rounded-sm shrink-0"
              />
            ) : null}
            <span className="flex flex-col min-w-0">
              <span className="truncate text-sm">
                {value.title || "Pick a painting…"}
              </span>
              {linked && linkedArtwork ? (
                <span className="truncate text-xs text-muted-foreground">
                  {formatPHP(linkedArtwork.salePrice ?? linkedArtwork.price)}
                  {linkedArtwork.availability !== "available"
                    ? ` · ${linkedArtwork.availability}`
                    : ""}
                </span>
              ) : value.title && !linked ? (
                <span className="truncate text-xs text-muted-foreground">
                  Custom item · not reviewable
                </span>
              ) : null}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[20rem]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by title or medium…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm flex items-center gap-2"
                  onClick={() => {
                    onClearLink();
                    onTitleChange(search.trim());
                    setOpen(false);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" />
                  Use "{search.trim()}" as a custom item
                </button>
              ) : (
                "Type to search the catalog."
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((art) => {
                const selected = value.id === art.id;
                const effectivePrice = art.salePrice ?? art.price;
                return (
                  <CommandItem
                    key={art.id}
                    value={art.id}
                    onSelect={() => {
                      onPick(art);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        "w-4 h-4 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {art.image ? (
                      <ImageWithFallback
                        src={art.image}
                        alt=""
                        className="w-9 h-9 object-cover rounded-sm shrink-0"
                      />
                    ) : (
                      <span className="w-9 h-9 rounded-sm bg-muted shrink-0" />
                    )}
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-sm">{art.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {formatPHP(effectivePrice)}
                        {art.availability !== "available"
                          ? ` · ${art.availability}`
                          : ""}
                        {art.isCustom ? " · upload" : " · stock"}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AdminCreateOrderDialog({ open, onClose, onCreated }: Props) {
  const { products } = useProducts();
  // Defaults + uploads, with `replacesDefaultId` overrides applied,
  // sorted the same way as the storefront. Drafts and other non-
  // available pieces are kept in the list so admins can record
  // legacy / pre-launch orders, but their availability is shown in
  // the row so it's obvious when a piece is sold or unlisted.
  const artworks = useMemo(() => getAllArtworks(products), [products]);

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
          // `id` is what links this line to a real product so the
          // customer can leave a review later. Empty for free-text
          // custom items.
          id: it.id,
          title: it.title.trim(),
          price: Number(it.price) || 0,
          quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
          // Captured at order time so the order tracker has a
          // thumbnail even if the product is later edited or removed.
          image: it.image,
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
                <div className="col-span-12 sm:col-span-5">
                  <Label htmlFor={`item-title-${idx}`}>Painting</Label>
                  <ProductPicker
                    inputId={`item-title-${idx}`}
                    value={item}
                    artworks={artworks}
                    onPick={(art) =>
                      // Linking an order line to a real artwork is
                      // what unlocks the review flow downstream — the
                      // customer's order tracker matches reviews to
                      // products by this id.
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? {
                                ...it,
                                id: art.id,
                                title: art.title,
                                image: art.image,
                                price: String(art.salePrice ?? art.price),
                              }
                            : it,
                        ),
                      )
                    }
                    onClearLink={() =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === idx ? { ...it, id: "", image: "" } : it,
                        ),
                      )
                    }
                    onTitleChange={(title) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === idx ? { ...it, title } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="col-span-5 sm:col-span-3">
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
                <div className="col-span-5 sm:col-span-3">
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
                <div className="col-span-2 sm:col-span-1 flex justify-end">
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
