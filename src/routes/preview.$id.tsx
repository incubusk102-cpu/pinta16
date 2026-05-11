import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import GalleryNav from "@/components/GalleryNav";
import { safeHref } from "@/lib/safeUrl";
import { useSEO } from "@/hooks/useSEO";

export const Route = createFileRoute("/preview/$id")({
  component: PreviewPage,
  head: ({ params }) => ({
    meta: [
      { title: `Painting preview — Canvas Hub` },
      {
        name: "description",
        content:
          "Preview a painting featured in your Canvas Hub welcome email.",
      },
      // Email-only teaser pages aren't part of the storefront catalogue, so
      // we don't want them indexed.
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Painting preview — Canvas Hub` },
      {
        property: "og:url",
        content: `/preview/${params.id}`,
      },
    ],
  }),
});

interface CustomItem {
  id: string;
  imageUrl: string;
  title: string;
  price: number;
  description: string;
}

interface WelcomePreviewPayload {
  customItems?: CustomItem[];
  showPrice?: boolean;
  ctaLabel?: string;
  ctaUrl?: string;
}

const formatPHP = (n: number): string =>
  `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

function PreviewPage() {
  const { id } = Route.useParams();
  useSEO({
    title: "Painting preview — Canvas Hub",
    description:
      "Preview a painting featured in your Canvas Hub welcome email.",
    canonicalPath: `/preview/${id}`,
    noindex: true,
  });
  const [data, setData] = useState<WelcomePreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront-config");
        if (!res.ok) return;
        const json = (await res.json()) as {
          config?: { welcomeEmailPreview?: WelcomePreviewPayload };
        };
        if (cancelled) return;
        setData(json?.config?.welcomeEmailPreview ?? null);
      } catch {
        /* fall through to "not found" */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const item = (data?.customItems ?? []).find((it) => it.id === id) ?? null;
  const showPrice = data?.showPrice !== false;
  const ctaLabel = data?.ctaLabel?.trim() || "Browse the collection";
  // Email CTA may be absolute (https://canvhub.com/) — treat any same-origin
  // URL as an internal route so the SPA router handles it without a reload.
  // The shared `safeHref` helper rejects `javascript:` / `data:` /
  // schemeless `//evil.com` so a stale welcome-email payload can't smuggle
  // a dangerous protocol into the external CTA branch below.
  const safeCta = safeHref(data?.ctaUrl ?? "");
  const ctaIsInternal =
    !safeCta ||
    /^https?:\/\/(?:www\.)?canvhub\.com(?:\/|$)/i.test(safeCta) ||
    /^\/[^/]/.test(safeCta) ||
    safeCta === "/";
  const ctaHref = ctaIsInternal ? "/" : safeCta;

  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to the collection
        </Link>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="aspect-square rounded-lg bg-card/30 animate-pulse" />
            <div className="space-y-3">
              <div className="h-8 bg-card/30 rounded animate-pulse w-3/4" />
              <div className="h-5 bg-card/30 rounded animate-pulse w-1/3" />
              <div className="h-24 bg-card/30 rounded animate-pulse" />
            </div>
          </div>
        ) : !item ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-card/40 mb-4">
              <ImageIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <h1 className="font-display text-2xl mb-2">Preview unavailable</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              This painting may have been removed from the welcome email or the
              link may be out of date. Browse the collection to see what's
              currently available.
            </p>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Browse the collection
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
            <div className="rounded-lg overflow-hidden bg-card/30 border border-border/60">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title || "Painting"}
                  className="w-full h-auto block"
                />
              ) : (
                <div className="aspect-square flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  From the collection
                </p>
                <h1 className="font-display text-3xl sm:text-4xl leading-tight">
                  {item.title || "Untitled"}
                </h1>
                {showPrice && item.price > 0 && (
                  <p className="mt-3 text-lg text-foreground/80">
                    {formatPHP(item.price)}
                  </p>
                )}
              </div>
              {item.description && (
                <p className="text-sm sm:text-base text-foreground/80 leading-relaxed whitespace-pre-line">
                  {item.description}
                </p>
              )}
              <div className="pt-4 border-t border-border/60">
                <p className="text-xs text-muted-foreground mb-3">
                  Like what you see? Browse the rest of the collection on the
                  storefront.
                </p>
                {ctaIsInternal ? (
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {ctaLabel}
                  </Link>
                ) : (
                  <a
                    href={ctaHref}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {ctaLabel}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
