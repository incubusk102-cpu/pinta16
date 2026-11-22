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

const HangingArticle = () => {
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
        Installation
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        Hanging art at gallery height
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        Almost every piece you have ever loved in a museum or a gallery was hung
        according to a handful of unwritten conventions. This is the field
        manual for applying those conventions in a normal Filipino home — sofas,
        viewing angles, multi-piece clusters, and all.
      </motion.p>

      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The 57-inch convention (and when to break it)
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The 57-inch convention says that the visual centre of a piece —
          usually a few inches above the geometric centre, because pieces tend
          to have heavier composition below the midline — should sit at 57
          inches (≈ 145 cm) above the finished floor. This number isn't
          arbitrary: it's the average human eye height across a standing adult
          population, and it's the height that most museums and commercial
          galleries use as their default.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The convention exists because consistent hanging height is what your
          eye reads as "professional" when you walk into a gallery, even if you
          can't articulate why. In contrast, the average Filipino living room
          hangs pieces at 65–70 inches from the floor, six to twelve inches too
          high — the artist's centre line sits above the viewer's relaxed gaze,
          which subtly forces the eye upward and makes the room feel less
          inviting. Lowering the hang to 57 inches is the single
          highest-leverage change most collectors can make.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The convention bends in three situations. First, when hanging above a
          sofa, console, or piece of furniture: drop the piece so its bottom
          edge sits 15–25 cm above the top of the furniture. For a sofa at 85 cm
          and a piece that's 80 cm tall, that puts the centre at ≈ 140 cm —
          close to 57 inches anyway, but the reasoning is anchored to the
          furniture rather than the floor. Second, in rooms with unusually high
          or low ceilings: an eight-foot ceiling reads cramped if you hang at 57
          inches; a fourteen-foot ceiling reads cavernous. Adjust ±5 inches as
          the room demands. Third, when the piece will be viewed primarily from
          a seated position (dining rooms, lounges): drop the centre to 52–54
          inches.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Above the sofa — the trickiest case
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A piece above a sofa is the single most common arrangement in a
          Filipino home, and the one most often executed wrong. Three rules
          cover 95% of cases. First, the piece (or grouping) should be roughly
          two-thirds the width of the sofa beneath it — a 200 cm sofa wants a
          130–140 cm piece, or a multi-piece grouping that spans roughly that
          width. A piece that's only half the width of the sofa reads as
          undersized; a piece wider than the sofa reads as overbearing.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Second, the gap between the top of the sofa and the bottom of the
          piece should be 15–25 cm — enough that the piece feels anchored to the
          wall rather than perched on the furniture, but close enough that the
          eye reads sofa and art as one unit. Wider gaps work in formal settings
          (think hotel lobbies); tighter gaps work in cosy, low-ceilinged rooms.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Third, the centre line of the piece should align with the centre line
          of the sofa. This sounds obvious but is routinely violated when a sofa
          has been slightly shifted off its original alignment with the back
          wall. Measure both — don't trust your eye on this one, because the
          sofa's pattern or upholstery texture can throw the visual centre off
          by 5–10 cm without you noticing.
        </p>
      </motion.section>

      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Multi-piece clusters and salon walls
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A salon wall is a wall hung with multiple pieces in a tight
          arrangement, often of varying sizes and frames. Done well, it's one of
          the most personal and impressive arrangements in any home; done badly,
          it looks like a yard sale. The single most important rule is that the
          cluster, considered as one object, should obey the same centring rules
          as a single piece — its visual centre at ≈ 57 inches, its overall
          width about two-thirds of the wall or furniture beneath it.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Within the cluster, maintain consistent gaps between adjacent frames —
          5–8 cm is the typical range. Wider gaps make the cluster read as
          several independent pieces; narrower gaps make it read as a single
          dense unit. Pick one and stay consistent within the cluster; mixed
          gaps look careless.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Lay out the cluster on the floor first, then transfer it to the wall.
          Take a phone photo of the floor layout from directly above, and use
          that photo as your reference while hanging. Trace the outlines of each
          frame on craft paper and tape them to the wall before drilling — this
          catches alignment problems before they become drill holes you can't
          take back.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Lighting — colour temperature, angle, and intensity
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Pieces come alive under the right light and die under the wrong one.
          The single best investment most collectors can make is a 2,700 K–3,000
          K dimmable LED picture light on each major piece. 2,700 K reads warm
          and renders skin tones and earth pigments accurately; 3,000 K reads
          slightly cooler and is forgiving for blues and greens. Anything above
          3,500 K reads clinical and makes pieces look dull. Anything below
          2,500 K reads orange and shifts the piece's colour balance.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Aim picture lights so they strike the piece at a 30°-from- vertical
          angle — too shallow and the light bounces back at the viewer (causing
          glare on varnished surfaces); too steep and the texture of impasto
          throws long shadows. A small adjustable arm on the light fitting
          solves this; rigid wall-mounted fixtures almost always end up slightly
          wrong.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Intensity matters too. A piece needs roughly three times the ambient
          room lighting at its surface to read clearly without being washed out
          — measurable as 150–300 lux on the piece surface in a typical living
          room. Most modern dimmable LED fixtures cover this range comfortably.
          Avoid halogen or incandescent picture lights — they run hot,
          accelerate varnish yellowing, and have been effectively obsolete since
          2018.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Wall prep and the right hardware
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          For concrete walls (the default for most Philippine homes), use
          masonry anchors rated for at least three times the piece's weight. A 5
          kg piece is fine on a single plastic anchor with a 6 × 30 mm screw; a
          15 kg piece wants two anchors and ideally a French cleat. For drywall
          partitions in newer condos, locate the studs and screw directly into
          them — drywall anchors rarely outlive a year of humidity cycling in
          Manila.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For very heavy or very valuable pieces, a French cleat is the
          professional choice. The cleat distributes the weight across a long
          bar of wall hardware rather than concentrating it on two screws, and
          it lets you lift the piece straight off the wall for cleaning or
          transport without tools. A simple aluminium cleat costs about ₱500 per
          metre and is the single best hardware upgrade for any piece over 10
          kg.
        </p>
      </motion.section>

      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="hanging-art-gallery-style" />
    </SectionReveal>
  );
};

export default HangingArticle;
