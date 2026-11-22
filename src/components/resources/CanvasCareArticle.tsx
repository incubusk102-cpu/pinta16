import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import SectionReveal from "@/components/motion/SectionReveal";
import AdUnit from "@/components/AdUnit";
import RelatedResourceCards from "@/components/resources/RelatedResourceCards";

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const CanvasCareArticle = () => {
  return (
    <SectionReveal
      as="article"
      from="bottom"
      distance={60}
      duration={0.95}
      staggerChildren={0.08}
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto"
    >
      <motion.div variants={fadeInUp}>
        <Link
          to="/resources"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All resources
        </Link>
      </motion.div>

      <motion.p
        variants={fadeInUp}
        className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4"
      >
        Care &amp; conservation
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        Caring for original canvas pieces
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        A practical, paint-film-first guide to keeping an original canvas piece
        in showroom condition for decades. Written for collectors who love their
        pieces but don't want to think about them every week.
      </motion.p>

      {/* Hero ad — first impression for readers landing from organic search. */}
      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The five rules that matter
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Most "what happened to my piece" emails we receive trace back to one
          of five mistakes: direct sunlight, a damp cloth, a too-tight frame, a
          too-dry room, or a well-meaning house cleaner with a microfiber spray.
          Internalise these five rules and a contemporary acrylic or oil piece
          will outlive you with no further intervention beyond a feather duster.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The first rule: keep the piece out of direct sunlight. UV rays break
          the chemical bonds in modern pigments at a measurable rate — cadmium
          reds and ultramarines lose 5–15% of their chroma per decade when
          exposed to four or more hours of unfiltered sun daily. If the wall you
          love gets afternoon light, hang a UV-filtering window film or pick a
          different wall. The piece cannot be "moved off the sunny wall when
          nobody's home"; the damage is cumulative.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The second rule: never use a damp cloth on a painted surface. Most
          modern paints are water-soluble until fully cured (six to twelve
          months for oil, two to four weeks for acrylic), and even fully cured
          pieces can have their final varnish layer lifted by a wet wipe. The
          same applies to commercial spray cleaners — Windex, Pledge, and their
          cousins all contain solvents that will dissolve a varnish layer on
          contact.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The third rule: leave at least 3 mm of air between the back of the
          canvas and the wall. Hanging a piece flush against a tropical concrete
          wall traps moisture, encouraging mould bloom along the cotton-canvas
          weave. Most picture-hanging hardware (D-rings, sawtooth hangers)
          creates this gap automatically; some flush-mount designer brackets do
          not.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The fourth rule: keep the room's relative humidity between 45% and
          75%. Below 45%, the canvas tightens and microcracks appear in the
          paint film. Above 75% for extended periods, mould blooms and the gesso
          layer can delaminate. Manila and most of Luzon sit naturally in this
          band; air-conditioned condos in Bonifacio Global City often drop below
          40% overnight, which is the second-most-common source of conservation
          calls we hear.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The fifth rule: brief whoever cleans your home, including the monthly
          deep-cleaning service. A single pass with a feather duster along the
          piece's lower edge is fine; anything more aggressive requires explicit
          permission. Tape a small printed note to the back of the canvas
          listing the piece's title, year, and "do not clean with cloth or
          spray" so a fill-in cleaner doesn't make a costly decision in the
          moment.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Routine cleaning, week by week
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A weekly pass with a clean, dry feather duster is the entire routine
          for the first year. Use a real ostrich-feather duster (around ₱400 on
          the secondary market) rather than a synthetic microfiber wand; the
          synthetic bristles carry static charge that pulls dust toward the
          piece before lifting it away. Sweep from the top edge down, always in
          one direction, applying no pressure. The goal is to wipe the airborne
          dust off the highest points of the impasto before it bonds to the
          paint film.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Once a quarter, switch to a clean, dry, lint-free microfiber cloth and
          repeat the same top-to-bottom motion. This catches the fine dust the
          feather duster missed. If the piece has heavy impasto or texture, fold
          the cloth into a small pad and dab — never drag — across the textured
          areas.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Twice a year, inspect the piece under a strong raking light (a lamp
          held at a 30° angle to the surface, in an otherwise dark room). This
          makes any new cracks, lifting paint, or stretcher-bar warpage
          immediately visible. Photograph anything you find — even a phone photo
          with a timestamp creates a useful record if a conservator later needs
          to assess change over time.
        </p>
      </motion.section>

      {/* Mid-article ad — readers who got this far are engaged; rectangle
          format reads naturally as an interstitial. */}
      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          When to call a conservator (and how much it costs)
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Manila has a small but capable community of conservators — most
          affiliated with the National Museum, the Cultural Center of the
          Philippines, or one of the larger commercial galleries. A conservation
          consult is far cheaper than people assume: ₱2,000 to ₱4,000 for an
          in-studio visual assessment, plus the cost of the treatment itself if
          you proceed. For comparison, a single bad at-home cleaning attempt can
          cost ₱40,000 or more to inpaint and revarnish.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Call a conservator if you see any of: lifting paint that doesn't lie
          flat under a gentle dry-brush sweep, a visible bloom or haze
          (especially on a varnished oil piece), a tear in the canvas regardless
          of size, a section of stretched canvas that feels spongy when pressed
          from behind, or any insect damage along the stretcher bars. Do not
          attempt any of these repairs yourself; even a well-meaning attempt at
          re-adhering lifting paint with PVA glue can cause permanent damage
          that's far more expensive to reverse than the original problem.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Get a written estimate before any work begins, and ask the conservator
          to photograph the piece before, during, and after treatment. A good
          conservator will offer this proactively; a conservator who pushes back
          on documentation requests is one to avoid. For high-value pieces, get
          a second opinion before authorising anything irreversible (varnish
          removal, lining, inpainting).
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Tropical climate considerations
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The Philippines' humidity is mostly forgiving for pieces — the average
          relative humidity hovers between 70% and 85%, comfortably inside the
          45–75% conservation envelope for most of the year. The real risks are
          abrupt swings (turning aircon off overnight when the day was
          conditioned, leaving the piece in an enclosed car) and the
          rainy-season tail where indoor humidity can stay above 85% for weeks
          at a time.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For homes that air-condition aggressively (BGC condos, Makati
          high-rises), keep a small hygrometer near the piece and run a
          humidifier if the reading drops below 45%. A ₱2,500 ultrasonic
          humidifier with a built-in hygrometer is more than enough for a single
          room. For homes that don't air-condition, the bigger risk is the
          August–October rainy season — keep a dehumidifier or a few silica-gel
          packets near the piece and ventilate the room daily.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Never hang an original piece on an exterior wall during typhoon
          season. Even a well-insulated wall transmits enough condensation
          during a heavy rain to leave the back of the canvas damp for days.
          Move the piece to an interior wall, or store it in a sealed container
          with silica gel for the duration of the storm.
        </p>
      </motion.section>

      {/* Footer ad — readers who got to the end are highly engaged.
          Auto format lets AdSense pick the best fit. */}
      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="canvas-care" />
    </SectionReveal>
  );
};

export default CanvasCareArticle;
