import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { animate, stagger } from "animejs";
import SplitText from "@/components/motion/SplitText";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Search, SlidersHorizontal, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AVAILABILITY_LABEL,
  getStorefrontArtworks,
  type Availability,
  type DisplayArtwork,
} from "@/lib/artworks";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { jsonAuthHeaders } from "@/lib/api";

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
  "made-to-order",
  "reserved",
  "sold",
];

// Price buckets used to chip out the range filter into a small set of
// shoppable bands. The `value` is what we store in URL/state, the
// `label` is what the user sees, and `match` decides whether an
// effective price falls into that bucket. The filter is multi-select
// (an empty selection means "show every price"), so each bucket is
// purely additive and there's no longer an "Any price" option here.
const PRICE_BUCKETS: {
  value: string;
  label: string;
  match: (price: number) => boolean;
}[] = [
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

const UNCATEGORIZED_VALUE = "__uncategorized__";

const matchesArtwork = (
  art: DisplayArtwork,
  query: string,
  categories: string[],
  availabilities: string[],
  priceBuckets: string[],
): boolean => {
  if (availabilities.length > 0 && !availabilities.includes(art.availability))
    return false;
  if (categories.length > 0) {
    const cat = (art.category || "").trim();
    const ok = cat
      ? categories.includes(cat)
      : categories.includes(UNCATEGORIZED_VALUE);
    if (!ok) return false;
  }
  if (priceBuckets.length > 0) {
    const price = getEffectivePrice(art);
    const hit = priceBuckets.some((value) => {
      const bucket = PRICE_BUCKETS.find((b) => b.value === value);
      return bucket ? bucket.match(price) : false;
    });
    if (!hit) return false;
  }
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

// Helper: toggle a value inside a string-set state.
const toggleValue = (
  list: string[],
  value: string,
  setter: (next: string[]) => void,
) => {
  setter(
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
  );
};

interface GallerySectionProps {
  initialSearch?: {
    q?: string;
    sort?: string;
    categories?: string;
    availability?: string;
    price?: string;
  };
}

const isValidSort = (v: string): v is SortOption =>
  SORT_OPTIONS.some((o) => o.value === v);

const GallerySection = ({ initialSearch }: GallerySectionProps = {}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>(
    initialSearch?.sort && isValidSort(initialSearch.sort)
      ? initialSearch.sort
      : "featured",
  );
  const [query, setQuery] = useState(initialSearch?.q ?? "");
  const [filterCategories, setFilterCategories] = useState<string[]>(
    initialSearch?.categories
      ? initialSearch.categories.split(",").filter(Boolean)
      : [],
  );
  const [filterAvailabilities, setFilterAvailabilities] = useState<string[]>(
    initialSearch?.availability
      ? initialSearch.availability.split(",").filter(Boolean)
      : [],
  );
  const [filterPriceBuckets, setFilterPriceBuckets] = useState<string[]>(
    initialSearch?.price ? initialSearch.price.split(",").filter(Boolean) : [],
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { products } = useProducts();
  const { user } = useUserAuth();
  const { config } = useStorefrontConfig();
  const galleryCopy = config.siteCopy.gallery;
  const isLoggedIn = Boolean(user);
  const isMobile = useIsMobile();

  const allArtworks = useMemo(
    () =>
      getStorefrontArtworks(products, {
        vipEarlyAccess: user?.vipEarlyAccess === true,
      }),
    [products, user?.vipEarlyAccess],
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
    return allArtworks.filter((art) =>
      matchesArtwork(
        art,
        query,
        filterCategories,
        filterAvailabilities,
        filterPriceBuckets,
      ),
    );
  }, [
    allArtworks,
    query,
    filterCategories,
    filterAvailabilities,
    filterPriceBuckets,
  ]);

  const sortedArtworks = useMemo(() => {
    const copy = [...filteredArtworks];
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
  }, [filteredArtworks, sortBy]);

  // Debounced search-event beacon. The gallery filters in-memory so there's
  // no server hit per keystroke; instead we beacon once per stable query
  // (≥ 2 chars, 1.5 s of no typing) so the admin can see what shoppers
  // search for vs. what they buy. See `functions/api/search-events.js` for
  // the persistence side. Beacon failures are silently swallowed — the
  // public search must keep working even if D1 isn't configured.
  const lastBeaconedQueryRef = useRef<string>("");
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    if (trimmed.toLowerCase() === lastBeaconedQueryRef.current) return;

    const handle = window.setTimeout(() => {
      const payload = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `se_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        query: trimmed,
        resultsCount: sortedArtworks.length,
        filterCategory: filterCategories.length
          ? filterCategories.join(",")
          : null,
        filterAvailability: filterAvailabilities.length
          ? filterAvailabilities.join(",")
          : null,
        filterPrice: filterPriceBuckets.length
          ? filterPriceBuckets.join(",")
          : null,
      };
      lastBeaconedQueryRef.current = trimmed.toLowerCase();
      void fetch("/api/search-events", {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // Beacon is best-effort — don't surface failures to the shopper.
      });
    }, 1500);

    return () => window.clearTimeout(handle);
  }, [
    query,
    sortedArtworks.length,
    filterCategories,
    filterAvailabilities,
    filterPriceBuckets,
  ]);

  // anime.js fade-up on the gallery control bar (search + sort row +
  // filter pills). Cards themselves keep their existing
  // framer-motion entrance via ArtworkCard, so this only animates
  // the chrome above the grid.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const host = document.querySelector<HTMLElement>("[data-gallery-controls]");
    if (!host) return;
    const rows = Array.from(host.children) as HTMLElement[];
    if (rows.length === 0) return;
    rows.forEach((row) => {
      row.style.opacity = "0";
      row.style.transform = "translateY(10px)";
    });
    const controls = animate(rows, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 600,
      delay: stagger(70, { start: 250 }),
      ease: "outQuad",
      onComplete: () => {
        rows.forEach((row) => {
          row.style.opacity = "";
          row.style.transform = "";
        });
      },
    });
    return () => {
      controls.pause();
    };
  }, []);

  const activeFilterCount =
    filterCategories.length +
    filterAvailabilities.length +
    filterPriceBuckets.length;
  const hasActiveFilters = activeFilterCount > 0;
  const hasAnyConstraint = hasActiveFilters || query.trim().length > 0;

  const clearAllFilters = () => {
    setFilterCategories([]);
    setFilterAvailabilities([]);
    setFilterPriceBuckets([]);
  };

  const clearEverything = () => {
    setQuery("");
    clearAllFilters();
  };

  const categoryLabel = (value: string): string =>
    value === UNCATEGORIZED_VALUE ? "Uncategorized" : value;

  // Active filter pills the shopper can drop one-by-one without
  // re-opening the sheet. Each entry knows which list it lives in,
  // so removing a pill just calls the matching setter.
  type ActivePill = {
    key: string;
    label: string;
    remove: () => void;
  };
  const activePills: ActivePill[] = [
    ...filterCategories.map((v) => ({
      key: `c-${v}`,
      label: categoryLabel(v),
      remove: () => setFilterCategories((prev) => prev.filter((x) => x !== v)),
    })),
    ...filterPriceBuckets.map((v) => ({
      key: `p-${v}`,
      label: PRICE_BUCKETS.find((b) => b.value === v)?.label ?? v,
      remove: () =>
        setFilterPriceBuckets((prev) => prev.filter((x) => x !== v)),
    })),
    ...filterAvailabilities.map((v) => ({
      key: `a-${v}`,
      label: AVAILABILITY_LABEL[v as Availability] ?? v,
      remove: () =>
        setFilterAvailabilities((prev) => prev.filter((x) => x !== v)),
    })),
  ];

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
        className="text-center mb-12 sm:mb-20"
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

      <div data-gallery-controls className="space-y-6 mb-12 sm:mb-16">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search paintings, mediums, or styles…"
            aria-label="Search paintings"
            className="pl-9 pr-9 h-11 font-body text-sm"
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

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className="inline-flex items-center justify-center gap-2 font-body text-[11px] tracking-[0.2em] uppercase text-foreground border border-border/60 rounded-sm px-5 py-2.5 hover:bg-accent transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            Filter
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-background font-body text-[10px] tracking-normal">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
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
                className="w-[170px] font-body text-xs"
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

          {hasAnyConstraint && (
            <button
              type="button"
              onClick={clearEverything}
              className="font-body text-[11px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        {activePills.length > 0 && (
          <ul className="flex flex-wrap items-center justify-center gap-2">
            {activePills.map((pill) => (
              <li key={pill.key}>
                <button
                  type="button"
                  onClick={pill.remove}
                  aria-label={`Remove filter ${pill.label}`}
                  className="inline-flex items-center gap-1.5 font-body text-[11px] tracking-[0.1em] uppercase rounded-full border border-border/60 bg-background px-3 py-1.5 text-foreground hover:bg-accent transition-colors"
                >
                  {pill.label}
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground text-center">
          {sortedArtworks.length}{" "}
          {sortedArtworks.length === 1 ? "piece" : "pieces"}
        </p>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={
              isMobile
                ? "h-[85vh] rounded-t-2xl p-0 flex flex-col"
                : "w-full sm:max-w-md p-0 flex flex-col"
            }
          >
            <SheetHeader className="px-6 pt-6 pb-3 border-b border-border/40 text-left">
              <SheetTitle className="font-display text-2xl">Filter</SheetTitle>
              <SheetDescription className="font-body text-xs tracking-[0.15em] uppercase text-muted-foreground">
                {activeFilterCount === 0
                  ? "Narrow the collection by category, price, and availability."
                  : `${activeFilterCount} active`}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="px-6 py-6 space-y-8">
                <section aria-labelledby="filter-categories-heading">
                  <h3
                    id="filter-categories-heading"
                    className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3"
                  >
                    Categories
                  </h3>
                  <ul className="space-y-3">
                    <FilterCheckbox
                      id="filter-cat-uncategorized"
                      checked={filterCategories.includes(UNCATEGORIZED_VALUE)}
                      onCheckedChange={() =>
                        toggleValue(
                          filterCategories,
                          UNCATEGORIZED_VALUE,
                          setFilterCategories,
                        )
                      }
                      label="Uncategorized"
                    />
                    {availableCategories.map((c) => (
                      <FilterCheckbox
                        key={c}
                        id={`filter-cat-${c}`}
                        checked={filterCategories.includes(c)}
                        onCheckedChange={() =>
                          toggleValue(filterCategories, c, setFilterCategories)
                        }
                        label={c}
                      />
                    ))}
                  </ul>
                </section>

                <section aria-labelledby="filter-price-heading">
                  <h3
                    id="filter-price-heading"
                    className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3"
                  >
                    Price
                  </h3>
                  <ul className="space-y-3">
                    {PRICE_BUCKETS.map((b) => (
                      <FilterCheckbox
                        key={b.value}
                        id={`filter-price-${b.value}`}
                        checked={filterPriceBuckets.includes(b.value)}
                        onCheckedChange={() =>
                          toggleValue(
                            filterPriceBuckets,
                            b.value,
                            setFilterPriceBuckets,
                          )
                        }
                        label={b.label}
                      />
                    ))}
                  </ul>
                </section>

                <section aria-labelledby="filter-availability-heading">
                  <h3
                    id="filter-availability-heading"
                    className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3"
                  >
                    Availability
                  </h3>
                  <ul className="space-y-3">
                    {STOREFRONT_AVAILABILITIES.map((a) => (
                      <FilterCheckbox
                        key={a}
                        id={`filter-avail-${a}`}
                        checked={filterAvailabilities.includes(a)}
                        onCheckedChange={() =>
                          toggleValue(
                            filterAvailabilities,
                            a,
                            setFilterAvailabilities,
                          )
                        }
                        label={AVAILABILITY_LABEL[a]}
                      />
                    ))}
                  </ul>
                </section>
              </div>
            </ScrollArea>

            <div className="border-t border-border/40 px-6 py-4 flex items-center justify-between gap-3 bg-background">
              <button
                type="button"
                onClick={clearAllFilters}
                disabled={!hasActiveFilters}
                className="font-body text-[11px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="font-body text-[11px] tracking-[0.2em] uppercase text-background bg-foreground hover:bg-foreground/90 rounded-sm px-6 py-2.5 transition-colors"
              >
                Show {sortedArtworks.length}{" "}
                {sortedArtworks.length === 1 ? "result" : "results"}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {sortedArtworks.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-body text-sm text-muted-foreground">
            No paintings match your filters yet.
          </p>
          {hasAnyConstraint && (
            <button
              type="button"
              onClick={clearEverything}
              className="mt-4 font-body text-xs tracking-[0.25em] uppercase text-foreground underline underline-offset-4"
            >
              Clear all
            </button>
          )}
        </div>
      ) : (
        <div className="gallery-dof columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4 sm:gap-6 xl:gap-8 space-y-4 sm:space-y-6 xl:space-y-8">
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

interface FilterCheckboxProps {
  id: string;
  checked: boolean;
  onCheckedChange: () => void;
  label: string;
}

const FilterCheckbox = ({
  id,
  checked,
  onCheckedChange,
  label,
}: FilterCheckboxProps) => (
  <li className="flex items-center gap-3">
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="h-5 w-5 rounded"
    />
    <label
      htmlFor={id}
      className="font-body text-sm text-foreground cursor-pointer select-none flex-1"
    >
      {label}
    </label>
  </li>
);

export default GallerySection;
