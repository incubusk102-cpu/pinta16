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

const RoomPairingArticle = () => {
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
        Home decor
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        Choosing the right painting for every room
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        A room-by-room playbook for decorating with original, hand-painted
        canvas: how to size the piece, what subject and palette pair best with
        each space, and the small placement details that decide whether a
        painting feels like a focal point or background noise.
      </motion.p>

      {/* Hero ad — first impression for readers landing from organic search. */}
      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The two questions to answer before you shop
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Before you scroll through a single gallery page, answer two questions
          about the wall you have in mind. First: what is the wall's purpose in
          the room? A wall behind a sofa anchors the seating; a wall opposite a
          dining table sets the room's tone every time someone sits down; a
          hallway wall is glimpsed in motion. Each purpose calls for a different
          scale, palette, and subject. Second: what time of day is the wall most
          often seen? A bedroom-facing wall is mostly viewed in low light; a
          dining-room wall hosts both daytime brunches and candlelit dinners; an
          office wall lives under overhead fluorescents from 9 to 6. Lighting
          changes how every pigment reads, and the wrong painting under the
          wrong light reads as muddy or flat.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Once those two answers are clear, sizing usually solves itself. The
          rule of thumb that has held up across decades of interior practice:
          the artwork should span roughly two-thirds the width of the furniture
          piece it sits above, hung so the centre of the painting is at the eye
          level of a standing adult (around 57 inches from the floor) or a few
          inches above the back of a sofa or headboard. Smaller paintings
          floating alone on a large wall almost always look like an afterthought
          — they need either a frame that adds visual weight, or a grouping of
          two-to-five companion pieces to hold the wall together.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Living room: anchor the seating, not the wall
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The most common interior-design mistake is treating the living room
          wall as the subject and the sofa as an accessory underneath. It's the
          other way around. The painting's job is to anchor the seating zone —
          to give the eye somewhere to land when you sit down — which means the
          piece should relate to the sofa in scale and palette, not to the wall
          as a whole.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For a standard three-seater (around 84 inches wide), look for an
          artwork between 48 and 60 inches across. A single horizontal canvas is
          the safest choice; a diptych or triptych works if the panels read as
          one composition rather than three separate paintings. Hang the piece
          so the bottom edge sits 6 to 10 inches above the back of the sofa —
          closer to 6 if the painting is busy, closer to 10 if it's calm. Any
          higher and the painting floats; any lower and it crowds the backs of
          anyone sitting down.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          On subject and palette: the living room is where most households host
          guests, so the painting carries a social role too. Abstract pieces and
          landscape compositions both work well because they invite conversation
          without demanding a specific reading. Vibrant tropical florals, palm
          and monstera studies, and warm-toned seascapes are all natural fits
          for Filipino homes — they read as Manila first rather than a generic
          catalogue purchase. Avoid highly literal portraits in the main living
          space; portraits read better in studies, bedrooms, or dedicated
          gallery walls where the relationship between viewer and subject is
          more intentional.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          If your living room opens onto a kitchen or dining area (common in
          condo layouts), check that the painting reads well from both rooms.
          Walk to the kitchen, look back at the wall, and ask whether the piece
          still anchors the space from that angle. A painting that disappears
          from the secondary viewing angle is one you'll regret within a year.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Dining room: a focal point that survives every meal
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The dining wall is unique because the painting will be looked at for
          long, uninterrupted stretches — every dinner, every birthday, every
          long Sunday lunch. That changes the calculus. A piece that's
          immediately striking but loses interest after the third viewing will
          quietly drag the room down for years. Pick a painting with at least
          three layers of detail: a strong overall composition, a mid-range
          rhythm in colour or brushwork, and small surface details that reward a
          closer look across the table.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Scale here is dictated by the table, not the wall. For a six-seater
          dining table (around 72 inches long), the painting wants to be between
          40 and 54 inches wide and hung with its centre roughly 28 inches above
          the tabletop — close enough that diners read it as part of the table's
          environment, not as a separate "art wall" behind the room. A single
          statement piece is almost always stronger than a gallery wall here;
          the dining table itself is busy enough without a competing grid above
          it.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Lighting matters more in the dining room than anywhere else in the
          house. Most dining rooms run a pendant or chandelier over the table,
          which throws downward light onto the table and leaves the back wall in
          relative shadow. A painting hung under those conditions wants either
          bolder pigments to compensate, or a dedicated picture light mounted
          above the frame. A 2700K to 3000K LED picture light is the safe choice
          — it warms the painting under candlelit dinners and stays true to the
          artist's intended palette during the day.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          On subject: food, still life, market scenes, and abstract pieces with
          warm undertones all sit naturally in the dining room. Skip anything
          unsettling or aggressively conceptual — the dining table is not the
          place for a painting that needs a wall text to make sense.
        </p>
      </motion.section>

      {/* Mid-article ad — readers who got this far are engaged; rectangle
          format reads naturally as an interstitial. */}
      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Bedroom: calm, low light, soft palette
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Bedroom art has one job: make the room feel like a place you want to
          fall asleep in. That rules out high-contrast pieces with strong
          black-and-white compositions, large faces staring back at the bed, and
          anything in saturated primary colours. What works is anything that
          reads quietly under low light — soft abstracts, landscape compositions
          with muted skies, gentle florals, and minimalist line-work on toned
          grounds.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Scale follows the headboard, not the bed frame. For a queen headboard
          (around 60 inches wide), pick a painting between 36 and 48 inches
          across; for a king headboard (76 inches), aim for 48 to 60 inches.
          Hang the piece so the bottom edge sits 4 to 8 inches above the
          headboard. If you don't have a headboard, the wall behind the pillows
          takes over the headboard's role and the same rules apply.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          A trick that almost no one uses but should: put a small accent piece
          on the wall opposite the bed too. That's the wall your eye lands on
          first thing in the morning, before you stand up, and the right
          painting there does more for the mood of the room than the larger
          piece behind your head. It can be small — even 12 by 16 inches — but
          it should be deliberate.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Hallway and entry: pieces seen in motion
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The entry foyer and hallway are spaces you walk through, not sit in,
          so the painting needs to land in a single glance. That favours bold
          single-subject work — a striking portrait, a high-contrast abstract, a
          saturated landscape — over quieter compositions that reward long
          looking. The painting also sets first impressions for guests, so this
          is where many homes place their statement piece.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Hallways are also the natural home for a gallery wall — a grid of
          three to seven smaller pieces that the eye reads sequentially as you
          walk past. The rules for a successful gallery wall are simple: keep
          one variable consistent (frames, palette, or subject) and vary the
          others. A grid of seven different paintings in mismatched frames with
          mismatched palettes and mismatched subjects reads as clutter; a grid
          of seven different paintings in matching black float frames reads as a
          curated collection.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Lay out the gallery wall on the floor first. Cut newspaper or
          brown-paper templates the size of each piece, tape them to the wall
          with painter's tape, and live with the arrangement for two or three
          days before you put a single nail in the wall. The arrangement that
          looked perfect the night you bought the pieces almost always wants
          tweaking once you've walked past it forty times.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Home office and kid-friendly spaces
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The home office is the room people most often under-decorate, and it's
          the room a painting can change the most. The right piece in the
          peripheral vision of your desk lowers the felt monotony of a long
          workday in a way that's hard to measure but easy to feel. Pick
          something that doesn't directly compete with screen time — soft
          abstracts, atmospheric landscapes, or single-subject still lifes work
          well; anything frenetic or text-heavy is going to fight your laptop
          for attention.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For kid-friendly rooms (nurseries, play areas, the wall between two
          kids' bedrooms), pick original paintings rather than mass-produced
          prints — children form attachments to original art the same way adults
          do, and the painting can travel with them across moves and life
          stages. Stick to warmer palettes and friendly subjects (animals,
          weather, simplified landscapes), and hang the piece slightly lower
          than gallery height — 48 to 52 inches off the floor instead of 57 — so
          it sits at a child's eye level rather than an adult's.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          One practical caveat: don't hang an unframed canvas or a piece with
          delicate float-frame edges in a space where toddlers or pets have
          access to the corners. Floor-to-ceiling shelving above the piece, or a
          sturdy moulding frame with covered edges, both solve the problem
          without ruling out original art for the room.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          One painting, many rooms: the case for moving art around
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A point most decorating guides quietly ignore: the right room for a
          painting changes over time. A piece that anchored the living room of a
          one-bedroom condo at age twenty-eight will not necessarily anchor the
          living room of a four-bedroom house at age thirty-eight — and that's
          fine. Original paintings are easier to move between rooms than most
          furniture, and a painting that's outgrown its first home almost always
          finds a strong second one elsewhere in the house.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          When you do move a piece, walk through the sizing and lighting
          checklist again from scratch. The painting that was perfectly sized
          above a three-seater sofa is going to look small above a five-seater;
          the lighting that flattered it in a north-facing bedroom may wash it
          out in a south-facing dining room. Treat each move as a
          re-introduction, not just a relocation, and the painting will keep
          paying dividends across the life of the home.
        </p>
      </motion.section>

      {/* Footer ad — readers who got to the end are highly engaged.
          Auto format lets AdSense pick the best fit. */}
      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="choosing-art-for-every-room" />
    </SectionReveal>
  );
};

export default RoomPairingArticle;
