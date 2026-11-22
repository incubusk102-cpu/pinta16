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

const BuyingArticle = () => {
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
        Collecting
      </motion.p>
      <motion.h1
        variants={fadeInUp}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-6"
      >
        Buying original art as investment
      </motion.h1>
      <motion.p
        variants={fadeInUp}
        className="font-body text-base text-muted-foreground leading-relaxed mb-12"
      >
        A clear-eyed look at art as an asset class — what actually appreciates,
        what doesn't, where the Philippine market sits today, and the framework
        we wish more first-time collectors used before buying with both their
        heart and their wallet.
      </motion.p>

      <AdUnit
        slot="1111111111"
        format="horizontal"
        className="my-10 sm:my-14"
      />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          The honest pitch: love it first, value it second
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Art is a poor primary investment. It produces no cash flow, has high
          transaction costs (15–25% commission to galleries or auction houses on
          resale), is illiquid (months to years to sell a piece), and depends on
          subjective valuation. As a primary allocation in a household
          portfolio, it underperforms almost every other asset class on a
          risk-adjusted basis.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Art is, however, a reasonable secondary asset for collectors who
          actually live with what they buy. Original work from contemporary
          Filipino artists has been one of the better- performing segments of
          Southeast Asian art over the past two decades, with names like Manuel
          Ocampo, Ronald Ventura, Geraldine Javier, and Rodel Tapaya seeing
          meaningful long-term price appreciation. The catch: these returns are
          concentrated in the top 5–10% of artists, and identifying which
          artists will be in that top decile twenty years from today is
          genuinely hard.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The honest pitch we give first-time collectors: buy what you love. If
          the piece appreciates, you have an asset; if it doesn't, you still
          have a piece you love on your wall. This single reframing removes most
          of the failure modes of art collecting — the piece you bought because
          someone said it would appreciate, that you don't actually like, that
          underperforms, and that you can't sell.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Primary market vs. secondary market
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The primary market is the first sale of a work — buying directly from
          the artist or from the gallery that represents them. Primary-market
          prices are set by the gallery in consultation with the artist and tend
          to be conservative: a gallery would rather sell at a sustainable price
          that the artist's career can grow into than at a spike that crashes
          the artist's market in three years. The primary market is where you
          build a relationship with an artist and where the best long-term
          returns originate.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The secondary market is every sale after the first — auction houses,
          private dealers, secondary-market galleries. Secondary prices float
          according to demand: a hot artist's work can appreciate 3–5× in five
          years; a cooling artist's work can sell below the original primary
          price. The two largest secondary market houses for Filipino art are
          Salcedo Auctions and Léon Gallery, both based in Makati; both publish
          detailed catalogues with hammer prices, which is the single best
          research input available for understanding the local secondary market.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          The general rule: buy at primary, sell at secondary. Primary purchases
          have the longest runway for appreciation and the strongest provenance
          (you know exactly where the piece came from). Secondary purchases are
          where you find specific pieces by artists you missed earlier in their
          career, but the price already reflects the artist's current market
          position.
        </p>
      </motion.section>

      <AdUnit slot="2222222222" format="rectangle" className="my-10 sm:my-14" />

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Provenance, COA, and the paper trail
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          A piece's value is inseparable from its provenance — the documented
          chain of ownership from the artist's studio to your home. Forgeries
          are a real and growing problem in the Filipino secondary market,
          especially for early-career work by now- established names. The single
          best protection is a clean provenance record.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          When buying from a gallery, ask for: a Certificate of Authenticity
          signed by the artist, an invoice that names the gallery and the
          artist, and a high-resolution photograph of the work taken in the
          gallery (date-stamped). For an additional layer, ask the gallery to
          introduce you to the artist by email — most artists are happy to
          acknowledge an authentic sale, and that email exchange becomes part of
          the provenance.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          For secondary-market purchases, look for: the original gallery's
          invoice or COA from when the piece first sold, any catalogue raisonné
          entry if the artist has one (Filipino contemporary artists generally
          don't, but mid-century masters increasingly do), and exhibition
          history (a piece that appeared in a documented exhibition is far
          easier to authenticate later). Keep all paperwork in a fireproof safe
          or at minimum a watertight document box; a forged piece is much harder
          to detect than missing provenance.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          What actually appreciates
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          The patterns we see in Philippine art appreciation across the past
          three decades:
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Major mid-career and senior contemporary artists (Ocampo, Ventura,
          Tapaya, Javier, Mauro Malang Santos in the older generation) have
          appreciated meaningfully — often 5–10× over fifteen years for
          important works. This appreciation is concentrated in their signature
          works and in pieces from recognised series; minor or atypical works
          tend to lag the artist's overall market.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Modern masters (Anita Magsaysay-Ho, Hernando Ocampo, Vicente
          Manansala, BenCab in his early period) have been the strongest
          long-term performers but are also where forgeries are most common.
          Always buy through a major gallery or auction house for these names,
          never through a private dealer without strong third-party
          authentication.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Emerging artists (artists with three or fewer solo shows) are the most
          speculative segment. The base rate of any individual emerging artist
          becoming a name in twenty years is genuinely low — perhaps 5–10% — but
          the returns on the ones who do are large enough to justify buying
          selectively if you can afford to be wrong on most. Allocate at most
          10–20% of your collecting budget here, treat it as enjoyment-first
          rather than investment-first, and pace yourself.
        </p>
      </motion.section>

      <motion.section variants={fadeInUp} className="space-y-4 mb-12">
        <h2 className="font-display text-2xl md:text-3xl text-foreground">
          Practical research workflow
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed">
          Before any meaningful purchase (anything over a few months of
          discretionary spending), do the following research, in order. First,
          search the artist's name in the past three Salcedo and Léon Gallery
          catalogues to understand their current secondary-market pricing. If
          you cannot find any results, the artist has no established secondary
          market — fine, but price accordingly. Second, look up the artist's
          exhibition history on the websites of their representing gallery and
          the Cultural Center of the Philippines; a strong exhibition record is
          the best leading indicator of future market position.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Third, talk to two or three collectors who already own work by the
          artist. This is much easier than people assume — gallery staff will
          introduce you on request, and most collectors are happy to share their
          experience with an artist's work over a coffee. Their opinions are
          usually more useful than the gallery's marketing, because they have a
          few years of distance from the purchase decision.
        </p>
        <p className="font-body text-muted-foreground leading-relaxed">
          Fourth, set a maximum price for the specific piece you want before
          walking into the gallery, and stick to it. The single most expensive
          mistake collectors make is paying 20–30% over their planned ceiling in
          the moment, because the piece felt like the right one and the moment
          felt like the right moment. Most galleries will hold a piece for 48
          hours while you sleep on the decision; ask for the hold and use it.
        </p>
      </motion.section>

      <AdUnit slot="3333333333" format="auto" className="mt-12 sm:mt-16" />

      <RelatedResourceCards exclude="buying-art-as-investment" />
    </SectionReveal>
  );
};

export default BuyingArticle;
