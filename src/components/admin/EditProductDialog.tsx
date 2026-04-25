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
import { toast } from "sonner";
import type { Product } from "@/contexts/ProductContext";

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
  const [mockup, setMockup] = useState("");
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [year, setYear] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const mockupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setImage(product.image);
    setMockup(product.mockup ?? "");
    setTitle(product.title);
    setMedium(product.medium);
    setYear(product.year);
    setPrice(String(product.price));
    setDescription(product.description ?? "");
  }, [product]);

  const handleImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return toast.error("Please select an image file");
    if (file.size > 5 * 1024 * 1024)
      return toast.error("Image must be under 5MB");
    try {
      setter(await fileToDataUrl(file));
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
      await onSave(product.id, {
        image,
        mockup: mockup || undefined,
        title: title.trim(),
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        description: description.trim(),
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
                  onChange={(e) => void handleImage(e, setImage)}
                />
              </label>
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
                  onChange={(e) => void handleImage(e, setMockup)}
                />
              </label>
              {mockup && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMockup("")}
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

          <div>
            <Label htmlFor="edit-price">Price (₱)</Label>
            <Input
              id="edit-price"
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
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
