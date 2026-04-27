import { useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  buildImageFields,
  useProducts,
  type Product,
  type ProductAvailability,
} from "@/contexts/ProductContext";
import {
  AVAILABILITY_LABEL,
  defaultArtworks,
  getAvailability,
  type DisplayArtwork,
} from "@/lib/artworks";
import { EditProductDialog } from "@/components/admin/EditProductDialog";

type EditMode =
  | { kind: "update"; product: Product }
  | { kind: "create-override"; draft: Product; defaultId: string };

const buildDraftFromDefault = (def: DisplayArtwork): Product => {
  const now = new Date().toISOString();
  const imageFields = buildImageFields(def.images);
  return {
    ...imageFields,
    id: `override-draft-${def.id}`,
    createdAt: now,
    title: def.title,
    medium: def.medium,
    year: def.year,
    price: def.price,
    salePrice: def.salePrice,
    description: def.description,
    category: def.category,
    dimensions: def.dimensions,
    availability: def.availability,
    replacesDefaultId: def.id,
  };
};

export function StockListingsSection() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const [edit, setEdit] = useState<EditMode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const overridesByDefaultId = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      if (p.replacesDefaultId) m.set(p.replacesDefaultId, p);
    }
    return m;
  }, [products]);

  const toDisplay = (def: DisplayArtwork): DisplayArtwork => {
    const override = overridesByDefaultId.get(def.id);
    if (!override) return def;
    const images =
      override.images && override.images.length > 0
        ? override.images
        : def.images;
    return {
      id: def.id,
      image: override.image || def.image,
      mockup: override.mockup || def.mockup,
      title: override.title || def.title,
      medium: override.medium || def.medium,
      year: override.year || def.year,
      price: override.price ?? def.price,
      salePrice: override.salePrice ?? def.salePrice,
      description: override.description || def.description,
      category: override.category ?? def.category,
      dimensions: override.dimensions ?? def.dimensions,
      images,
      availability: getAvailability(override),
      isCustom: false,
    };
  };

  const listings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return defaultArtworks
      .map((def) => {
        const override = overridesByDefaultId.get(def.id);
        const display = toDisplay(def);
        const effectivePrice =
          display.salePrice != null &&
          display.salePrice > 0 &&
          display.salePrice < display.price
            ? display.salePrice
            : display.price;
        return { def, override, display, effectivePrice };
      })
      .filter((row) => {
        if (!q) return true;
        const haystack = [
          row.display.title,
          row.display.medium,
          row.display.year,
          row.display.category,
          row.display.description,
          row.def.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, overridesByDefaultId]);

  const handleEdit = (def: DisplayArtwork) => {
    const override = overridesByDefaultId.get(def.id);
    if (override) {
      setEdit({ kind: "update", product: override });
    } else {
      setEdit({
        kind: "create-override",
        draft: buildDraftFromDefault(def),
        defaultId: def.id,
      });
    }
  };

  const handleSave = async (
    _id: string,
    updates: Partial<Product>,
  ): Promise<void> => {
    if (!edit) return;
    if (edit.kind === "update") {
      await updateProduct(edit.product.id, updates);
    } else {
      const { draft, defaultId } = edit;
      const payload: Omit<Product, "id" | "createdAt"> = {
        image: draft.image,
        mockup: draft.mockup,
        title: draft.title,
        medium: draft.medium,
        year: draft.year,
        price: draft.price,
        salePrice: draft.salePrice,
        description: draft.description,
        category: draft.category,
        dimensions: draft.dimensions,
        images: draft.images,
        imageFileName: draft.imageFileName,
        imageBytes: draft.imageBytes,
        mockupFileName: draft.mockupFileName,
        mockupBytes: draft.mockupBytes,
        availability: draft.availability,
        replacesDefaultId: defaultId,
        ...updates,
      };
      await addProduct(payload);
    }
  };

  const setAvailabilityFor = async (
    def: DisplayArtwork,
    availability: ProductAvailability,
  ) => {
    setBusyId(def.id);
    try {
      const override = overridesByDefaultId.get(def.id);
      if (override) {
        await updateProduct(override.id, { availability });
      } else {
        const draft = buildDraftFromDefault(def);
        const { id: _ignoredId, createdAt: _ignoredCreated, ...rest } = draft;
        void _ignoredId;
        void _ignoredCreated;
        await addProduct({ ...rest, availability });
      }
      toast.success(
        availability === "draft"
          ? `Hid "${def.title}" from the storefront`
          : `Restored "${def.title}" on the storefront`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update listing",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRestoreDefault = async (def: DisplayArtwork) => {
    const override = overridesByDefaultId.get(def.id);
    if (!override) return;
    if (
      !window.confirm(
        `Revert "${def.title}" to its original stock details? Your customizations will be removed.`,
      )
    ) {
      return;
    }
    setBusyId(def.id);
    try {
      await deleteProduct(override.id);
      toast.success(`Reverted "${def.title}" to the default`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not revert listing",
      );
    } finally {
      setBusyId(null);
    }
  };

  const editProduct =
    edit?.kind === "update" ? edit.product : (edit?.draft ?? null);

  return (
    <section>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            Stock catalog ({listings.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            The built-in artworks shown to every visitor. Edit, hide, or revert
            any of them below.
          </p>
        </div>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search stock catalog…"
          className="h-9 w-56"
        />
      </div>

      <ul className="space-y-3">
        {listings.map(({ def, override, display, effectivePrice }) => {
          const isHidden = display.availability === "draft";
          const busy = busyId === def.id;
          const hasOverride = Boolean(override);
          return (
            <li
              key={def.id}
              className={`flex gap-4 bg-card/40 border rounded-lg p-3 ${
                isHidden ? "border-border/40 opacity-70" : "border-border/50"
              }`}
            >
              <div className="flex-shrink-0">
                <img
                  src={display.image}
                  alt={display.title}
                  className="w-24 h-24 object-cover rounded-md"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium truncate">{display.title}</h3>
                  {hasOverride && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-primary/15 text-primary">
                      Customized
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded ${
                      display.availability === "available"
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : display.availability === "reserved"
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                          : display.availability === "sold"
                            ? "bg-slate-700 text-white"
                            : "bg-muted text-foreground"
                    }`}
                  >
                    {AVAILABILITY_LABEL[display.availability]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {display.medium} · {display.year}
                  {display.dimensions ? ` · ${display.dimensions}` : ""}
                </p>
                <p className="text-sm font-semibold mt-1">
                  {display.salePrice != null &&
                  display.salePrice > 0 &&
                  display.salePrice < display.price ? (
                    <>
                      <span className="line-through text-muted-foreground font-normal mr-1">
                        ₱{display.price.toLocaleString()}
                      </span>
                      <span>₱{effectivePrice.toLocaleString()}</span>
                    </>
                  ) : (
                    <>₱{display.price.toLocaleString()}</>
                  )}
                </p>
                {display.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {display.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(display)}
                  disabled={busy}
                  aria-label={`Edit ${display.title}`}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                {isHidden ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      void setAvailabilityFor(display, "available")
                    }
                    disabled={busy}
                    aria-label={`Show ${display.title}`}
                    title="Show on storefront"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void setAvailabilityFor(display, "draft")}
                    disabled={busy}
                    aria-label={`Hide ${display.title}`}
                    title="Hide from storefront"
                  >
                    <EyeOff className="w-4 h-4" />
                  </Button>
                )}
                {hasOverride && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleRestoreDefault(display)}
                    disabled={busy}
                    aria-label={`Revert ${display.title} to default`}
                    title="Revert to default"
                  >
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <EditProductDialog
        product={editProduct}
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        onSave={handleSave}
      />
    </section>
  );
}
