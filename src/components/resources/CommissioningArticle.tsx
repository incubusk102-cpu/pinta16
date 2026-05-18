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

const CommissioningArticle = () => {
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
        Commissioning
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        How to commission a custom painting
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        Commissioning original work is the most rewarding way to build a
        collection — and the easiest way to lose money and burn an artistic
        relationship if you don't structure the engagement carefully. Here's the
        playbook we'd give a friend before their first commission.
      </motion.p>

      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Choosing the right artist
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The single most important decision in a commission is the artist, and
          the single most common mistake is commissioning an artist whose
          existing body of work doesn't already overlap significantly with what
          you want. An artist who paints atmospheric landscapes will reluctantly
          accept a portrait commission and produce something competent but
          uninspired; the opposite is true too. Commission within an artist's
          existing range, not at the edges of it.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Before reaching out, spend an hour looking at the artist's last two to
          three years of work — their gallery's website, their Instagram, any
          catalogue you can find. If you cannot point to three or four existing
          paintings that feel adjacent to what you want commissioned, you're
          either looking for the wrong artist or asking for the wrong thing.
          Better to find an artist whose existing work is already close to your
          brief than to push an artist into unfamiliar territory.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Reach out through the artist's gallery, not directly via DM. A gallery
          introduction does two useful things: it signals that you understand
          how the professional art world works, and it gives the artist someone
          to mediate the conversation if it gets difficult later. Galleries take
          a 30–50% commission on the commission fee, and that fee buys you a
          layer of professional process that's almost always worth it for a
          first-time commissioner.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The brief — what to give the artist
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A good commission brief is short, visual, and clear about constraints.
          The brief should fit on a single A4 page and cover five things: the
          dimensions and orientation, the room the painting will live in
          (including a photograph), three to five reference images from the
          artist's own work that capture the feeling you want, a paragraph of
          plain language describing the mood or subject (not technique — that's
          the artist's territory), and any hard constraints (specific colours to
          include or avoid, subjects to exclude, etc.).
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Avoid telling the artist how to paint. The brief is about the
          destination, not the route. "I want a landscape that feels like the
          western sky at sunset over the Sierra Madre, dominant burnt sienna and
          indigo, fitting the wall above the sofa in the attached photo" is a
          great brief. "I want a landscape painted in glazing technique with
          cadmium reds and ultramarine highlights" is bad — you're telling the
          artist their job, and the result will feel constrained.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For reference images, use the artist's own past work wherever
          possible. Pinterest mood boards of other artists' work tend to produce
          unhappy commissions — the artist either suppresses their own voice
          trying to match the references, or ignores the references and produces
          something that doesn't match the collector's expectation. The artist's
          own work is the safest common ground.
        </p>
      </motion.section>

      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Pricing, deposits, and milestones
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Commission pricing follows a few conventions. The base price is
          typically the artist's current per-square-foot rate for finished work,
          plus a 10–30% premium for the commissioned nature of the engagement.
          For a Filipino mid-career artist whose finished work sells for
          ₱2,000–4,000 per square foot at gallery prices, a 36 × 48 inch
          commission would typically quote at ₱40,000–60,000. Larger formats and
          more complex subjects sit above this range; smaller intimate works sit
          below.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Deposits and milestones are where commissions live or die. The
          standard structure: 50% deposit on signed agreement, 25% on approved
          colour sketch (a small painted study showing the composition, palette,
          and overall mood), 25% on delivery of the finished work. This
          structure protects both parties — the artist has working capital and
          isn't asked to finish the piece on speculation, and the collector has
          two natural off-ramps if the work goes in an unexpected direction.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The colour sketch milestone is the single most important checkpoint in
          any commission. A good colour sketch is a small painted study —
          typically 8 × 10 inches — that shows the composition, the palette, and
          the general handling. The collector reviews the sketch in person (or
          via high-quality photographs if remote) and approves, requests
          adjustments, or terminates the commission. If the sketch doesn't feel
          right, terminate the commission and pay the 25% — far better than
          spending the remaining 50% on a finished work that doesn't land.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Scope changes and creative differences
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Scope changes are normal and should be priced explicitly. Asking the
          artist to alter the composition after the colour sketch is approved
          typically costs 20–40% of the base fee, depending on how far into the
          work the artist is. Asking to change the dimensions after the canvas
          is stretched and gessoed is more expensive — often the cost of a new
          canvas plus a portion of the original deposit. Build a small
          contingency (10–15%) into your commissioning budget for legitimate
          scope changes; you will almost certainly use some of it.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Creative differences are different from scope changes. If the finished
          work doesn't match the brief (technique, palette, subject matter),
          that's a brief-fulfilment issue and the artist should adjust at no
          additional cost. If the finished work matches the brief but you don't
          connect with it emotionally, that's a creative difference and there's
          no remedy — the artist delivered what you asked for. Knowing which
          category you're in is the entire negotiation; the gallery (if you
          commissioned through one) is the right mediator here.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For commissions that genuinely don't work out, the cleanest path is to
          pay the artist in full, walk away from the piece, and let the gallery
          resell it as available stock. Most commission contracts have a clause
          covering this scenario — the artist keeps the proceeds of the resale
          up to a cap, and you absorb the deposit as the cost of a learning
          experience. This is rare (under 5% of commissions in our experience)
          but worth structuring upfront so neither party feels trapped.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          A sample commission agreement
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A working commission agreement covers eight items, in plain language,
          fitting on two pages. First, the parties (artist, collector, gallery
          if any). Second, the work being commissioned — dimensions, medium,
          support (canvas, board, paper), and a short prose description of the
          subject. Third, the timeline — start date, colour-sketch milestone,
          finished- work milestone, delivery date. Fourth, the price and the
          deposit schedule. Fifth, what counts as approval at each milestone (in
          writing, with photos as part of the record). Sixth, the scope-change
          clause and the per-change pricing.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Seventh, the termination clause — what happens if either party walks
          away, including deposit retention and ownership of any unfinished
          work. Eighth, copyright and reproduction rights — typically the artist
          retains copyright and the right to photograph the finished piece for
          their portfolio; the collector owns the physical work and has the
          right to display it but not to reproduce it commercially. Both parties
          sign the agreement before the deposit is paid; the gallery (if
          involved) countersigns.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          This sounds like a lot of process for a piece of art on a wall, and in
          a sense it is. But the alternative is the surprisingly common scenario
          where six months in, the artist and collector have very different
          ideas of what was commissioned, neither has anything in writing, and
          the gallery is trying to mediate a conversation that should have been
          resolved on day one. A two-page document signed before the deposit
          prevents almost all of these failures.
        </p>
      </motion.section>

      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="commissioning-custom-painting" />
    </SectionReveal>
  );
};

export default CommissioningArticle;
