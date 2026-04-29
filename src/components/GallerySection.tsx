import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
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
  const { products } = useProducts();
  const { user } = useUserAuth();
  const isLoggedIn = Boolean(user);

  const allArtworks = useMemo(
    () => getStorefrontArtworks(products),
    [products],
  );

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
          The Collection
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-gradient-elegant">
          Our Products
        </h2>
      </motion.div>

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

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end sm:justify-center gap-3">
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
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 sm:gap-6 md:gap-8 space-y-4 sm:space-y-6 md:space-y-8">
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
