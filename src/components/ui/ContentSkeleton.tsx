import { Skeleton } from "@/components/ui/skeleton";

// Shared "content placeholder" rendered while a lazily-loaded
// storefront section is still resolving. Replaces the bare
// `<Suspense fallback={null}>` slots on routes whose primary
// content is code-split (about / contact / collection rails) so
// shoppers see a layout-shape hint instead of a blank gap during
// chunk hydration.
//
// Two variants:
//   - "article" (default): vertical stack of text-block placeholders.
//     Mimics the typography rhythm of editorial sections like About /
//     Contact / Resources.
//   - "grid": responsive 2- or 3-column grid of card placeholders,
//     suitable for product / gallery rails such as `/collection`.
//
// Reuses the GSAP-driven `<Skeleton />` primitive so the shimmer
// ticker stays consistent with the rest of the site (admin lists,
// product cards, etc.).

export interface ContentSkeletonProps {
  variant?: "article" | "grid";
  rows?: number;
  className?: string;
  label?: string;
}

export function ContentSkeleton({
  variant = "article",
  rows = 3,
  className,
  label = "Loading content",
}: ContentSkeletonProps) {
  if (variant === "grid") {
    const count = Math.max(2, rows);
    return (
      <section
        role="status"
        aria-live="polite"
        aria-label={label}
        className={className ?? "px-4 sm:px-6 md:px-12 max-w-7xl mx-auto py-10"}
      >
        <Skeleton className="h-7 w-48 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[3/4] w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </section>
    );
  }

  const articleRows = Math.max(1, rows);
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={label}
      className={
        className ??
        "px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-12 sm:py-16 space-y-6"
      }
    >
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: articleRows }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </section>
  );
}

export default ContentSkeleton;
