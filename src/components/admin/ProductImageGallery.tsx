import { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  PRODUCT_MAX_IMAGES,
  type ProductImage,
} from "@/contexts/ProductContext";
import { compressImage } from "@/lib/imageCompress";

// Original file size cap before compression. The Netlify Functions request
// body is capped at 6 MB, so even though we accept up to 30 MB phone photos
// here, every upload is resized + JPEG-encoded down to under ~800 KB before
// being added to the product.
const MAX_RAW_UPLOAD_BYTES = 30 * 1024 * 1024;

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface Props {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
}

export function ProductImageGallery({ images, onChange }: Props) {
  const addRef = useRef<HTMLInputElement>(null);
  const remaining = Math.max(0, PRODUCT_MAX_IMAGES - images.length);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (files.length > remaining) {
      toast.warning(
        `Up to ${PRODUCT_MAX_IMAGES} images per product — only the first ${remaining} will be added.`,
      );
    }
    const accepted = files.slice(0, remaining);
    const next: ProductImage[] = [];
    for (const file of accepted) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: please select an image file`);
        continue;
      }
      if (file.size > MAX_RAW_UPLOAD_BYTES) {
        toast.error(`${file.name}: must be under 30 MB`);
        continue;
      }
      try {
        const compressed = await compressImage(file);
        next.push({
          url: compressed.url,
          fileName: compressed.fileName,
          bytes: compressed.bytes,
        });
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    if (next.length > 0) onChange([...images, ...next]);
  };

  const removeAt = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {images.map((img, idx) => (
          <div
            key={`${img.url.slice(0, 32)}-${idx}`}
            className="relative aspect-[4/3] border border-border/60 rounded-md overflow-hidden bg-background/40 group"
          >
            <img
              src={img.url}
              alt={img.fileName || `Photo ${idx + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-medium bg-background/85 backdrop-blur rounded">
              {idx === 0 ? "Main" : `Photo ${idx + 1}`}
            </div>
            <div className="absolute top-1 right-1 flex gap-0.5">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="p-1 bg-background/85 backdrop-blur rounded hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Move up"
                title="Move earlier"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === images.length - 1}
                className="p-1 bg-background/85 backdrop-blur rounded hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Move down"
                title="Move later"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="p-1 bg-destructive/90 text-destructive-foreground backdrop-blur rounded hover:bg-destructive"
                aria-label={`Remove photo ${idx + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {(img.fileName || img.bytes) && (
              <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-background/80 backdrop-blur text-[10px] text-muted-foreground truncate">
                {img.fileName}
                {img.bytes ? ` · ${formatBytes(img.bytes)}` : ""}
              </div>
            )}
          </div>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => addRef.current?.click()}
            className="aspect-[4/3] border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors bg-background/40"
          >
            {images.length === 0 ? (
              <>
                <Upload className="w-6 h-6 mb-1" />
                <span className="text-xs">Upload photo (max 30 MB)</span>
              </>
            ) : (
              <>
                <Plus className="w-6 h-6 mb-1" />
                <span className="text-xs">Add photo ({remaining} left)</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={addRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          if (addRef.current) addRef.current.value = "";
        }}
      />

      <p className="text-[11px] text-muted-foreground">
        {images.length} / {PRODUCT_MAX_IMAGES} photos. The first photo is the
        main thumbnail; the second is shown on hover.
      </p>
    </div>
  );
}
