import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
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
import { PRODUCT_CATEGORIES, type Product } from "@/contexts/ProductContext";

interface ImageMeta {
  fileName: string;
  bytes: number;
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

interface Props {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Product>) => Promise<void>;
}

export function EditProductDialog({ product, open, onClose, onSave }: Props) {
  const [image, setImage] = useState("");
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);
  const [mockup, setMockup] = useState("");
  const [mockupMeta, setMockupMeta] = useState<ImageMeta | null>(null);
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [year, setYear] = useState("");
  const [category, setCategory] = useState("Abstract");
  const [dimensions, setDimensions] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const mockupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setImage(product.image);
    setImageMeta(
      product.imageFileName
        ? {
            fileName: product.imageFileName,
            bytes: product.imageBytes ?? 0,
          }
        : null,
    );
    setMockup(product.mockup ?? "");
    setMockupMeta(
      product.mockupFileName
        ? {
            fileName: product.mockupFileName,
            bytes: product.mockupBytes ?? 0,
          }
        : null,
    );
    setTitle(product.title);
    setMedium(product.medium);
    setYear(product.year);
    setCategory(product.category || "Abstract");
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
  }, [product]);

  const handleImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void,
    metaSetter: (meta: ImageMeta | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return toast.error("Please select an image file");
    if (file.size > 5 * 1024 * 1024)
      return toast.error("Image must be under 5MB");
    try {
      setter(await fileToDataUrl(file));
      metaSetter({ fileName: file.name, bytes: file.size });
    } catch {
      toast.error("Could not read image");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || saving) return;
    if (!image) return toast.error("Please attach a painting image");
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");

    setSaving(true);
    try {
      const salePriceNum = Number(salePrice);
      const effectiveSalePrice =
        salePriceNum > 0 && salePriceNum < priceNum ? salePriceNum : undefined;

      await onSave(product.id, {
        image,
        mockup: mockup || undefined,
        title: title.trim(),
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        salePrice: effectiveSalePrice,
        description: description.trim(),
        category: category.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        imageFileName: imageMeta?.fileName,
        imageBytes: imageMeta?.bytes,
        mockupFileName: mockup ? mockupMeta?.fileName : undefined,
        mockupBytes: mockup ? mockupMeta?.bytes : undefined,
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
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">Painting image</Label>
              <label className="flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/60 transition-colors overflow-hidden bg-background/40">
                {image ? (
                  <img
                    src={image}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-muted-foreground p-6">
                    <Upload className="w-7 h-7 mx-auto mb-2" />
                    <p className="text-sm">Replace image</p>
                  </div>
                )}
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleImage(e, setImage, setImageMeta)}
                />
              </label>
              {imageMeta && (
                <p
                  className="text-[11px] text-muted-foreground mt-1 truncate"
                  title={imageMeta.fileName}
                >
                  {imageMeta.fileName}
                  {imageMeta.bytes ? ` · ${formatBytes(imageMeta.bytes)}` : ""}
                </p>
              )}
            </div>
            <div>
              <Label className="mb-2 block">
                Room mockup{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <label className="flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/60 transition-colors overflow-hidden bg-background/40">
                {mockup ? (
                  <img
                    src={mockup}
                    alt="mockup preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-muted-foreground p-6">
                    <Upload className="w-7 h-7 mx-auto mb-2" />
                    <p className="text-sm">Add a room preview</p>
                  </div>
                )}
                <input
                  ref={mockupRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    void handleImage(e, setMockup, setMockupMeta)
                  }
                />
              </label>
              {mockup && mockupMeta && (
                <p
                  className="text-[11px] text-muted-foreground mt-1 truncate"
                  title={mockupMeta.fileName}
                >
                  {mockupMeta.fileName}
                  {mockupMeta.bytes
                    ? ` · ${formatBytes(mockupMeta.bytes)}`
                    : ""}
                </p>
              )}
              {mockup && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMockup("");
                    setMockupMeta(null);
                  }}
                  className="mt-2 text-xs"
                >
                  Remove mockup
                </Button>
              )}
            </div>
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
                  <SelectValue placeholder="Choose a category" />
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
                  (optional)
                </span>
              </Label>
              <Input
                id="edit-dimensions"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                maxLength={40}
                placeholder="e.g. 24 × 30 in"
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
