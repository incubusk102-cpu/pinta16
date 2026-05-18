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

const FramingArticle = () => {
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
        Framing
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        A framer's guide to original canvas
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        Frame choice changes a painting twice — once for the buyer in the living
        room, and again for the conservator in fifty years. This is the long
        version of the conversation we have with collectors when they ask "do I
        really need to frame this?"
      </motion.p>

      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Float frame vs. moulding frame
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The first decision is structural: do the edges of the canvas show or
          not? A float frame (sometimes called a tray or shadow-box frame)
          leaves a small reveal between the canvas edge and the inner face of
          the frame, so the painting appears to float inside a deep dark border.
          A moulding frame (traditional rabbeted frame) covers the canvas edges
          with a moulding profile, which can be ornate (gilt, gesso,
          Spanish-colonial-style carving) or quiet (flat black ash, oiled
          walnut).
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For most contemporary canvas paintings — especially Filipino
          contemporary work, where the artist often paints the canvas edges as
          part of the composition — a float frame is the correct choice. It
          preserves the artist's intent (visible edges) while still giving the
          painting the visual gravitas of a frame. For older or more classical
          work where the painting "stops" at the canvas edge, a moulding frame
          can be the better fit, especially in a traditional interior.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The reveal gap on a float frame is a matter of taste. A 6–8 mm reveal
          reads as quiet and respectful of the artwork; a 12–15 mm reveal reads
          as gallery-grand and gives the painting more breathing room. Avoid
          reveals wider than 20 mm — the canvas starts to feel adrift from the
          frame rather than held by it.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Rabbet depth, oil paintings, and the air gap
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A frame's rabbet is the L-shaped recess on its inner edge that holds
          the artwork. For a typical 18 mm-deep stretched canvas, the frame's
          rabbet needs to be at least 22 mm deep so the canvas sits comfortably
          with a small gap behind it. Too shallow and the canvas protrudes from
          the back of the frame; too deep and the frame visually dwarfs the
          painting.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For oil paintings specifically, leave 3–5 mm of air between the back
          face of the canvas and the back face of the frame's rabbet. Oil paint
          releases volatile organic compounds for years after it appears dry —
          the air gap lets these gases escape rather than accumulate against the
          back of the canvas, where they can cause yellowing or mould bloom on
          the bare cotton fibres. Most framers handle this automatically with
          felt or rubber bumpers, but it's worth asking explicitly.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Never pressure-fit a stretched canvas into a too-tight frame. Under
          tropical humidity swings, the wooden stretcher bars expand and
          contract by 1–2 mm per metre. A canvas that's tight against the frame
          in February can buckle the frame's mitres by July, or worse, transmit
          the pressure into the painting itself, causing the canvas to lift away
          from the stretcher edges. Aim for 2 mm of clearance on all four sides
          — the canvas should drop into the rabbet with a slight wiggle, not be
          wedged in.
        </p>
      </motion.section>

      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Backing, mounting hardware, and dust seals
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The back of a framed painting is where the conservation lives or dies.
          Ask the framer to install a backing board of acid-free foam-core or
          archival corrugated polyethylene, mounted with stainless or brass
          screws (never staples, which rust in months in Philippine humidity).
          The backing board protects the canvas from dust, insect damage, and
          accidental punctures when the painting is moved.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Above the backing, a dust seal of archival paper tape sealed around
          the perimeter of the frame's back keeps household dust and gecko
          droppings — yes, this is a real and recurring conservation issue in
          Philippine homes — out of the void between the canvas and the backing
          board. A good dust seal lasts twenty years without intervention.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For mounting hardware, D-rings rated for at least three times the
          weight of the framed piece are the standard. Sawtooth hangers are fine
          for small works under five kilos; above that, they tend to slip under
          the painting's weight and end with the piece on the floor. The wire
          connecting the D-rings should be braided stainless steel; coated
          picture wire frays and rusts within a decade.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          UV glazing — when (and when not) to use it
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Original oil and acrylic paintings on canvas are almost never glazed.
          The varnish layer acts as the painting's protective barrier, and
          putting glass over a varnished oil painting actually accelerates
          moisture buildup behind the glass, which causes the varnish to bloom
          (turn cloudy) within a few years. Glass also changes the way the
          painting reads optically — light bounces off the glazing rather than
          penetrating into the paint film.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The exception is works on paper that are also framed as canvas-
          adjacent pieces — watercolours, drawings, mixed media on paper mounted
          on stretcher bars. For these, UV-filtering acrylic glazing (Optium
          Museum Acrylic or equivalent) is the gold standard. Plain glass is
          acceptable but heavier and more fragile. Never use a UV-filtering
          polyester sheet for canvas work; the film off-gasses for years and can
          damage the painting underneath.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For exceptionally light-sensitive contemporary work (some natural
          pigments, certain inks, fugitive watercolours), discuss UV treatment
          with the artist before framing. Some artists prefer their work be
          allowed to fade naturally as part of the piece's life; others have
          strong opinions on UV protection. There is no single correct answer,
          only the artist's intent.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Working with a framer in the Philippines
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Manila has a handful of framers who understand contemporary canvas
          work — most clustered around Quezon City and Marikina, with a few in
          Makati and BGC. Expect to pay between ₱2,500 and ₱8,000 for a quality
          float frame on a medium piece (60 × 80 cm), and significantly more for
          ornate or large work. Get at least two quotes for any frame over
          ₱10,000; pricing varies wildly.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Ask any framer three questions before handing over the piece: What is
          the rabbet depth? What backing board do you use? Do you install dust
          seals? A framer who can answer all three without hesitation is one to
          trust; a framer who's vague about backing materials is one to avoid.
          Frame mouldings made from kiln-dried Philippine hardwoods (narra,
          kamagong, akle) are excellent for local humidity; imported MDF or pine
          mouldings tend to warp within five years and should be avoided for
          anything you intend to keep.
        </p>
      </motion.section>

      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="framing-original-paintings" />
    </SectionReveal>
  );
};

export default FramingArticle;
