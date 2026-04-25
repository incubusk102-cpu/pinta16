import { useState } from "react";
import { Star, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  REVIEW_MIN_CHARS,
  REVIEW_MAX_IMAGES,
  type OrderReview,
  useCart,
} from "@/contexts/CartContext";

interface OrderReviewFormProps {
  orderId: string;
  customerEmail?: string;
  onSubmitted?: (review: OrderReview) => void;
}

const MAX_IMAGE_BYTES = 600 * 1024;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const OrderReviewForm = ({
  orderId,
  customerEmail,
  onSubmitted,
}: OrderReviewFormProps) => {
  const { submitOrderReview } = useCart();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const charCount = text.length;
  const charsLeft = Math.max(0, REVIEW_MIN_CHARS - charCount);
  const canSubmit =
    rating >= 1 && rating <= 5 && charCount >= REVIEW_MIN_CHARS && !submitting;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = REVIEW_MAX_IMAGES - images.length;
    const files = Array.from(fileList).slice(0, remaining);
    const newImages: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: not an image`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name}: must be under 600KB`);
        continue;
      }
      try {
        newImages.push(await fileToDataUrl(file));
      } catch {
        toast.error(`${file.name}: could not read`);
      }
    }
    if (newImages.length) setImages((prev) => [...prev, ...newImages]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const review: OrderReview = {
      rating,
      text: text.trim(),
      images,
      submittedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit-review", orderId, review }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      submitOrderReview(orderId, review);
      toast.success("Thanks for your review!");
      onSubmitted?.(review);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not submit review",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 bg-muted/30 border border-border/10 rounded-sm space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-muted-foreground" />
        <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
          Share your experience
        </p>
      </div>
      {customerEmail && (
        <p className="font-body text-[10px] text-muted-foreground">
          Reviewing as {customerEmail}
        </p>
      )}

      {/* Stars */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = (hoverRating || rating) >= n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="p-1 transition-transform hover:scale-110"
            >
              <Star
                className={`w-6 h-6 ${
                  filled
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          );
        })}
        <span className="ml-2 font-body text-xs text-muted-foreground">
          {rating > 0 ? `${rating}/5` : "Tap to rate"}
        </span>
      </div>

      {/* Textarea */}
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 5000))}
          rows={6}
          placeholder={`Tell us about your painting, the artist's craftsmanship, packaging and delivery experience. Minimum ${REVIEW_MIN_CHARS} characters.`}
          className="w-full px-3 py-2 bg-background border border-border/30 text-foreground font-body text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors rounded-sm resize-none"
        />
        <div className="flex justify-between mt-1">
          <p
            className={`font-body text-[10px] ${
              charCount >= REVIEW_MIN_CHARS
                ? "text-muted-foreground"
                : "text-destructive"
            }`}
          >
            {charsLeft > 0
              ? `${charsLeft} more character${charsLeft === 1 ? "" : "s"} needed`
              : "Minimum length reached"}
          </p>
          <p className="font-body text-[10px] text-muted-foreground">
            {charCount}/{REVIEW_MIN_CHARS}+
          </p>
        </div>
      </div>

      {/* Images */}
      <div>
        <label className="font-body text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
          <Upload className="w-3.5 h-3.5" /> Photos (optional, up to{" "}
          {REVIEW_MAX_IMAGES})
        </label>
        <div className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
            <div
              key={i}
              className="relative aspect-square bg-muted/20 border border-border/20 rounded-sm overflow-hidden"
            >
              <img
                src={src}
                alt={`Review image ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setImages((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="absolute top-1 right-1 p-1 bg-background/80 hover:bg-background rounded-full"
                aria-label="Remove image"
              >
                <X className="w-3 h-3 text-foreground" />
              </button>
            </div>
          ))}
          {images.length < REVIEW_MAX_IMAGES && (
            <label className="aspect-square flex flex-col items-center justify-center gap-1 border border-dashed border-border/40 rounded-sm cursor-pointer hover:border-foreground/30 hover:bg-accent/20 transition-colors">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="font-body text-[10px] text-muted-foreground">
                Add photo
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <p className="font-body text-[10px] text-muted-foreground mt-1">
          Max 600KB each, JPG/PNG/WEBP/GIF
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
        className="w-full py-3 bg-foreground text-background font-body text-xs tracking-[0.3em] uppercase hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 rounded-sm flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
          </>
        ) : (
          "Submit Review"
        )}
      </button>
    </div>
  );
};

export default OrderReviewForm;
