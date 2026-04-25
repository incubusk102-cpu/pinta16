import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Menu, X, UserCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCart } from "@/contexts/CartContext";
import { useUserAuth } from "@/contexts/UserAuthContext";

const GalleryNav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount, openCart } = useCart();
  const { user } = useUserAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/10"
          : ""
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-5 flex items-center justify-between">
        <button
          onClick={() => scrollTo("hero")}
          className="font-display text-xl tracking-[0.3em] uppercase text-gradient-elegant"
        >
          Pintaterra
        </button>
        <div className="hidden md:flex items-center gap-10">
          {[
            { id: "gallery", label: "Collection" },
            { id: "contact", label: "Contact" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500"
            >
              {item.label}
            </button>
          ))}
          {user && (
            <Link
              to="/account"
              className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500 inline-flex items-center gap-2"
            >
              <UserCircle className="w-4 h-4" />
              {user.name?.split(" ")[0] || "Account"}
            </Link>
          )}
          <button onClick={openCart} className="relative p-2">
            <ShoppingCart className="w-5 h-5 text-foreground" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background text-[10px] font-body font-semibold rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex md:hidden items-center gap-3">
          <button onClick={openCart} className="relative p-2">
            <ShoppingCart className="w-5 h-5 text-foreground" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background text-[10px] font-body font-semibold rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border/10 px-6 pb-6 flex flex-col gap-4"
          >
            {[
              { id: "gallery", label: "Collection" },
              { id: "contact", label: "Contact" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="font-body text-sm tracking-[0.3em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500"
              >
                {item.label}
              </button>
            ))}
            {user && (
              <Link
                to="/account"
                onClick={() => setMenuOpen(false)}
                className="font-body text-sm tracking-[0.3em] uppercase text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
              >
                <UserCircle className="w-4 h-4" />
                Account
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default GalleryNav;
