import { lazy, Suspense } from "react";
import {
  Link,
  createFileRoute,
  notFound,
  useParams,
} from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import { useSEO } from "@/hooks/useSEO";

// Per-slug lazy imports: each article ships as its own JS chunk, so a
// reader landing directly on `/resources/canvas-care` only pays for
// that article's bundle, not the whole `/resources` library. Define
// each `lazy()` at module scope so React sees a stable component
// identity and the `react-hooks/static-components` lint rule is happy.
const LazyCanvasCare = lazy(
  () => import("@/components/resources/CanvasCareArticle"),
);
const LazyFraming = lazy(() => import("@/components/resources/FramingArticle"));
const LazyHanging = lazy(() => import("@/components/resources/HangingArticle"));
const LazyHumidity = lazy(
  () => import("@/components/resources/HumidityArticle"),
);
const LazyBuying = lazy(() => import("@/components/resources/BuyingArticle"));
const LazyRoomPairing = lazy(
  () => import("@/components/resources/RoomPairingArticle"),
);

const ARTICLE_SLUGS = [
  "canvas-care",
  "framing-original-paintings",
  "hanging-art-gallery-style",
  "humidity-and-storage",
  "buying-art-as-investment",
  "choosing-art-for-every-room",
] as const;

type ArticleSlug = (typeof ARTICLE_SLUGS)[number];

const isArticleSlug = (value: string): value is ArticleSlug =>
  (ARTICLE_SLUGS as readonly string[]).includes(value);

// SEO copy kept next to the loader map so a new article + its
// metadata can be added in one place. `title` + `description` feed
// the document head AND the OG card.
const ARTICLE_META: Record<
  ArticleSlug,
  { title: string; description: string }
> = {
  "canvas-care": {
    title: "Caring for original canvas paintings — Canvas Hub",
    description:
      "A long-form care guide for original canvas paintings: dusting routines, cleaning mistakes to avoid, when to call a conservator, and how Philippine humidity affects the paint film.",
  },
  "framing-original-paintings": {
    title: "A framer's guide to original canvas — Canvas Hub",
    description:
      "Float frames vs. moulding frames, oil-painting air gaps, rabbet depth, archival backing, and why pressure-fitting a stretched canvas is a decade-delayed disaster.",
  },
  "hanging-art-gallery-style": {
    title: "Hanging art at gallery height — Canvas Hub",
    description:
      "The 57-inch convention, sofa-line adjustments, multi-piece clusters, picture lights, LED colour temperature, and why most living rooms hang art six inches too high.",
  },
  "humidity-and-storage": {
    title: "Humidity, climate, and long-term storage — Canvas Hub",
    description:
      "Tropical-climate storage techniques for original paintings: glassine wrapping, the typhoon-season exterior-wall rule, and how to crate a painting for a six-month move.",
  },
  "buying-art-as-investment": {
    title: "Buying original art as investment — Canvas Hub",
    description:
      "Primary-market provenance, certificates of authenticity, secondary-market liquidity, the Filipino auction landscape, and the case for buying what you love first.",
  },
  "choosing-art-for-every-room": {
    title: "Choosing the right painting for every room — Canvas Hub",
    description:
      "A room-by-room playbook for decorating with original, hand-painted canvas: how to size the piece, what subject and palette pair best with each space, and the small placement details that decide whether a painting feels like a focal point or background noise.",
  },
};

const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));

export const Route = createFileRoute("/resources/$slug")({
  // Validate the slug before the route activates so a bad URL renders
  // the 404 boundary instead of crashing inside the component tree.
  beforeLoad: ({ params }) => {
    if (!isArticleSlug(params.slug)) {
      throw notFound();
    }
  },
  component: ResourceArticlePage,
  notFoundComponent: ResourceArticleNotFound,
  head: ({ params }) => {
    const slug = params.slug;
    if (slug && isArticleSlug(slug)) {
      const meta = ARTICLE_META[slug];
      return {
        meta: [
          { title: meta.title },
          { name: "description", content: meta.description },
          { property: "og:title", content: meta.title },
          { property: "og:description", content: meta.description },
        ],
      };
    }
    // `beforeLoad` will have already redirected to the not-found
    // boundary by the time the leaf renders, but `head()` runs before
    // that on the first render, so we still need a sensible default.
    return {
      meta: [
        { title: "Resources — Canvas Hub" },
        {
          name: "description",
          content:
            "Long-form guides on caring for, framing, hanging, and collecting original canvas paintings.",
        },
      ],
    };
  },
});

// Switch on the slug so every JSX position references a stable,
// module-scoped component identity. This keeps the React compiler's
// `react-hooks/static-components` rule happy (no component creation
// during render).
function renderArticle(slug: ArticleSlug) {
  switch (slug) {
    case "canvas-care":
      return <LazyCanvasCare />;
    case "framing-original-paintings":
      return <LazyFraming />;
    case "hanging-art-gallery-style":
      return <LazyHanging />;
    case "humidity-and-storage":
      return <LazyHumidity />;
    case "buying-art-as-investment":
      return <LazyBuying />;
    case "choosing-art-for-every-room":
      return <LazyRoomPairing />;
  }
}

function ResourceArticlePage() {
  const { slug } = useParams({ from: "/resources/$slug" });
  // `beforeLoad` has already validated the slug; cast safely.
  const articleSlug = slug as ArticleSlug;
  const meta = ARTICLE_META[articleSlug];
  useSEO({
    title: meta.title,
    description: meta.description,
    canonicalPath: `/resources/${articleSlug}`,
  });
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main id="main-content" className="pt-24 md:pt-28">
        <Suspense fallback={null}>{renderArticle(articleSlug)}</Suspense>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}

function ResourceArticleNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main id="main-content" className="pt-24 md:pt-28">
        <div className="py-24 sm:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto">
          <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
            Not found
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-foreground mb-6">
            That guide doesn't exist
          </h1>
          <p className="font-body text-base text-muted-foreground leading-relaxed mb-8">
            The article you tried to open isn't part of our resources library
            (yet). Head back to the hub to browse the full set of guides.
          </p>
          <Link
            to="/resources"
            className="inline-flex items-center text-sm uppercase tracking-[0.3em] text-foreground hover:text-muted-foreground transition-colors border-b border-foreground/40 hover:border-muted-foreground/40 pb-1"
          >
            Back to the Resources hub
          </Link>
        </div>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
