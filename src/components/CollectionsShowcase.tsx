import { useState } from "react";
import { motion } from "framer-motion";
import ArtworkCard from "./ArtworkCard";
import Lightbox from "./Lightbox";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { productToDisplay, type DisplayArtwork } from "@/lib/artworks";

interface ResolvedCollection {
  id: string;
  title: string;
  description: string;
  artworks: DisplayArtwork[];
}

const CollectionsShowcase = () => {
  const { config } = useStorefrontConfig();
  const { products } = useProducts();
  const [open, setOpen] = useState<{
    collectionId: string;
    index: number;
  } | null>(null);

  const productById = new Map(products.map((p) => [p.id, p]));
  const resolved: ResolvedCollection[] = config.collections
    .filter((c) => c.enabled)
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      artworks: c.productIds
        .map((pid) => productById.get(pid))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map(productToDisplay)
        .filter((art) => art.availability !== "draft"),
    }))
    .filter((c) => c.artworks.length > 0);

  if (resolved.length === 0) return null;

  const activeCollection = open
    ? resolved.find((c) => c.id === open.collectionId) || null
    : null;

  return (
    <section className="px-6 md:px-12 max-w-7xl mx-auto pb-12 space-y-16">
      {resolved.map((collection) => (
        <div key={collection.id} className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="font-body text-[11px] tracking-[0.4em] uppercase text-muted-foreground mb-2">
              Curated
            </p>
            <h2 className="font-display text-3xl md:text-4xl">
              {collection.title}
            </h2>
            {collection.description && (
              <p className="mt-3 max-w-xl mx-auto text-sm text-muted-foreground">
                {collection.description}
              </p>
            )}
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collection.artworks.map((art, index) => (
              <ArtworkCard
                key={art.id}
                {...art}
                index={index}
                onClick={() => setOpen({ collectionId: collection.id, index })}
              />
            ))}
          </div>
        </div>
      ))}

      {activeCollection && open && (
        <Lightbox
          artworks={activeCollection.artworks}
          currentIndex={open.index}
          isOpen
          onClose={() => setOpen(null)}
          onNavigate={(idx) =>
            setOpen({ collectionId: activeCollection.id, index: idx })
          }
        />
      )}
    </section>
  );
};

export default CollectionsShowcase;
