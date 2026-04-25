import { useState } from "react";
import { motion } from "framer-motion";
import ArtworkCard from "./ArtworkCard";
import Lightbox from "./Lightbox";
import { useProducts } from "@/contexts/ProductContext";

const defaultArtworks = [
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

const GallerySection = () => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { products } = useProducts();

  const allArtworks: {
    image: string;
    mockup?: string;
    title: string;
    medium: string;
    year: string;
    price: number;
    salePrice?: number;
    description: string;
    id?: string;
  }[] = [
    ...defaultArtworks,
    ...products.map((product) => ({
      image: product.image,
      mockup: product.mockup || product.image,
      title: product.title,
      medium: product.medium,
      year: product.year,
      price: product.price,
      salePrice: product.salePrice,
      description: product.description,
      id: product.id,
    })),
  ];

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
      <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">
        {allArtworks.map((art, index) => (
          <ArtworkCard
            key={art.id ?? `${art.title}-${index}`}
            {...art}
            index={index}
            onClick={() => setLightboxIndex(index)}
          />
        ))}
      </div>
      <Lightbox
        artworks={allArtworks}
        currentIndex={lightboxIndex ?? 0}
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </section>
  );
};

export default GallerySection;
