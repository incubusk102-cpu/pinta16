import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useProducts } from "@/contexts/ProductContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Trash2, Upload, ArrowLeft, Plus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin — Pintaterra" },
      {
        name: "description",
        content: "Upload and manage paintings in your gallery.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AdminPage() {
  const { products, addProduct, deleteProduct } = useProducts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mockupInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string>("");
  const [mockup, setMockup] = useState<string>("");
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("Acrylic on Canvas");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const readImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
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

  const reset = () => {
    setImage("");
    setMockup("");
    setTitle("");
    setMedium("Acrylic on Canvas");
    setYear(String(new Date().getFullYear()));
    setPrice("");
    setDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (mockupInputRef.current) mockupInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) return toast.error("Please upload a painting image");
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");

    setSubmitting(true);

    try {
      await addProduct({
        image,
        mockup: mockup || undefined,
        title: title.trim(),
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        description: description.trim(),
      });
      toast.success(`"${title.trim()}" added to the collection`);
      reset();
    } catch {
      toast.error("Could not save product");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (productId: string, productTitle: string) => {
    setDeletingId(productId);

    try {
      await deleteProduct(productId);
      toast.success(`Removed "${productTitle}"`);
    } catch {
      toast.error("Could not remove product");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b border-border/50 bg-card/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to site
            </Link>
            <span className="text-border">|</span>
            <h1 className="font-display text-xl">Admin · Products</h1>
          </div>
          <span className="text-xs text-muted-foreground">
            {products.length} uploaded
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[1fr_1.2fr] gap-10">
        <section className="bg-card/40 border border-border/60 rounded-xl p-6 h-fit lg:sticky lg:top-24">
          <div className="flex items-center gap-2 mb-6">
            <Plus className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg">Upload a painting</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="image" className="mb-2 block">
                Painting image
              </Label>
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
                    <p className="text-sm">Click to upload (max 5MB)</p>
                  </div>
                )}
                <input
                  id="image"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => readImage(e, setImage)}
                />
              </label>
            </div>

            <div>
              <Label htmlFor="mockup" className="mb-2 block">
                Room mockup{" "}
                <span className="text-muted-foreground font-normal">
                  (optional, shown on hover)
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
                    <p className="text-sm">Upload a room preview</p>
                  </div>
                )}
                <input
                  id="mockup"
                  ref={mockupInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => readImage(e, setMockup)}
                />
              </label>
            </div>

            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="e.g. Mayon at Sunrise"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="medium">Medium</Label>
                <Input
                  id="medium"
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  maxLength={10}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="price">Price (₱)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="3499"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="A short story about the piece..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Adding..." : "Add to gallery"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={submitting}
              >
                Reset
              </Button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="font-display text-lg mb-4">Your uploads</h2>
          {products.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              No uploaded products yet. Add your first painting on the left.
            </div>
          ) : (
            <ul className="space-y-3">
              {products.map((product) => {
                const isDeleting = deletingId === product.id;

                return (
                  <li
                    key={product.id}
                    className="flex gap-4 bg-card/40 border border-border/50 rounded-lg p-3"
                  >
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{product.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {product.medium} · {product.year}
                      </p>
                      <p className="text-sm font-semibold mt-1">
                        ₱{product.price.toLocaleString()}
                      </p>
                      {product.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isDeleting}
                      onClick={() =>
                        void handleDelete(product.id, product.title)
                      }
                      aria-label={`Delete ${product.title}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
