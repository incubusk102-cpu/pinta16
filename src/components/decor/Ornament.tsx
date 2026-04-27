import { motion } from "framer-motion";

interface OrnamentProps {
  className?: string;
  label?: string;
}

/**
 * Decorative section header with two short rules flanking a small label.
 * Used to break up long pages with editorial / magazine-style seams.
 */
const Ornament = ({ className = "", label }: OrnamentProps) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
    className={`flex items-center gap-3 sm:gap-4 text-muted-foreground/70 ${className}`}
    aria-hidden
  >
    <span className="flex-1 h-px bg-gradient-to-r from-transparent via-current to-current/40" />
    <span className="font-body text-[10px] tracking-[0.4em] uppercase whitespace-nowrap">
      {label || "·   ·   ·"}
    </span>
    <span className="flex-1 h-px bg-gradient-to-l from-transparent via-current to-current/40" />
  </motion.div>
);

export default Ornament;
