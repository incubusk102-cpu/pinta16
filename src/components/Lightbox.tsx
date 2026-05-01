import { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCart } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import {
  getEffectivePrice,
  getDiscountPercent,
} from "@/contexts/ProductContext";
import {
  AVAILABILITY_LABEL,
  isPurchasable,
  type Availability,
} from "@/lib/artworks";

interface LightboxProps {
  artworks: {
    id: string;
    image: string;
    mockup?: string;
    title: string;
    medium: string;
    year: string;
    price: number;
    salePrice?: number;
    description: string;
    availability?: Availability;
  }[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const Lightbox = ({
  artworks,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
}: LightboxProps) => {
  const { addToCart } = useCart();
  const {
    config: { vacationMode },
  } = useStorefrontConfig();
  const [zoomed, setZoomed] = useState(false);
  const [showMockup, setShowMockup] = useState(false);
  const art = artworks[currentIndex];

  const hasMockup = art?.mockup && art.mockup !== art.image;

  const handlePrev = useCallback(() => {
    onNavigate(currentIndex > 0 ? currentIndex - 1 : artworks.length - 1);
  }, [currentIndex, artworks.length, onNavigate]);

  const handleNext = useCallback(() => {
    onNavigate(currentIndex < artworks.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, artworks.length, onNavigate]);

  // On navigate or open: show painting first, then crossfade to mockup
  useEffect(() => {
    setZoomed(false);
    setShowMockup(false);
    if (hasMockup && isOpen) {
      const timer = setTimeout(() => setShowMockup(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, isOpen, hasMockup]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomed) setZoomed(false);
        else onClose();
      }
      if (e.key === "ArrowLeft" && !zoomed) handlePrev();
      if (e.key === "ArrowRight" && !zoomed) handleNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, handlePrev, handleNext, zoomed]);

  if (!isOpen || !art) return null;

  const displayImage = showMockup && hasMockup ? art.mockup! : art.image;

  return (
    <AnimatePresence>
      {zoomed ? (
        <motion.div
          key="zoomed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xl flex items-center justify-center cursor-zoom-out overflow-auto"
          onClick={() => setZoomed(false)}
        >
          <motion.img
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            src={displayImage}
            alt={art.title}
            className="max-w-[95vw] max-h-[95vh] object-contain select-none"
            draggable={false}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
            }}
            className="absolute top-6 right-6 p-3 text-white/80 hover:text-white transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center"
          onClick={onClose}
        >
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-3 text-foreground hover:bg-accent rounded-sm transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-2 md:left-8 p-2 md:p-3 text-foreground hover:bg-accent rounded-sm transition-colors z-10"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-2 md:right-8 p-2 md:p-3 text-foreground hover:bg-accent rounded-sm transition-colors z-10"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <div
            className="max-w-5xl w-full px-12 sm:px-16 md:px-16 max-h-[90vh] overflow-y-auto flex flex-col md:flex-row items-center gap-6 md:gap-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.img
                  key={`${currentIndex}-${showMockup}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                  src={displayImage}
                  alt={art.title}
                  className="max-h-[55vh] md:max-h-[70vh] max-w-full md:max-w-[60%] object-contain gallery-frame cursor-zoom-in select-none"
                  draggable={false}
                  onClick={() => setZoomed(true)}
                />
              </AnimatePresence>
              {getDiscountPercent(art) > 0 &&
                (art.availability ?? "available") === "available" && (
                  <span className="absolute top-3 left-3 px-2 py-0.5 bg-red-600 text-white font-body text-[10px] tracking-wider uppercase rounded-sm">
                    {getDiscountPercent(art)}% OFF
                  </span>
                )}
            </div>
            <div className="text-center md:text-left max-w-sm">
              <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                {art.medium} · {art.year}
              </p>
              <h3 className="font-display text-2xl md:text-3xl text-foreground mb-3">
                {art.title}
              </h3>
              <p className="font-body text-sm text-muted-foreground mb-4 leading-relaxed">
                {art.description}
              </p>
              <div className="font-body text-xl text-foreground font-semibold mb-4">
                {getDiscountPercent(art) > 0 ? (
                  <>
                    <span className="line-through text-muted-foreground text-base mr-2">
                      ₱{art.price.toLocaleString()}
                    </span>
                    <span>₱{getEffectivePrice(art).toLocaleString()}</span>
                    <span className="ml-2 text-sm text-red-500 font-semibold">
                      {getDiscountPercent(art)}% OFF
                    </span>
                  </>
                ) : (
                  <>₱{art.price.toLocaleString()}</>
                )}
              </div>
              {(() => {
                const availability: Availability =
                  art.availability || "available";
                // Vacation mode hides the buy button while keeping the
                // rest of the lightbox visible — buyers can still browse
                // and view details.
                const purchasable =
                  isPurchasable(availability) && !vacationMode.enabled;
                const buttonLabel = vacationMode.enabled
                  ? "Shop paused"
                  : purchasable
                    ? "Add to Cart"
                    : `${AVAILABILITY_LABEL[availability]}`;
                return (
                  <div className="flex flex-col gap-3">
                    {availability !== "available" && (
                      <span className="inline-flex w-fit items-center px-2.5 py-1 bg-foreground text-background font-body text-[10px] tracking-[0.3em] uppercase rounded-sm">
                        {AVAILABILITY_LABEL[availability]}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => {
                          if (!purchasable) return;
                          addToCart({
                            id: art.id,
                            image: art.image,
                            title: art.title,
                            medium: art.medium,
                            year: art.year,
                            price: getEffectivePrice(art),
                          });
                        }}
                        disabled={!purchasable}
                        className={`inline-flex items-center gap-2 px-8 py-3 font-body text-xs tracking-[0.2em] uppercase transition-all duration-300 rounded-sm ${
                          purchasable
                            ? "bg-foreground text-background hover:bg-foreground/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        }`}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {buttonLabel}
                      </button>
                      <Link
                        to="/product/$id"
                        params={{ id: art.id }}
                        onClick={onClose}
                        className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-accent transition-all duration-300 rounded-sm"
                      >
                        View details
                      </Link>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Lightbox;
