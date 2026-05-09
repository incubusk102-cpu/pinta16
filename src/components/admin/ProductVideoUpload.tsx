import { useRef, useState } from "react";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductVideo } from "@/contexts/ProductContext";
import { uploadVideoToR2 } from "@/lib/uploadVideo";

// Hard cap mirrors the server-side cap in
// `functions/api/video-uploads.js`. Picking the same number here lets
// us reject over-sized files before kicking off a multi-second upload.
const MAX_RAW_UPLOAD_BYTES = 50 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
]);

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface Props {
  value: ProductVideo | undefined;
  onChange: (next: ProductVideo | undefined) => void;
}

export function ProductVideoUpload({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error(
        "Pick an MP4, WebM, MOV, or OGG file. Other formats won't play in every browser.",
      );
      return;
    }
    if (file.size > MAX_RAW_UPLOAD_BYTES) {
      toast.error(
        `${file.name} is ${formatBytes(file.size)}. Videos must be under ${Math.round(MAX_RAW_UPLOAD_BYTES / 1024 / 1024)} MB. Host larger files externally and paste the URL instead.`,
      );
      return;
    }
    setUploading(true);
    try {
      const outcome = await uploadVideoToR2(file);
      if (outcome.kind === "uploaded") {
        onChange({
          url: outcome.result.url,
          fileName: file.name,
          bytes: outcome.result.bytes,
          mimeType: outcome.result.contentType,
          // Keep any poster URL the admin already typed in.
          posterUrl: value?.posterUrl,
        });
        toast.success("Video uploaded");
      } else if (outcome.kind === "fallback") {
        toast.error(
          "R2 video storage isn't configured on this deploy. Host the video externally (Mux, Cloudinary, R2 dashboard) and paste its public URL into the URL field below.",
        );
      } else {
        toast.error(`Upload failed: ${outcome.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    onChange(undefined);
  };

  const setPosterUrl = (next: string) => {
    if (!value) {
      // Allow editing the poster URL even before a video is attached
      // — admin might want to seed it first. We store as a "URL-only"
      // ProductVideo (empty `url`) and let the parent decide whether
      // to persist or strip it on submit.
      if (next.trim()) {
        onChange({ url: "", posterUrl: next });
      }
      return;
    }
    onChange({ ...value, posterUrl: next });
  };

  const setVideoUrl = (next: string) => {
    if (!next.trim()) {
      // Clearing the URL of a pasted (non-uploaded) entry just removes
      // the video. Uploaded entries should be cleared via the trash
      // button so the admin sees the explicit destructive action.
      if (!value || !value.fileName) {
        onChange(
          value?.posterUrl
            ? { url: "", posterUrl: value.posterUrl }
            : undefined,
        );
      }
      return;
    }
    onChange({
      ...(value ?? {}),
      url: next,
      // Pasted URLs don't carry server-known size or content-type.
      // Drop any stale upload metadata so the UI reflects "external
      // URL" instead of "uploaded".
      fileName: undefined,
      bytes: undefined,
      mimeType: undefined,
    });
  };

  const hasVideo = Boolean(value?.url);

  return (
    <div className="space-y-3">
      <div className="border border-dashed border-border rounded-md p-3 bg-background/40">
        {hasVideo ? (
          <div className="space-y-2">
            <div className="aspect-video w-full max-w-sm bg-black/80 rounded-sm overflow-hidden">
              <video
                key={value!.url}
                src={value!.url}
                poster={value!.posterUrl || undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground truncate min-w-0">
                {value!.fileName ? (
                  <>
                    <Film className="inline w-3 h-3 mr-1 -mt-0.5" />
                    {value!.fileName}
                    {value!.bytes ? ` · ${formatBytes(value!.bytes)}` : ""}
                  </>
                ) : (
                  <>External URL</>
                )}
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full aspect-video rounded-sm flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 disabled:cursor-progress"
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 mb-1 animate-spin" />
                <span className="text-xs">Uploading…</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 mb-1" />
                <span className="text-xs">
                  Upload video (MP4 / WebM / MOV, max 50 MB)
                </span>
                <span className="text-[10px] mt-1 text-muted-foreground/70">
                  Or paste a URL below
                </span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/ogg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="video-url" className="text-xs">
            Video URL
          </Label>
          <Input
            id="video-url"
            type="url"
            inputMode="url"
            placeholder="https://your-cdn.com/process.mp4"
            value={value?.url ?? ""}
            onChange={(e) => setVideoUrl(e.target.value)}
            disabled={uploading}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Auto-filled when you upload a file. Or paste a public mp4/webm URL
            hosted elsewhere.
          </p>
        </div>
        <div>
          <Label htmlFor="video-poster" className="text-xs">
            Poster image URL{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="video-poster"
            type="url"
            inputMode="url"
            placeholder="https://your-cdn.com/poster.jpg"
            value={value?.posterUrl ?? ""}
            onChange={(e) => setPosterUrl(e.target.value)}
            disabled={uploading}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Shown on the play tile and while the video buffers. Falls back to
            the main product photo if blank.
          </p>
        </div>
      </div>
    </div>
  );
}
