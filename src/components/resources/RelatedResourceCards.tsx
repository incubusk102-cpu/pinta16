import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  },
};

// Article catalogue — kept in one place so a new article only needs to
// be appended here and the hub page + every related-card grid picks it
// up automatically. The `slug` matches the route file name's trailing
// segment (`/resources/<slug>`), which is what `<Link to>` consumes.
export const RESOURCE_ARTICLES = [
  {
    slug: "canvas-care",
    eyebrow: "Care & conservation",
    title: "Caring for original canvas paintings",
    blurb:
      "Dusting routines, cleaning mistakes to avoid, when to call a conservator, and how Philippine humidity affects the paint film.",
  },
  {
    slug: "framing-original-paintings",
    eyebrow: "Framing",
    title: "A framer's guide to original canvas",
    blurb:
      "Float frames vs. moulding frames, oil-painting air gaps, rabbet depth, and why pressure-fitting a stretched canvas is a decade-delayed disaster.",
  },
  {
    slug: "hanging-art-gallery-style",
    eyebrow: "Installation",
    title: "Hanging art at gallery height",
    blurb:
      "The 57-inch convention, sofa-line adjustments, multi-piece clusters, picture lights, and why most living rooms hang art six inches too high.",
  },
  {
    slug: "humidity-and-storage",
    eyebrow: "Long-term storage",
    title: "Humidity, climate, and long-term storage",
    blurb:
      "Tropical-climate storage techniques, glassine wrapping, the typhoon-season exterior-wall rule, and how to crate a painting for a six-month move.",
  },
  {
    slug: "buying-art-as-investment",
    eyebrow: "Collecting",
    title: "Buying original art as investment",
    blurb:
      "Primary-market provenance, the role of certificates of authenticity, secondary-market liquidity, and why loving a piece first usually beats price speculation.",
  },
  {
    slug: "commissioning-custom-painting",
    eyebrow: "Commissioning",
    title: "How to commission a custom painting",
    blurb:
      "Briefing the artist, milestones and deposits, scope changes, photographing reference material, and a sample commission contract you can adapt.",
  },
] as const;

export type ResourceSlug = (typeof RESOURCE_ARTICLES)[number]["slug"];

interface RelatedResourceCardsProps {
  /** Slug of the article currently being viewed — excluded from the grid. */
  exclude?: ResourceSlug;
  /** Optional override for the heading; defaults to "More guides". */
  heading?: string;
}

const RelatedResourceCards = ({
  exclude,
  heading = "More guides",
}: RelatedResourceCardsProps) => {
  const cards = RESOURCE_ARTICLES.filter((a) => a.slug !== exclude);

  return (
    <motion.section
      variants={fadeInUp}
      className="mt-16 pt-12 border-t border-border/30"
    >
      <h2 className="font-display text-2xl md:text-3xl text-foreground mb-8">
        {heading}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.slug}
            to="/resources/$slug"
            params={{ slug: card.slug }}
            className="group block p-6 rounded-xl border border-border/40 hover:border-border bg-card/50 hover:bg-card transition-colors"
          >
            <p className="font-body text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-3">
              {card.eyebrow}
            </p>
            <h3 className="font-display text-lg text-foreground mb-2 flex items-start gap-2 leading-snug">
              <span className="flex-1">{card.title}</span>
              <ArrowUpRight className="w-4 h-4 mt-1 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
            </h3>
            <p className="font-body text-sm text-muted-foreground leading-relaxed">
              {card.blurb}
            </p>
          </Link>
        ))}
      </div>
    </motion.section>
  );
};

export default RelatedResourceCards;
