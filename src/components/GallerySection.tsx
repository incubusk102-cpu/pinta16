import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import SplitText from "@/components/motion/SplitText";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import ArtworkCard from "./ArtworkCard";
import Lightbox from "./Lightbox";
import {
  getEffectivePrice,
  PRODUCT_CATEGORIES,
  useProducts,
} from "@/contexts/ProductContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AVAILABILITY_LABEL,
  getStorefrontArtworks,
  type Availability,
  type DisplayArtwork,
} from "@/lib/artworks";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

type SortOption =
  | "featured"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name: A → Z" },
  { value: "name-desc", label: "Name: Z → A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

const STOREFRONT_AVAILABILITIES: Availability[] = [
  "available",
  "reserved",
  "sold",
];

const PRICE_BUCKETS: {
  value: string;
  label: string;
  match: (price: number) => boolean;
}[] = [
  { value: "all", label: "Any price", match: () => true },
  { value: "lt-3000", label: "Under ₱3,000", match: (p) => p < 3000 },
  {
    value: "3000-3500",
    label: "₱3,000 – ₱3,500",
    match: (p) => p >= 3000 && p <= 3500,
  },
  {
    value: "3500-3800",
    label: "₱3,500 – ₱3,800",
    match: (p) => p > 3500 && p <= 3800,
  },
  {
    value: "3800-4500",
    label: "₱3,800 – ₱4,500",
    match: (p) => p > 3800 && p <= 4500,
  },
  { value: "gt-4500", label: "Over ₱4,500", match: (p) => p > 4500 },
];

const DEPTH_PREVIEW_LAYOUT = [
  { rotate: -10, y: 26, scale: 0.9, zIndex: 1, rotateY: 9 },
  { rotate: 0, y: -10, scale: 1, zIndex: 3, rotateY: 0 },
  { rotate: 10, y: 32, scale: 0.92, zIndex: 2, rotateY: -9 },
] as const;

interface GalleryDepthPreviewProps {
  artworks: DisplayArtwork[];
  totalCount: number;
}

const getPreviewImage = (art: DisplayArtwork) =>
  art.images?.[0]?.url || art.image;

const GalleryDepthPreview = ({
  artworks,
  totalCount,
}: GalleryDepthPreviewProps) => {
  const reduceMotion = useReducedMotion();
  if (artworks.length === 0) return null;

  const plural = totalCount === 1 ? "piece" : "pieces";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 32 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="mb-10 sm:mb-14 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(360px,1.15fr)] items-center overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-6 lg:p-8 shadow-2xl shadow-black/20 backdrop-blur"
    >
      <div className="relative z-10 space-y-4 text-left">
        <p className="font-body text-[10px] tracking-[0.35em] uppercase text-muted-foreground">
          Responsive motion gallery
        </p>
        <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl leading-tight text-gradient-elegant">
          Browse art with depth on every screen.
        </h3>
        <p className="max-w-xl font-body text-sm sm:text-base leading-7 text-muted-foreground">
          Mobile now gets a roomier single-column collecting flow, while desktop
          visitors see layered previews, wider masonry, and tilt-enabled artwork
          cards that feel closer to a real gallery wall.
        </p>
        <dl className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <dt className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Mobile
            </dt>
            <dd className="mt-1 font-display text-lg">1-up</dd>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <dt className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Desktop
            </dt>
            <dd className="mt-1 font-display text-lg">4-up</dd>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <dt className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Works
            </dt>
            <dd className="mt-1 font-display text-lg">{totalCount}</dd>
          </div>
        </dl>
        <p className="font-body text-xs tracking-[0.22em] uppercase text-muted-foreground">
          {totalCount} curated {plural} ready to explore
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:hidden">
        {artworks.map((art, index) => (
          <Link
            key={art.id}
            to="/product/$id"
            params={{ id: art.id }}
            className={`group relative overflow-hidden rounded-xl border border-border/50 bg-muted ${
              index === 0 ? "col-span-2 aspect-[16/10]" : "aspect-square"
            }`}
          >
            <img
              src={getPreviewImage(art)}
              alt={art.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3">
              <p className="font-display text-sm text-white line-clamp-1">
                {art.title}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="relative hidden min-h-[420px] items-center justify-center lg:flex [perspective:1400px]">
        <div className="absolute inset-8 rounded-full bg-foreground/10 blur-3xl" />
        {artworks.map((art, index) => {
          const layout = DEPTH_PREVIEW_LAYOUT[index] ?? DEPTH_PREVIEW_LAYOUT[1];
          return (
            <motion.div
              key={art.id}
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      y: layout.y + 36,
                      rotate: 0,
                      scale: layout.scale * 0.96,
                    }
              }
              whileInView={
                reduceMotion
                  ? undefined
                  : {
                      opacity: 1,
                      y: layout.y,
                      rotate: layout.rotate,
                      scale: layout.scale,
                    }
              }
              whileHover={
                reduceMotion
                  ? undefined
                  : {
                      y: layout.y - 18,
                      rotateY: layout.rotateY,
                      scale: layout.scale + 0.04,
                    }
              }
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                type: "spring",
                stiffness: 160,
                damping: 20,
                delay: index * 0.08,
              }}
              className="-mx-8 w-56 xl:w-64 will-change-transform"
              style={{ zIndex: layout.zIndex, transformStyle: "preserve-3d" }}
            >
              <Link
                to="/product/$id"
                params={{ id: art.id }}
                className="group block overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/35"
              >
                <div className="aspect-[3/4] overflow-hidden">
                  <img
                    src={getPreviewImage(art)}
                    alt={art.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                </div>
                <div className="border-t border-border/50 bg-background/85 p-4 backdrop-blur">
                  <p className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                    {art.medium || "Original painting"}
                  </p>
                  <p className="mt-1 font-display text-lg line-clamp-1">
                    {art.title}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

const matchesArtwork = (
  art: DisplayArtwork,
  query: string,
  category: string,
  availability: string,
  priceBucket: string,
): boolean => {
  if (availability !== "all" && art.availability !== availability) return false;
  if (category !== "all") {
    if (category === "__uncategorized__") {
      if (art.category && art.category.trim()) return false;
    } else if ((art.category || "") !== category) return false;
  }
  const bucket = PRICE_BUCKETS.find((b) => b.value === priceBucket);
  if (bucket && !bucket.match(getEffectivePrice(art))) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    art.title,
    art.medium,
    art.year,
    art.category,
    art.dimensions,
    art.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
};

const GallerySection = () => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [query, setQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAvailability, setFilterAvailability] = useState<string>("all");
  const [filterPrice, setFilterPrice] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { products } = useProducts();
  const { user } = useUserAuth();
  const { config } = useStorefrontConfig();
  const galleryCopy = config.siteCopy.gallery;
  const isLoggedIn = Boolean(user);

  const allArtworks = useMemo(
    () =>
      getStorefrontArtworks(products, {
        vipEarlyAccess: user?.vipEarlyAccess === true,
      }),
    [products, user?.vipEarlyAccess],
  );

  const previewArtworks = useMemo(() => allArtworks.slice(0, 3), [allArtworks]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const art of allArtworks) {
      const c = (art.category || "").trim();
      if (c) set.add(c);
    }
    const merged = new Set<string>([...PRODUCT_CATEGORIES, ...set]);
    return Array.from(merged).sort();
  }, [allArtworks]);

  const filteredArtworks = useMemo(() => {
    if (!isLoggedIn) return allArtworks;
    return allArtworks.filter((art) =>
      matchesArtwork(
        art,
        query,
        filterCategory,
        filterAvailability,
        filterPrice,
      ),
    );
  }, [
    allArtworks,
    isLoggedIn,
    query,
    filterCategory,
    filterAvailability,
    filterPrice,
  ]);

  const sortedArtworks = useMemo(() => {
    const copy = [...filteredArtworks];
    if (!isLoggedIn) return copy;
    switch (sortBy) {
      case "name-asc":
        return copy.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
        );
      case "name-desc":
        return copy.sort((a, b) =>
          b.title.localeCompare(a.title, undefined, { sensitivity: "base" }),
        );
      case "price-asc":
        return copy.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
      case "price-desc":
        return copy.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
      default:
        return copy;
    }
  }, [filteredArtworks, sortBy, isLoggedIn]);

  const hasFilters =
    query.trim().length > 0 ||
    filterCategory !== "all" ||
    filterAvailability !== "all" ||
    filterPrice !== "all";

  // Count of active dropdown filters (search box has its own clear affordance,
  // sort isn't really a "filter") — used for the mobile Filters toggle badge.
  const activeFilterCount =
    (filterCategory !== "all" ? 1 : 0) +
    (filterAvailability !== "all" ? 1 : 0) +
    (filterPrice !== "all" ? 1 : 0);

  const clearFilters = () => {
    setQuery("");
    setFilterCategory("all");
    setFilterAvailability("all");
    setFilterPrice("all");
  };

  return (
    <section
      id="gallery"
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-7xl mx-auto gallery-spotlight"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-10 sm:mb-16"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          {galleryCopy.eyebrow}
        </p>
        <SplitText
          as="h2"
          by="word"
          stagger={0.07}
          duration={0.85}
          yFrom={32}
          className="font-display text-3xl md:text-4xl text-gradient-elegant"
        >
          {galleryCopy.title}
        </SplitText>
      </motion.div>

      <GalleryDepthPreview
        artworks={previewArtworks}
        totalCount={allArtworks.length}
      />

      {isLoggedIn && (
        <div className="space-y-3 mb-8">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search paintings, mediums, or styles…"
              aria-label="Search paintings"
              className="pl-9 pr-9 h-10 font-body text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="gallery-filter-row"
            className="sm:hidden flex w-fit mx-auto items-center justify-center gap-2 font-body text-[11px] tracking-[0.2em] uppercase text-foreground border border-border/60 rounded-sm px-4 py-2 hover:bg-accent transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-background font-body text-[10px] tracking-normal">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          <div
            id="gallery-filter-row"
            className={`${filtersOpen ? "grid grid-cols-2" : "hidden"} sm:flex sm:flex-wrap items-end sm:justify-center gap-3`}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <label
                htmlFor="filter-category"
                className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground"
              >
                Category
              </label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger
                  id="filter-category"
                  className="w-full sm:w-[170px] font-body text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="__uncategorized__">
                    Uncategorized
                  </SelectItem>
                  {availableCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <label
                htmlFor="filter-price"
                className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground"
              >
                Price
              </label>
              <Select value={filterPrice} onValueChange={setFilterPrice}>
                <SelectTrigger
                  id="filter-price"
                  className="w-full sm:w-[170px] font-body text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_BUCKETS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <label
                htmlFor="filter-availability"
                className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground"
              >
                Availability
              </label>
              <Select
                value={filterAvailability}
                onValueChange={setFilterAvailability}
              >
                <SelectTrigger
                  id="filter-availability"
                  className="w-full sm:w-[170px] font-body text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {STOREFRONT_AVAILABILITIES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {AVAILABILITY_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <label
                htmlFor="gallery-sort"
                className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground"
              >
                Sort
              </label>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortOption)}
              >
                <SelectTrigger
                  id="gallery-sort"
                  className="w-full sm:w-[170px] font-body text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="col-span-2 sm:col-auto justify-self-center sm:justify-self-auto font-body text-[11px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground underline-offset-4 hover:underline pb-2"
              >
                Clear filters
              </button>
            )}
          </div>

          <p className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground text-center">
            {sortedArtworks.length}{" "}
            {sortedArtworks.length === 1 ? "piece" : "pieces"}
          </p>
        </div>
      )}

      {sortedArtworks.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-body text-sm text-muted-foreground">
            No paintings match your filters yet.
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 font-body text-xs tracking-[0.25em] uppercase text-foreground underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4 sm:gap-6 xl:gap-8 space-y-4 sm:space-y-6 xl:space-y-8">
          {sortedArtworks.map((art, index) => (
            <ArtworkCard
              key={art.id}
              {...art}
              index={index}
              onClick={() => setLightboxIndex(index)}
            />
          ))}
        </div>
      )}

      {sortedArtworks.length > 0 && (
        <p className="mt-10 text-center font-body text-xs tracking-[0.25em] uppercase text-muted-foreground">
          Click any painting for details, or{" "}
          <Link
            to="/"
            hash="gallery"
            className="underline underline-offset-4 hover:text-foreground"
          >
            browse the full collection
          </Link>
          .
        </p>
      )}

      <Lightbox
        artworks={sortedArtworks}
        currentIndex={lightboxIndex ?? 0}
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </section>
  );
};

export default GallerySection;
