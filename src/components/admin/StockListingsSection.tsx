import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Star,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  buildImageFields,
  useProducts,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductAvailability,
  type ProductCategory,
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

type StatusFilter = "all" | "available" | "hidden" | "customized";
type SortMode = "default" | "title-asc" | "price-asc" | "price-desc";
type CategoryFilter = "all" | ProductCategory;

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

const effectivePriceFor = (d: DisplayArtwork): number =>
  d.salePrice != null && d.salePrice > 0 && d.salePrice < d.price
    ? d.salePrice
    : d.price;

export function StockListingsSection() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const [edit, setEdit] = useState<EditMode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const overridesByDefaultId = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      if (p.replacesDefaultId) m.set(p.replacesDefaultId, p);
    }
    return m;
  }, [products]);

  const toDisplay = useMemo(
    () =>
      (def: DisplayArtwork): DisplayArtwork => {
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
          description: override.description ?? def.description,
          category: override.category ?? def.category,
          dimensions: override.dimensions ?? def.dimensions,
          images,
          availability: getAvailability(override),
          isCustom: false,
        };
      },
    [overridesByDefaultId],
  );

  const allRows = useMemo(
    () =>
      defaultArtworks.map((def, index) => {
        const override = overridesByDefaultId.get(def.id);
        const display = toDisplay(def);
        return {
          def,
          override,
          display,
          effectivePrice: effectivePriceFor(display),
          defaultIndex: index,
        };
      }),
    [toDisplay, overridesByDefaultId],
  );

  const listings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = allRows.filter((row) => {
      // Status filter. "On storefront" is defined as anything visible to
      // shoppers — so available, reserved, and sold all pass. Only "draft"
      // (explicitly hidden) is excluded, which mirrors the chip count and
      // matches how `getStorefrontArtworks` filters.
      if (statusFilter === "available") {
        if (row.display.availability === "draft") return false;
      } else if (statusFilter === "hidden") {
        if (row.display.availability !== "draft") return false;
      } else if (statusFilter === "customized") {
        if (!row.override) return false;
      }
      // Category filter
      if (categoryFilter !== "all") {
        if (row.display.category !== categoryFilter) return false;
      }
      // Search
      if (q) {
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
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    switch (sortMode) {
      case "title-asc":
        filtered.sort((a, b) => a.display.title.localeCompare(b.display.title));
        break;
      case "price-asc":
        filtered.sort((a, b) => a.effectivePrice - b.effectivePrice);
        break;
      case "price-desc":
        filtered.sort((a, b) => b.effectivePrice - a.effectivePrice);
        break;
      default:
        filtered.sort((a, b) => a.defaultIndex - b.defaultIndex);
    }
    return filtered;
  }, [allRows, searchQuery, statusFilter, categoryFilter, sortMode]);

  const customizedCount = allRows.filter((r) => r.override).length;
  const hiddenCount = allRows.filter(
    (r) => r.display.availability === "draft",
  ).length;

  const visibleIds = useMemo(() => listings.map((r) => r.def.id), [listings]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const hasSelection = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

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

  // Shared helper that flips a default's availability by either creating or
  // updating its override. Returns true on success so bulk callers can count.
  const applyAvailability = async (
    def: DisplayArtwork,
    availability: ProductAvailability,
  ): Promise<boolean> => {
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
      return true;
    } catch {
      return false;
    }
  };

  const setAvailabilityFor = async (
    def: DisplayArtwork,
    availability: ProductAvailability,
  ) => {
    setBusyId(def.id);
    try {
      const ok = await applyAvailability(def, availability);
      if (!ok) {
        toast.error("Could not update listing");
        return;
      }
      toast.success(
        availability === "draft"
          ? `Hid "${def.title}" from the storefront`
          : `Restored "${def.title}" on the storefront`,
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

  const runBulk = async (kind: "hide" | "show" | "revert"): Promise<void> => {
    const targets = allRows.filter((r) => selectedIds.has(r.def.id));
    if (targets.length === 0) return;
    if (kind === "revert") {
      const withOverride = targets.filter((r) => r.override);
      if (withOverride.length === 0) {
        toast.info("None of the selected listings have customizations.");
        return;
      }
      if (
        !window.confirm(
          `Revert ${withOverride.length} customized listing${
            withOverride.length === 1 ? "" : "s"
          }? This cannot be undone.`,
        )
      )
        return;
    }
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const row of targets) {
        if (kind === "hide") {
          if (await applyAvailability(row.display, "draft")) ok++;
          else fail++;
        } else if (kind === "show") {
          if (await applyAvailability(row.display, "available")) ok++;
          else fail++;
        } else if (kind === "revert") {
          if (!row.override) continue;
          try {
            await deleteProduct(row.override.id);
            ok++;
          } catch {
            fail++;
          }
        }
      }
      if (ok > 0) {
        const verb =
          kind === "hide" ? "Hid" : kind === "show" ? "Restored" : "Reverted";
        toast.success(`${verb} ${ok} listing${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) {
        toast.error(`${fail} listing${fail === 1 ? "" : "s"} failed`);
      }
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleResetAll = async () => {
    const overrides = products.filter((p) => p.replacesDefaultId);
    if (overrides.length === 0) {
      toast.info("No stock customizations to reset.");
      return;
    }
    if (
      !window.confirm(
        `Reset ALL ${overrides.length} stock customization${
          overrides.length === 1 ? "" : "s"
        }? Every painting in the stock catalog will revert to its original details. This cannot be undone.`,
      )
    )
      return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const p of overrides) {
        try {
          await deleteProduct(p.id);
          ok++;
        } catch {
          fail++;
        }
      }
      if (ok > 0) {
        toast.success(`Reverted ${ok} customization${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) {
        toast.error(`${fail} could not be reverted`);
      }
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const editProduct =
    edit?.kind === "update" ? edit.product : (edit?.draft ?? null);

  const statusChips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: allRows.length },
    {
      value: "available",
      label: "On storefront",
      count: allRows.length - hiddenCount,
    },
    { value: "hidden", label: "Hidden", count: hiddenCount },
    { value: "customized", label: "Customized", count: customizedCount },
  ];

  return (
    <section>
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            Stock catalog ({listings.length}
            {listings.length !== allRows.length ? ` of ${allRows.length}` : ""})
          </h2>
          <p className="text-xs text-muted-foreground">
            The built-in artworks shown to every visitor. Edit, hide, or revert
            any of them below.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stock catalog…"
            className="h-9 w-56"
          />
          {customizedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleResetAll()}
              disabled={bulkBusy}
              className="gap-1.5 text-destructive hover:text-destructive"
              title="Delete every stock customization and restore the originals"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset all ({customizedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Filter + sort row */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-1 flex-wrap">
          {statusChips.map((chip) => {
            const active = statusFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setStatusFilter(chip.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background/40 border-border/60 hover:bg-accent/60"
                }`}
              >
                {chip.label}
                <span
                  className={`ml-1.5 text-[10px] ${
                    active ? "opacity-80" : "text-muted-foreground"
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
        >
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {PRODUCT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortMode}
          onValueChange={(v) => setSortMode(v as SortMode)}
        >
          <SelectTrigger className="h-9 w-[180px] text-xs gap-1.5">
            <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default order</SelectItem>
            <SelectItem value="title-asc">Title A–Z</SelectItem>
            <SelectItem value="price-asc">Price low → high</SelectItem>
            <SelectItem value="price-desc">Price high → low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {listings.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 px-3 py-2 rounded-md bg-muted/30 border border-border/40">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={() => toggleSelectAllVisible()}
              aria-label="Select all visible"
            />
            {hasSelection
              ? `${selectedIds.size} selected`
              : `Select all ${listings.length}`}
          </label>
          {hasSelection && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runBulk("hide")}
                disabled={bulkBusy}
                className="gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Hide
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runBulk("show")}
                disabled={bulkBusy}
                className="gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Show
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runBulk("revert")}
                disabled={bulkBusy}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Revert
              </Button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-muted-foreground hover:text-foreground underline ml-auto"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/50 bg-card/20 px-4 py-8 text-center text-xs text-muted-foreground">
          No stock listings match the current filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {listings.map(({ def, override, display, effectivePrice }) => {
            const isHidden = display.availability === "draft";
            const busy = busyId === def.id || bulkBusy;
            const hasOverride = Boolean(override);
            const selected = selectedIds.has(def.id);
            return (
              <li
                key={def.id}
                className={`flex gap-4 bg-card/40 border rounded-lg p-3 ${
                  isHidden ? "border-border/40 opacity-70" : "border-border/50"
                } ${selected ? "ring-1 ring-primary/60" : ""}`}
              >
                <div className="flex flex-col items-center gap-2 pt-1">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleSelect(def.id)}
                    aria-label={`Select ${display.title}`}
                  />
                </div>
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
                    {display.category ? ` · ${display.category}` : ""}
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
      )}

      <EditProductDialog
        product={editProduct}
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        onSave={handleSave}
      />
    </section>
  );
}
