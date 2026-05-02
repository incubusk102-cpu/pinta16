import { useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AddressInput as AddressInputType,
  type SavedAddress,
  useUserAuth,
} from "@/contexts/UserAuthContext";
import {
  PhAddressFields,
  type PhAddressValue,
} from "@/components/PhAddressFields";
import { zoneForRegion } from "@/lib/ph-regions";

const EMPTY: AddressInputType = {
  label: "",
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Philippines",
  latitude: null,
  longitude: null,
  formatted: "",
  region: "",
  barangay: "",
  landmark: "",
};

const toInput = (a: SavedAddress): AddressInputType => ({
  label: a.label || "",
  fullName: a.fullName || "",
  phone: a.phone || "",
  line1: a.line1 || "",
  line2: a.line2 || "",
  city: a.city || "",
  province: a.province || "",
  postalCode: a.postalCode || "",
  country: a.country || "Philippines",
  latitude: a.latitude ?? null,
  longitude: a.longitude ?? null,
  formatted: a.formatted || "",
  placeId: a.placeId,
  region: a.region || "",
  barangay: a.barangay || "",
  landmark: a.landmark || "",
});

export default function AddressBook() {
  const { user, addAddress, updateAddress, removeAddress, setDefaultAddress } =
    useUserAuth();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<AddressInputType>(EMPTY);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const list = user.addresses || [];

  const startNew = () => {
    setForm({ ...EMPTY });
    setEditingId("new");
  };

  const startEdit = (a: SavedAddress) => {
    setForm(toInput(a));
    setEditingId(a.id);
  };

  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const onAddressChange = (next: PhAddressValue): void =>
    setForm((prev) => ({
      ...prev,
      line1: next.line1,
      line2: prev.line2 || "",
      city: next.city,
      province: next.province || "",
      postalCode: next.postalCode || "",
      country: next.country || prev.country || "Philippines",
      region: next.region,
      barangay: next.barangay,
      landmark: next.landmark || "",
      // Compose the formatted line eagerly so signed-out checkout
      // (which falls back to `formatted` for printable copies) gets a
      // clean string without re-running the joiner.
      formatted: [
        next.line1,
        next.barangay ? `Brgy. ${next.barangay}` : "",
        [next.city, next.province].filter(Boolean).join(", "),
        next.postalCode,
        next.country || "Philippines",
      ]
        .filter(Boolean)
        .join(", "),
    }));

  const submit = async () => {
    if (
      !form.fullName.trim() ||
      !form.line1.trim() ||
      !form.city.trim() ||
      !(form.province || "").trim() ||
      !(form.barangay || "").trim()
    ) {
      toast.error(
        "Recipient, province, city, barangay and street are required",
      );
      return;
    }
    setBusy(true);
    try {
      if (editingId === "new") {
        await addAddress(form);
        toast.success("Address saved");
      } else if (editingId) {
        await updateAddress(editingId, form);
        toast.success("Address updated");
      }
      cancel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("Remove this address?")) return;
    setBusy(true);
    try {
      await removeAddress(id);
      toast.success("Address removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  };

  const onSetDefault = async (id: string) => {
    setBusy(true);
    try {
      await setDefaultAddress(id);
      toast.success("Default address set");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const addressValue: PhAddressValue = {
    line1: form.line1,
    city: form.city,
    province: form.province,
    postalCode: form.postalCode,
    country: form.country,
    region: form.region || "",
    barangay: form.barangay || "",
    landmark: form.landmark || "",
    zone: zoneForRegion(form.region || ""),
  };

  return (
    <section className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <MapPin className="w-4 h-4" /> Saved addresses
        </div>
        {editingId == null && (
          <Button size="sm" variant="outline" onClick={startNew}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add address
          </Button>
        )}
      </div>

      {list.length === 0 && editingId == null && (
        <p className="text-sm text-muted-foreground">
          No saved addresses yet. Add one to skip filling it in at checkout.
        </p>
      )}

      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((a) => {
            const isDefault = user.defaultAddressId === a.id;
            const isEditing = editingId === a.id;
            if (isEditing) return null;
            return (
              <li
                key={a.id}
                className="border border-border/40 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    {a.label || a.fullName}
                    {isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-foreground/10 text-foreground rounded px-1.5 py-0.5">
                        <Star className="w-3 h-3" /> Default
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.fullName}
                    {a.phone ? ` · ${a.phone}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[a.line1, a.barangay ? `Brgy. ${a.barangay}` : "", a.line2]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[a.city, a.province, a.region, a.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                    {a.country ? ` · ${a.country}` : ""}
                  </p>
                  {a.landmark && (
                    <p className="text-xs text-muted-foreground italic">
                      Landmark: {a.landmark}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onSetDefault(a.id)}
                      disabled={busy}
                    >
                      <Star className="w-3.5 h-3.5 mr-1" />
                      Make default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(a)}
                    disabled={busy}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onRemove(a.id)}
                    disabled={busy}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editingId != null && (
        <div className="border border-border/40 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder="Label (Home, Studio…)"
              value={form.label}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, label: e.target.value }))
              }
              className="text-sm"
            />
            <Input
              placeholder="Recipient name *"
              value={form.fullName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fullName: e.target.value }))
              }
              className="text-sm"
            />
            <Input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              className="text-sm sm:col-span-2"
            />
          </div>
          <PhAddressFields value={addressValue} onChange={onAddressChange} />
          <Input
            placeholder="Landmark (e.g. across SM Annex)"
            value={form.landmark || ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, landmark: e.target.value }))
            }
            className="text-sm"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              {editingId === "new" ? "Add address" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
