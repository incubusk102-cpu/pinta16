import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import gsap from "gsap";
import {
  Dialog,
  DialogContent,
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
import {
  buildImageFields,
  getProductImages,
  PRODUCT_CATEGORIES,
  PRODUCT_MAX_IMAGES,
  useProducts,
  type Product,
  type ProductAvailability,
  type ProductImage,
  type ProductVideo,
} from "@/contexts/ProductContext";
import { ProductImageGallery } from "@/components/admin/ProductImageGallery";
import { ProductVideoUpload } from "@/components/admin/ProductVideoUpload";
import {
  AVAILABILITY_OPTIONS,
  defaultArtworks,
  getAvailability,
} from "@/lib/artworks";
import { findUploadDuplicate } from "@/lib/imageHash";

interface Props {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Product>) => Promise<void>;
}

export function EditProductDialog({ product, open, onClose, onSave }: Props) {
  const { products } = useProducts();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [year, setYear] = useState("");
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [dimensions, setDimensions] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [description, setDescription] = useState("");
  const [availability, setAvailability] =
    useState<ProductAvailability>("available");
  const [embargoUntil, setEmbargoUntil] = useState("");
  const [video, setVideo] = useState<ProductVideo | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    setImages(getProductImages(product));
    setTitle(product.title);
    setMedium(product.medium);
    setYear(product.year);
    setCategory(product.category || PRODUCT_CATEGORIES[0]);
    setDimensions(product.dimensions || "");
    setPrice(String(product.price));
    setSalePrice(product.salePrice ? String(product.salePrice) : "");
    setDiscountPercent(
      product.salePrice &&
        product.salePrice > 0 &&
        product.salePrice < product.price
        ? String(
            Math.round(
              ((product.price - product.salePrice) / product.price) * 100,
            ),
          )
        : "",
    );
    setDescription(product.description ?? "");
    setAvailability(getAvailability(product));
    // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm` (no tz),
    // not the ISO string we store, so trim trailing seconds + Z.
    setEmbargoUntil(
      product.embargoUntil
        ? product.embargoUntil.replace(/(:\d{2})?\.\d+Z?$/, "").slice(0, 16)
        : "",
    );
    setVideo(product.video);
  }, [product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || saving) return;
    if (images.length === 0)
      return toast.error("Please keep at least one product photo");
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");

    // Block edits that would collide with another gallery entry.
    // Self-exclusion is by `product.id`; the matching default-artwork
    // (when this product `replacesDefaultId` one) is also excluded so
    // re-saving an override doesn't false-positive against itself.
    const trimmedTitle = title.trim();
    const candidateHash = images[0]?.hash;
    const duplicate = findUploadDuplicate(
      { title: trimmedTitle, imageHash: candidateHash },
      [
        ...products.map((p) => ({
          id: p.id,
          title: p.title,
          imageHash: p.imageHash,
        })),
        ...defaultArtworks
          .filter((a) => a.id !== product.replacesDefaultId)
          .map((a) => ({ id: a.id, title: a.title })),
      ],
      product.id,
    );
    if (duplicate) {
      return toast.error(
        duplicate.kind === "title"
          ? `"${duplicate.matchedTitle}" is already in the gallery — pick a different title.`
          : `That image is already in the gallery as "${duplicate.matchedTitle}".`,
      );
    }

    setSaving(true);
    try {
      const salePriceNum = Number(salePrice);
      const effectiveSalePrice =
        salePriceNum > 0 && salePriceNum < priceNum ? salePriceNum : undefined;

      let embargoIso: string | undefined;
      if (embargoUntil) {
        const d = new Date(embargoUntil);
        if (!Number.isNaN(d.getTime())) embargoIso = d.toISOString();
      }
      await onSave(product.id, {
        ...buildImageFields(images),
        title: trimmedTitle,
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        salePrice: effectiveSalePrice,
        description: description.trim(),
        category: category.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        availability,
        embargoUntil: embargoIso,
        // `undefined` means "leave the video field as-is on the existing
        // product"; we deliberately strip a video that was cleared in
        // the UI by writing `undefined` only when there's no `url` AND
        // no `posterUrl` left.
        video: video?.url ? video : undefined,
      });
      toast.success("Product updated");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update product",
      );
    } finally {
      setSaving(false);
    }
  };

  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  // Short GSAP timeline that staggers the dialog header → form
  // sections → footer once the dialog opens. Layered on top of the
  // existing Radix dialog fade so the admin lands in a busy edit
  // form with a brief readable cascade rather than a wall. Reduced
  // motion clients keep the static layout.
  useEffect(() => {
    if (!open) return;
    const host = dialogContentRef.current;
    if (!host) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Stagger header + every form section + footer (which all live
    // as direct children of the form). Picking up `form > *` keeps
    // the cascade automatic — no need to tag every <div> in a long
    // edit form by hand.
    const header = host.querySelector<HTMLElement>("[data-admin-dialog-row]");
    const form = host.querySelector<HTMLElement>("form");
    const formRows = form ? (Array.from(form.children) as HTMLElement[]) : [];
    const rows: HTMLElement[] = [];
    if (header) rows.push(header);
    rows.push(...formRows);
    if (rows.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        rows,
        { autoAlpha: 0, y: 12 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.4,
          ease: "power3.out",
          stagger: 0.04,
          delay: 0.08,
        },
      );
    }, host);
    return () => {
      ctx.revert();
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent
        ref={dialogContentRef}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader data-admin-dialog-row>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">
              Photos{" "}
              <span className="text-muted-foreground font-normal">
                (up to {PRODUCT_MAX_IMAGES})
              </span>
            </Label>
            <ProductImageGallery images={images} onChange={setImages} />
          </div>

          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-medium">Medium</Label>
              <Input
                id="edit-medium"
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                maxLength={60}
              />
            </div>
            <div>
              <Label htmlFor="edit-year">Year</Label>
              <Input
                id="edit-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                maxLength={10}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-dimensions">
                Dimensions{" "}
                <span className="text-muted-foreground font-normal">
                  (e.g. 24 × 30 in)
                </span>
              </Label>
              <Input
                id="edit-dimensions"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                maxLength={60}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-price">Price (₱)</Label>
            <Input
              id="edit-price"
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                const p = Number(e.target.value);
                const d = Number(discountPercent);
                if (p > 0 && d > 0 && d < 100) {
                  setSalePrice(String(Math.round(p * (1 - d / 100))));
                }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-salePrice">
                Sale price (₱){" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="edit-salePrice"
                type="number"
                min="0"
                step="1"
                value={salePrice}
                onChange={(e) => {
                  setSalePrice(e.target.value);
                  const p = Number(price);
                  const s = Number(e.target.value);
                  if (p > 0 && s > 0 && s < p) {
                    setDiscountPercent(String(Math.round(((p - s) / p) * 100)));
                  } else {
                    setDiscountPercent("");
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="edit-discountPercent">
                Discount %{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="edit-discountPercent"
                type="number"
                min="0"
                max="99"
                step="1"
                value={discountPercent}
                onChange={(e) => {
                  setDiscountPercent(e.target.value);
                  const p = Number(price);
                  const d = Number(e.target.value);
                  if (p > 0 && d > 0 && d < 100) {
                    setSalePrice(String(Math.round(p * (1 - d / 100))));
                  } else {
                    setSalePrice("");
                  }
                }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-availability">Availability</Label>
            <Select
              value={availability}
              onValueChange={(value) =>
                setAvailability(value as ProductAvailability)
              }
            >
              <SelectTrigger id="edit-availability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Draft hides the product from the public storefront.
            </p>
          </div>

          <div>
            <Label htmlFor="edit-embargo">VIP early-access embargo</Label>
            <Input
              id="edit-embargo"
              type="datetime-local"
              value={embargoUntil}
              onChange={(e) => setEmbargoUntil(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              While set, only customers on the VIP early-access list can see
              this piece. After the time, it goes public automatically. Leave
              blank to disable.
            </p>
          </div>

          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
            />
          </div>

          <div>
            <Label className="mb-2 block">
              Studio video{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <ProductVideoUpload value={video} onChange={setVideo} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Adds a "play" tile to the photo gallery on this product's page.
              Visitors click it to watch the video inline.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
