import {
  getProductImages,
  type Product,
  type ProductImage,
} from "@/contexts/ProductContext";

export type Availability =
  | "available"
  | "made-to-order"
  | "reserved"
  | "sold"
  | "draft";

export const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "made-to-order", label: "Made to order" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "draft", label: "Draft (hidden)" },
];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available",
  "made-to-order": "Made to order",
  reserved: "Reserved",
  sold: "Sold",
  draft: "Draft",
};

export const getAvailability = (
  product: Pick<Product, "availability"> | { availability?: Availability },
): Availability => {
  return (product.availability as Availability) || "available";
};

// Made-to-order is purchasable too — the customer can place an order
// now and we paint it for them. The product page surfaces the longer
// turnaround in its copy.
export const isPurchasable = (availability: Availability): boolean =>
  availability === "available" || availability === "made-to-order";

export interface DisplayArtwork {
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
  dimensions?: string;
  images: ProductImage[];
  availability: Availability;
  isCustom: boolean;
  embargoUntil?: string;
}

export const isEmbargoed = (
  product:
    | { embargoUntil?: string }
    | { embargoUntil?: string | undefined }
    | DisplayArtwork,
  now: Date = new Date(),
): boolean => {
  const raw = (product as { embargoUntil?: string }).embargoUntil;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return t > now.getTime();
};

const defaultArtworksRaw: Array<
  Omit<
    DisplayArtwork,
    "id" | "images" | "availability" | "isCustom" | "category" | "dimensions"
  > & {
    category?: string;
    dimensions?: string;
  }
> = [
  {
    image: "/images/1.png",
    mockup: "/images/2.png",
    title: "Rice Field Guardians",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3599,
    description:
      "Colorful mosaic-style painting shows women bent in vibrant conical hats—pinks, blues, yellows—tending flooded rice fields at sunset, with trees, birds, and green-yellow glow.",
  },
  {
    image: "/images/4.png",
    mockup: "/images/3.jpeg",
    title: "Koi Fish Painting",
    medium: "Oil on Canvas",
    year: "2025",
    price: 3599,
    description:
      "Beautiful painting featuring koi fish arranged in an infinity symbol. The artwork is set against a green background and framed in a sleek black frame, adding a touch of elegance to any room.",
  },
  {
    image: "/images/21.png",
    mockup: "/images/22.png",
    title: "Dynamic Geometric Figure Abstraction",
    medium: "Oil on Canvas",
    year: "2025",
    price: 3499,
    description:
      "Fluid arcs and blocks form limbs, torso, and head in joyous color symphony, channeling Matisse-like Fauvism meets modern geometry for rhythmic vitality.",
  },
  {
    image: "/images/5.png",
    mockup: "/images/6.png",
    title: "Cubist Family of Four",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3799,
    description:
      "A striking framed modernist artwork featuring a father, mother, and their two children in a warm embrace—a vibrant celebration of family ties and the abundance of nature.",
  },
  {
    image: "/images/15.png",
    mockup: "/images/16.png",
    title: "Pinay Farmers' Bounty",
    medium: "Oil on Canvas",
    year: "2025",
    price: 3499,
    description:
      "Colorful folk painting portrays a group of Philippine farmers—women in traditional salakot hats and vibrant attire—poised with woven baskets before village huts under a golden sunset glow.",
  },
  {
    image: "/images/9.png",
    mockup: "/images/10.png",
    title: "Golden Harvest Kin",
    medium: "Oil on Canvas",
    year: "2025",
    price: 3499,
    description:
      "Vibrant painting portrays a family of magsasaka—women and child in colorful skirts and hats—gathering ripe golden palay stalks amid rippling waves of harvest fields.",
  },
  {
    image: "/images/13.png",
    mockup: "/images/14.png",
    title: "Cosmic Iris Dance",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3699,
    description:
      "Dynamic painting features stylized iris flowers with ruffled, ribbon-like petals in a rainbow spectrum, twisting dynamically on a deep cosmic background under gallery spotlights.",
  },
  {
    image: "/images/33.png",
    mockup: "/images/34.jpg",
    title: "Mayon Village Path",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3699,
    description:
      "A vibrant tropical scene with the majestic Mayon volcano framed by a swaying palm, a nipa hut, and a Filipina walking a sunlit path past golden haystacks and ancient bell tower ruins.",
  },
  {
    image: "/images/29.png",
    mockup: "/images/30.jpeg",
    title: "Autumn Falls",
    medium: "Oil on Canvas",
    year: "2025",
    price: 3699,
    description:
      "Golden and amber autumn trees frame a small waterfall flowing into a vivid blue pond — a serene seasonal landscape rendered in rich, warm strokes.",
  },
  {
    image: "/images/27.png",
    mockup: "/images/28.jpg",
    title: "Pink Tulips at Dawn",
    medium: "Oil on Canvas",
    year: "2025",
    price: 3499,
    description:
      "A row of soft pink tulips rises against a dreamy gradient of lavender and peach — a delicate spring composition that brings quiet warmth to any room.",
  },
  {
    image: "/images/23.png",
    mockup: "/images/24.jpg",
    title: "Peacock Mandala",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3899,
    description:
      "A radiant stylized peacock blooms outward in symmetrical petals of rainbow yarn-like strokes — a meditative mandala bursting with color and craft.",
  },
  {
    image: "/images/19.png",
    mockup: "/images/20.png",
    title: "Butterfly Kaleidoscope",
    medium: "Oil Pastel on Canvas",
    year: "2025",
    price: 3899,
    description:
      "A jubilant flock of butterflies in electric jewel tones dances across a midnight field of ferns — a kaleidoscopic celebration of color, movement, and tropical wonder.",
  },
  {
    image: "/images/17.png",
    mockup: "/images/18.png",
    title: "Bird of Paradise",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3899,
    description:
      "Bold bird-of-paradise blooms and tropical leaves create a fresh botanical composition with crisp lines and luminous island color.",
  },
  {
    image: "/images/31.png",
    mockup: "/images/32.png",
    title: "Riverside Serenity",
    medium: "Mixed Media Pyro-Art",
    year: "2025",
    price: 3999,
    description:
      "A calm mangrove and river landscape in soft natural tones evokes a quiet moment of still water, trees, and distant sky.",
  },
  {
    image: "/images/25.png",
    mockup: "/images/26.jpg",
    title: "Woven Cubist Symphony",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3899,
    description:
      "A vibrant abstract tapestry of interwoven color blocks and rope-like textures — a bold cubist composition celebrating Filipino weaving heritage in modern form.",
  },
];

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const defaultArtworks: DisplayArtwork[] = defaultArtworksRaw.map(
  (art) => {
    const images: ProductImage[] = [{ url: art.image }];
    if (art.mockup) images.push({ url: art.mockup });
    return {
      ...art,
      id: `default-${slugify(art.title)}`,
      images,
      availability: "available" as Availability,
      isCustom: false,
    };
  },
);

export const productToDisplay = (product: Product): DisplayArtwork => {
  const images = getProductImages(product);
  return {
    id: `product-${product.id}`,
    image: product.image,
    mockup: product.mockup || product.image,
    title: product.title,
    medium: product.medium,
    year: product.year,
    price: product.price,
    salePrice: product.salePrice,
    description: product.description,
    category: product.category,
    dimensions: product.dimensions,
    images: images.length > 0 ? images : [{ url: product.image }],
    availability: getAvailability(product),
    isCustom: true,
    embargoUntil: product.embargoUntil,
  };
};

export const getAllArtworks = (products: Product[]): DisplayArtwork[] => {
  // Soft-deleted overrides suppress both themselves AND their bundled
  // stock default — the operator's intent is "this listing should be
  // gone", not "fall back to the original stock copy". The bundled
  // default only resurfaces if the override is permanently deleted
  // from the Trash tab (which hard-removes the row from KV).
  const overrideMap = new Map<string, Product>();
  const trashedDefaultIds = new Set<string>();
  for (const p of products) {
    if (!p.replacesDefaultId) continue;
    if (p.trashed) {
      trashedDefaultIds.add(p.replacesDefaultId);
      continue;
    }
    overrideMap.set(p.replacesDefaultId, p);
  }
  const mergedDefaults: DisplayArtwork[] = defaultArtworks
    .filter((def) => !trashedDefaultIds.has(def.id))
    .map((def) => {
      const override = overrideMap.get(def.id);
      if (!override) return def;
      // Present the override's fields as the stock artwork, preserving the
      // default id so deep links continue to resolve.
      return {
        ...productToDisplay(override),
        id: def.id,
        isCustom: false,
      };
    });
  const extras = products.filter((p) => !p.replacesDefaultId && !p.trashed);
  return [...mergedDefaults, ...extras.map(productToDisplay)];
};

export const getDefaultArtworkIds = (): string[] =>
  defaultArtworks.map((a) => a.id);

export const findDefaultArtwork = (id: string): DisplayArtwork | undefined =>
  defaultArtworks.find((a) => a.id === id);

export const getStorefrontArtworks = (
  products: Product[],
  options: { vipEarlyAccess?: boolean } = {},
): DisplayArtwork[] => {
  const all = getAllArtworks(products).filter(
    (art) => art.availability !== "draft",
  );
  if (options.vipEarlyAccess) return all;
  return all.filter((art) => !isEmbargoed(art));
};

export const findArtworkById = (
  id: string,
  products: Product[],
): DisplayArtwork | undefined => {
  const all = getAllArtworks(products);
  // Direct match against the display id (`product-<uuid>` for uploads,
  // `default-<slug>` for stock artworks).
  const direct = all.find((art) => art.id === id);
  if (direct) return direct;
  // Back-compat: older code paths (and any deep-links / shared URLs from
  // before the display-id rename) sometimes use the raw product uuid.
  // Map that to the corresponding `product-<uuid>` artwork.
  const byPrefixed = all.find((art) => art.id === `product-${id}`);
  if (byPrefixed) return byPrefixed;
  // Overrides of stock defaults are merged under the `default-<slug>` id
  // in `getAllArtworks`, so a link built against the override's raw uuid
  // (e.g. an old "/product/product-<uuid>" pin, a Turso-fed similar-rail
  // result, or any pre-fix cached link) would otherwise 404. Resolve
  // either `product-<uuid>` or the bare `<uuid>` back to the merged
  // default so deep-links into customized stock items keep working.
  const rawId = id.startsWith("product-") ? id.slice("product-".length) : id;
  const override = products.find(
    (p) => p.id === rawId && Boolean(p.replacesDefaultId) && !p.trashed,
  );
  if (override?.replacesDefaultId) {
    return all.find((art) => art.id === override.replacesDefaultId);
  }
  return undefined;
};
