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

const HumidityArticle = () => {
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
        Long-term storage
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        Humidity, climate, and long-term storage
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        Living in the Philippines means your pieces live with you in 85%
        humidity for nine months of the year. Most of the time that's fine; in a
        handful of edge cases — moving house, renovating, leaving for an
        extended trip — knowing how to store a piece properly is the difference
        between a piece that lasts a lifetime and one that returns with mould
        bloom.
      </motion.p>

      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The Philippine humidity profile, piece-by-piece
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The Philippines hovers around 70–85% relative humidity for most of the
          year, with the rainy season (June through October) pushing
          consistently above 85% indoors. For pieces, the conservation envelope
          is 45–75% RH, with relatively stable conditions being more important
          than the exact number. A piece kept steady at 80% for years is usually
          fine; a piece that swings between 50% and 90% within a single week of
          typhoon weather is the one that fails.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The two failure modes are equally serious. Below 45% RH (common in
          aggressively air-conditioned BGC and Makati condos), the canvas
          tightens and microcracks appear in the paint film. Above 85% RH for
          sustained periods, mould blooms on the back of the canvas, the gesso
          layer can delaminate from the cotton support, and the wooden stretcher
          bars start to warp. Both problems accelerate above a threshold and are
          very difficult to reverse, so prevention is the entire game.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          A ₱2,500 indoor hygrometer with min/max recall is the single most
          useful tool in a collector's kit. Place one near any major piece and
          check it weekly for the first month after install; you'll learn the
          room's profile, which often turns out to be quite different from the
          rest of the house. A bedroom that's aircon'd overnight and then sealed
          during the day routinely swings 25 RH points in 24 hours — and the
          piece wears that cycle like a calendar.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Day-to-day climate control
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          For homes that run air conditioning aggressively, a small humidifier
          in the room keeps RH from dropping below 45% during the dry season or
          overnight aircon cycles. A ₱2,500–4,000 ultrasonic humidifier with a
          built-in hygrometer and a 4–6 hour tank is sized correctly for a
          single bedroom or living area. Position it at least 1.5 metres from
          the piece so no direct mist lands on the canvas; pointing it away from
          the piece is better than pointing it toward.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For non-aircon homes during the rainy season, a dehumidifier serves
          the same role in reverse. A 10–12 L/day compressor dehumidifier
          (₱8,000–15,000 on the secondary market) handles a 50-square-metre
          living room comfortably. Empty the collection tank daily during heavy
          rain; some models drain via a hose directly to a floor drain, which is
          the more reliable option for collectors who travel.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For homes with neither aircon nor a dehumidifier, the simplest and
          cheapest intervention is to keep the rooms with pieces well-ventilated
          — at least one window or door open during daylight hours, and a small
          fan moving air gently across the back of the piece. Stagnant humid air
          is the single most dangerous condition for an original canvas; flowing
          humid air is much more forgiving.
        </p>
      </motion.section>

      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Wrapping a piece for short-term storage
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          For storage of a few days to a few weeks — moving house, renovation, a
          trip away — wrap the piece in glassine paper, face-out, with the paper
          covering the painted surface and the back of the stretcher. Glassine
          is a smooth, archival, acid-free paper that doesn't react with the
          paint film and lets the piece breathe slightly under the wrap. A
          standard 60 × 80 cm piece takes about two metres of 80 gsm glassine,
          available from any framer for around ₱100–200 per metre.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Over the glassine, add a layer of bubble wrap with the bubbles facing
          outward (so the smooth side of the bubble wrap is what touches the
          glassine). Bubble wrap directly against a painted surface, even
          through glassine, will leave faint impressions of the bubble pattern
          in the paint film if left for more than a couple of weeks. The painted
          surface should face away from any wrapping material that can leave
          imprints — that's the entire point of the glassine layer.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Never wrap an original piece in plastic sheeting alone. Plastic traps
          moisture against the canvas and creates a microclimate of trapped
          condensation that's perfect for mould growth. Some movers will offer
          to "tarp" a piece for protection during transport; ask them to use
          glassine and archival corrugated board instead.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Crating for transport or long-term storage
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          For storage longer than a month, or for any inter-island transport, a
          custom crate is the right answer. A proper art crate is built from
          kiln-dried marine plywood, lined with acid-free foam padding cut to
          the exact dimensions of the piece, and includes a moisture-absorbing
          silica gel sachet (renewable, around ₱500 for 250 g) inside the sealed
          crate. Manila has a half-dozen art handlers who build crates to museum
          standard; expect to pay ₱4,000–8,000 for a crate sized for a medium
          piece (under 100 × 120 cm).
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The crate should have at least 25 mm of foam padding between the piece
          and every interior wall, and the foam must be archival-grade
          closed-cell polyethylene rather than open-cell polyurethane (which
          off-gasses for years). The crate's lid is fastened with screws (never
          nails), and the interior is sealed with archival tape rather than
          packing tape (which leaves residue and degrades over time).
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For long-term storage, store the crate upright (never flat), off the
          floor (on a pallet or shelf, at least 10 cm above floor level),
          against an interior wall (not an exterior wall where moisture
          transmits), and in a room that maintains 50–70% RH year-round. A
          basement storage in Tagaytay is generally fine; an outdoor storage
          container in Pasay is generally not, regardless of how well it's
          crated.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The typhoon-season exterior-wall rule
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Filipino construction varies wildly in wall quality. A typical
          concrete-hollow-block (CHB) exterior wall transmits enough
          condensation during a heavy typhoon to leave the back of any piece
          hanging against it damp for days. Even well-finished plaster walls in
          newer condos can show condensation during the most intense rain
          events.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The rule, learned from talking to conservators who have rescued pieces
          after Yolanda and Ondoy: during typhoon warnings of signal 3 or
          higher, move any original piece on an exterior wall to an interior
          wall, or wrap it in glassine and bubble wrap and store flat in a
          closet on an interior wall. The hour spent moving pieces before a
          major storm is the cheapest insurance in collecting.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          After any major storm, run a hygrometer near each piece for a week to
          confirm the room's humidity is settling back to normal. If RH stays
          above 85% for more than a few days, ventilate aggressively or
          temporarily move the piece to a drier room — even a closet with a
          small dehumidifier is better than leaving the piece in a saturated
          room.
        </p>
      </motion.section>

      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="humidity-and-storage" />
    </SectionReveal>
  );
};

export default HumidityArticle;
