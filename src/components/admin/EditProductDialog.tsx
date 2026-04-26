import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  type Product,
  type ProductAvailability,
  type ProductImage,
} from "@/contexts/ProductContext";
import { ProductImageGallery } from "@/components/admin/ProductImageGallery";
import { AVAILABILITY_OPTIONS, getAvailability } from "@/lib/artworks";

interface Props {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Product>) => Promise<void>;
}

export function EditProductDialog({ product, open, onClose, onSave }: Props) {
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
  }, [product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || saving) return;
    if (images.length === 0)
      return toast.error("Please keep at least one painting photo");
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");

    setSaving(true);
    try {
      const salePriceNum = Number(salePrice);
      const effectiveSalePrice =
        salePriceNum > 0 && salePriceNum < priceNum ? salePriceNum : undefined;

      await onSave(product.id, {
        ...buildImageFields(images),
        title: title.trim(),
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        salePrice: effectiveSalePrice,
        description: description.trim(),
        category: category.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        availability,
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

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
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
              Draft hides the painting from the public storefront.
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
