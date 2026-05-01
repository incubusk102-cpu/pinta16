import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import ArtworkCard from "./ArtworkCard";
import Lightbox from "./Lightbox";
import { Input } from "@/components/ui/input";
import {
  PRODUCT_CATEGORIES,
  getEffectivePrice,
  useProducts,
  type ProductAvailability,
} from "@/contexts/ProductContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_GALLERY_ARTWORKS,
  defaultArtworkId,
} from "@/data/default-artworks";

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

const PRICE_BUCKETS: {
  value: string;
  label: string;
  min: number;
  max: number;
}[] = [
  { value: "all", label: "Any price", min: 0, max: Infinity },
  { value: "u-2500", label: "Under ₱2,500", min: 0, max: 2500 },
  { value: "2500-3500", label: "₱2,500 — ₱3,500", min: 2500, max: 3500 },
  { value: "3500-4000", label: "₱3,500 — ₱4,000", min: 3500, max: 4000 },
  { value: "o-4000", label: "Above ₱4,000", min: 4000, max: Infinity },
];

interface ArtworkRow {
  id: string;
  image: string;
  mockup?: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  salePrice?: number;
  description: string;
  category?: string;
  availability: ProductAvailability;
}

const GallerySection = () => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [priceBucket, setPriceBucket] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const { products } = useProducts();

  const allArtworks: ArtworkRow[] = useMemo(
    () => [
      ...DEFAULT_GALLERY_ARTWORKS.map((art) => ({
        ...art,
        id: defaultArtworkId(art),
        availability: "available" as ProductAvailability,
      })),
      ...products.map((product) => ({
        image: product.image,
        mockup: product.mockup || product.image,
        title: product.title,
        medium: product.medium,
        year: product.year,
        price: product.price,
        salePrice: product.salePrice,
        description: product.description,
        category: product.category,
        id: `product-${product.id}`,
        availability: product.availability ?? "available",
      })),
    ],
    [products],
  );

  const filteredArtworks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bucket = PRICE_BUCKETS.find((p) => p.value === priceBucket);
    return allArtworks.filter((art) => {
      if (
        availabilityFilter === "available" &&
        art.availability !== "available"
      )
        return false;
      if (availabilityFilter === "sold" && art.availability !== "sold")
        return false;
      if (availabilityFilter === "reserved" && art.availability !== "reserved")
        return false;
      if (category !== "all") {
        if (category === "uncategorized") {
          if (art.category) return false;
        } else if (art.category !== category) {
          return false;
        }
      }
      if (bucket && bucket.value !== "all") {
        const price = getEffectivePrice(art);
        if (price < bucket.min || price >= bucket.max) return false;
      }
      if (q) {
        const haystack =
          `${art.title} ${art.medium} ${art.description} ${art.category ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allArtworks, search, category, priceBucket, availabilityFilter]);

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

  return (
    <section
      id="gallery"
      className="py-24 md:py-32 px-6 md:px-12 max-w-7xl mx-auto gallery-spotlight"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          The Collection
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-gradient-elegant">
          Our Paintings
        </h2>
      </motion.div>

      <div className="space-y-3 mb-8">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, medium, or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] font-body text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="uncategorized">Uncategorized</SelectItem>
              {PRODUCT_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priceBucket} onValueChange={setPriceBucket}>
            <SelectTrigger className="w-[180px] font-body text-xs">
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <SelectContent>
              {PRICE_BUCKETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={availabilityFilter}
            onValueChange={setAvailabilityFilter}
          >
            <SelectTrigger className="w-[180px] font-body text-xs">
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All availability</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <p className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground">
          {sortedArtworks.length}{" "}
          {sortedArtworks.length === 1 ? "piece" : "pieces"}
        </p>
        <div className="flex items-center gap-3">
          <label
            htmlFor="gallery-sort"
            className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground"
          >
            Sort by
          </label>
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as SortOption)}
          >
            <SelectTrigger
              id="gallery-sort"
              className="w-[200px] font-body text-xs"
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
      </div>
      {sortedArtworks.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          No paintings match those filters yet. Try clearing search or pick a
          different category.
        </p>
      ) : (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">
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
