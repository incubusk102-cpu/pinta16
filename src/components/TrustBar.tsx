import { Truck, ShieldCheck, RotateCcw, Award } from "lucide-react";

const items = [
  {
    icon: Truck,
    title: "Free PH shipping",
    body: "On every order over ₱2,500",
  },
  {
    icon: Award,
    title: "Certificate of Authenticity",
    body: "Signed & numbered with each piece",
  },
  {
    icon: RotateCcw,
    title: "7-day returns",
    body: "Hassle-free if it isn't for you",
  },
  {
    icon: ShieldCheck,
    title: "Secure checkout",
    body: "Encrypted, no card data stored",
  },
];

const TrustBar = () => (
  <section
    aria-label="What's included with every order"
    className="border-y border-border/30 bg-card/40"
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-6 sm:py-8 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-start gap-3">
          <span
            aria-hidden
            className="shrink-0 w-9 h-9 rounded-full bg-foreground/5 ring-1 ring-border/40 inline-flex items-center justify-center text-foreground/80"
          >
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="font-body text-[11px] tracking-[0.2em] uppercase text-foreground">
              {title}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {body}
            </p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default TrustBar;
