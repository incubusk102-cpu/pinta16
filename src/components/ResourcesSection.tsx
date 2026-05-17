import { motion } from "framer-motion";
import SectionReveal from "@/components/motion/SectionReveal";
import AdUnit from "@/components/AdUnit";

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const ResourcesSection = () => {
  return (
    <SectionReveal
      as="section"
      id="resources"
      from="bottom"
      distance={60}
      duration={0.95}
      staggerChildren={0.08}
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto"
    >
      {/* Page header */}
      <motion.p
        variants={fadeInUp}
        className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4 text-center"
      >
        For art lovers
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6 text-center"
      >
        Resources
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-12 text-center"
      >
        Practical guides for living with original canvas paintings — how to
        hang, light, clean, and frame the pieces you collect so they keep
        looking the way the artist intended for decades to come.
      </motion.p>

      {/* Ad placement 1 — directly under the hero so the visitor sees a
          full impression before they begin reading. Horizontal banner
          format matches the editorial column width on desktop. */}
      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      {/* Section 1 — Care */}
      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Caring for an original canvas painting
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Original acrylic and oil paintings on stretched canvas are far more
          forgiving than people often assume, but a few small habits make the
          difference between a piece that ages gracefully and one that yellows,
          cracks, or sags within a decade. Treat the canvas like a piece of fine
          furniture: keep it out of direct sunlight, away from heat sources, and
          let the ambient humidity do most of the work.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For routine cleaning, a soft, dry, lint-free cloth (microfiber works
          well) and a feather duster are all you need. Wipe in one direction —
          top to bottom, never circular — and never apply water, household
          cleaners, or commercial polishes directly to the surface. Most paints
          used in contemporary canvas work are water-soluble until fully cured,
          and even fully cured pieces can lift their varnish layer if scrubbed
          wet.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          If a piece picks up a stubborn smudge or a fingerprint that won't lift
          with dry dusting, take it to a professional conservator rather than
          reaching for a damp cloth. A consult is usually inexpensive compared
          to the cost of an inpainting repair after an at-home cleaning goes
          wrong.
        </p>
      </motion.section>

      {/* Section 2 — Hanging & lighting */}
      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Hanging height and gallery lighting
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The single most common mistake in home installation is hanging
          paintings too high. The gallery convention is to centre the piece at
          57 inches (≈ 145 cm) from the floor — eye level for an average
          standing adult. In a room where most viewing happens seated (over a
          sofa, in a dining room) you can drop that centre line by 4–6 inches
          and the painting will feel better integrated with the furniture.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          When pairing multiple pieces, treat the cluster as a single rectangle
          and centre the whole shape at 57 inches rather than centring each
          painting individually. Keep 2–3 inches between frames in a tight grid,
          or 4–5 inches when the works are deliberately different sizes.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Lighting is where most living rooms underdeliver. Direct sunlight will
          bleach pigments over a decade; halogen and incandescent picture lights
          run hot enough to dry out the paint film. Aim instead for a low-UV,
          2700 K – 3000 K LED fixture mounted on the wall above the painting,
          angled down at 30°. Battery-operated cordless picture lights with a
          soft warm-white temperature are now inexpensive and avoid the
          renter-unfriendly hardwiring problem.
        </p>
      </motion.section>

      {/* Ad placement 2 — mid-content, between the practical care +
          hanging guidance and the more technical framing / humidity
          section that follows. Rectangle format reads naturally as an
          interstitial block in an editorial column. */}
      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      {/* Section 3 — Framing */}
      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          A short guide to framing
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Canvas paintings have a choice that works on paper doesn't: stretched
          canvas with painted edges can be hung directly, unframed, and reads as
          deliberately contemporary. A floater frame — a thin moulding that
          surrounds the canvas with a consistent 6–10 mm gap — preserves that
          minimalist feel while giving the piece a defined edge and protecting
          the corners.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Traditional moulding frames (rabbeted, with the canvas inserted from
          behind) suit representational, classical, and impressionist work but
          visually shorten the painting by covering 8–12 mm of its outer edge.
          Always have an experienced framer fit the canvas — pressure-fitting a
          stretched canvas into too tight a rabbet can crack the gesso layer
          along the edge, and the damage isn't visible until you remove the
          frame a decade later.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For oil and heavy-impasto pieces, leave at least a 3 mm air gap
          between the canvas surface and the inner lip of the frame. Trapping a
          still-curing oil painting flush against the rabbet creates a sealed
          pocket where solvents cannot escape, and the painting will yellow
          visibly within a few years.
        </p>
      </motion.section>

      {/* Section 4 — Humidity & storage */}
      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Humidity, climate, and long-term storage
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The Philippines' tropical climate is more forgiving for paintings than
          colder, drier environments — Manila's average relative humidity hovers
          comfortably between 70 % and 85 %, which sits within the
          conservation-recommended 45 %–75 % envelope for most of the year. The
          two things to actively avoid are abrupt swings (turning aircon off
          overnight when the day was air-conditioned, leaving a piece in an
          enclosed car) and prolonged exposure to humidity above 80 %, which
          encourages mould bloom along the cotton-canvas weave.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          If you need to store a painting for more than a few weeks, stand it on
          its longer edge with the painted face inward, separated from the next
          piece by a sheet of glassine or acid- free tissue. Never lay it flat —
          dust collects in the textured paint surface and is difficult to remove
          without disturbing the impasto. Avoid bubble wrap directly on the
          surface; the plasticiser in the bubbles can transfer to the paint film
          and leave a permanent matte ring once peeled away.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For longer storage (six months or more) wrap the painting face-side-in
          with glassine, then in unbleached cotton sheeting, and place it in a
          wooden crate or a sturdy cardboard box with a few silica gel packets
          to buffer humidity spikes. Label the outside of the package with the
          painting's orientation so whoever unpacks it knows which way is up.
        </p>
      </motion.section>

      {/* Section 5 — Investing in original work */}
      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Buying original art for your home
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The most reliable way to build a collection that holds its appeal
          long-term is to buy pieces you respond to viscerally, not pieces you
          think will appreciate. A painting you love looking at every morning is
          worth more, year after year, than one chosen for resale speculation.
          Trust the room test: ask to see the piece against a neutral wall in
          natural light, and if you can, request a photo of it in your own room
          before you commit.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Always insist on documentation. A certificate of authenticity signed
          by the artist, a clear photograph of the back of the stretched canvas,
          and a sale receipt with the artist's full name and the title and year
          of the work are the minimum. Provenance — the chain of past owners —
          matters less for a new commission but becomes important the moment a
          piece enters the secondary market.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          When buying directly from a working artist, ask about materials. A
          canvas primed with archival gesso, stretched over a kiln-dried
          hardwood bar, and finished with a removable varnish layer will outlast
          the same composition painted on a pre-primed staple-grade canvas by
          decades. Most artists are happy to discuss the technical side of their
          craft; the ones who can't usually aren't worth collecting.
        </p>
      </motion.section>

      {/* Ad placement 3 — near the footer of the article, after the
          reader has worked through the substantive guidance. Auto
          format lets AdSense pick the best fit for the space. */}
      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <motion.p
        variants={fadeInUp}
        className="font-body text-xs text-muted-foreground/80 mt-12 text-center"
      >
        Have a question we didn't cover? Email{" "}
        <a
          href="mailto:support@canvhub.com"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          support@canvhub.com
        </a>{" "}
        — we update this page based on the questions our customers ask most
        often.
      </motion.p>
    </SectionReveal>
  );
};

export default ResourcesSection;
