/* Tiny, dependency-free i18n. Two locales for now: English (en) and
 * Filipino / Tagalog (tl). Add a key to `en` first; if the `tl` entry is
 * missing the EN string is used as fallback so the UI never goes blank.
 */

export type Locale = "en" | "tl";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  tl: "Filipino",
};

const en = {
  // Nav / chrome
  "nav.gallery": "Gallery",
  "nav.about": "About",
  "nav.reviews": "Reviews",
  "nav.contact": "Contact",
  "nav.account": "Account",
  "nav.cart": "Cart",
  "nav.login": "Sign in",
  "nav.signup": "Sign up",
  "nav.signOut": "Sign out",
  "nav.admin": "Admin",
  // Hero
  "hero.eyebrow": "Affordable Original Art",
  "hero.title": "Paintings that\nspeak quietly",
  "hero.subtitle":
    "Hand-crafted oils and acrylics by independent Filipino artists. Each piece is one of one — never reprinted.",
  "hero.ctaPrimary": "Browse the gallery",
  "hero.ctaSecondary": "Our story",
  // Gallery
  "gallery.title": "The collection",
  "gallery.searchPlaceholder": "Search paintings, mediums, or years",
  "gallery.allCategories": "All categories",
  "gallery.empty": "No paintings match your filters yet.",
  "gallery.viewProduct": "View painting",
  "gallery.sold": "Sold",
  "gallery.reserved": "Reserved",
  "gallery.draft": "Coming soon",
  // About
  "about.eyebrow": "About Pintaterra",
  "about.title": "Original art, made to live with",
  // Contact
  "contact.title": "Get in touch",
  "contact.heading": "Contact us",
  "contact.subtitle":
    "Questions about a painting, a custom request, or trade pricing? Send us a note.",
  // Newsletter
  "newsletter.title": "Stay in the loop",
  "newsletter.subtitle":
    "New paintings, sale drops, and behind-the-easel notes. Roughly once a month, no spam.",
  "newsletter.email": "Email address",
  "newsletter.namePlaceholder": "Your name (optional)",
  "newsletter.submit": "Subscribe",
  "newsletter.submitting": "Subscribing…",
  "newsletter.success": "You're on the list — welcome.",
  "newsletter.alreadySubscribed": "You're already subscribed. Thanks!",
  "newsletter.error": "Could not subscribe. Try again in a moment.",
  "newsletter.invalidEmail": "Please enter a valid email address.",
  "newsletter.privacy": "We never share your email. Unsubscribe anytime.",
  // Theme
  "theme.dark": "Dark",
  "theme.light": "Light",
  "theme.system": "System",
  "theme.toggle": "Toggle theme",
  // Locale
  "locale.toggle": "Change language",
  // Recently viewed
  "recentlyViewed.title": "Recently viewed",
  "recentlyViewed.clear": "Clear",
  // Related
  "related.title": "You might also like",
  // Product
  "product.addToCart": "Add to cart",
  "product.save": "Save",
  "product.saved": "Saved",
  "product.share": "Share",
  "product.continueBrowsing": "Continue browsing",
  // Cart
  "cart.title": "Your cart",
  "cart.empty": "Your cart is empty.",
  "cart.subtotal": "Subtotal",
  "cart.checkout": "Checkout",
  // Footer
  "footer.copyright": "© {year} Pintaterra. All rights reserved.",
} as const;

export type TranslationKey = keyof typeof en;

const tl: Partial<Record<TranslationKey, string>> = {
  "nav.gallery": "Galerya",
  "nav.about": "Tungkol",
  "nav.reviews": "Mga review",
  "nav.contact": "Kontak",
  "nav.account": "Account",
  "nav.cart": "Cart",
  "nav.login": "Mag-sign in",
  "nav.signup": "Mag-sign up",
  "nav.signOut": "Mag-sign out",
  "nav.admin": "Admin",
  "hero.eyebrow": "Abot-kayang Orihinal na Sining",
  "hero.title": "Mga pinta na\nmarahang nagsasalita",
  "hero.subtitle":
    "Gawang-kamay na oil at acrylic mula sa mga independent na Filipino artist. Bawat piraso ay iisa lang — hindi inuulit.",
  "hero.ctaPrimary": "Tingnan ang galerya",
  "hero.ctaSecondary": "Ang aming kwento",
  "gallery.title": "Ang koleksyon",
  "gallery.searchPlaceholder": "Maghanap ng pinta, medium, o taon",
  "gallery.allCategories": "Lahat ng kategorya",
  "gallery.empty": "Walang pintang tumutugma sa iyong filter.",
  "gallery.viewProduct": "Tingnan ang pinta",
  "gallery.sold": "Nabili na",
  "gallery.reserved": "Naka-reserve",
  "gallery.draft": "Malapit nang lumabas",
  "about.eyebrow": "Tungkol sa Pintaterra",
  "about.title": "Orihinal na sining, ginawa para samahan ka",
  "contact.title": "Kausapin kami",
  "contact.heading": "Kontakin kami",
  "contact.subtitle":
    "Mga tanong tungkol sa pinta, custom na request, o trade pricing? Magpadala ng note.",
  "newsletter.title": "Manatiling updated",
  "newsletter.subtitle":
    "Mga bagong pinta, sale drops, at kwento mula sa easel. Mga isang beses bawat buwan, walang spam.",
  "newsletter.email": "Email address",
  "newsletter.namePlaceholder": "Pangalan mo (opsyonal)",
  "newsletter.submit": "Sumali",
  "newsletter.submitting": "Sinasali…",
  "newsletter.success": "Nasa listahan ka na — maligayang pagdating.",
  "newsletter.alreadySubscribed": "Naka-subscribe ka na. Salamat!",
  "newsletter.error":
    "Hindi makasubscribe. Pakisubukan muli pagkatapos ng ilang sandali.",
  "newsletter.invalidEmail": "Mangyaring maglagay ng wastong email address.",
  "newsletter.privacy":
    "Hindi namin ibinabahagi ang iyong email. Mag-unsubscribe anumang oras.",
  "theme.dark": "Madilim",
  "theme.light": "Maliwanag",
  "theme.system": "Sistema",
  "theme.toggle": "I-toggle ang tema",
  "locale.toggle": "Baguhin ang wika",
  "recentlyViewed.title": "Kamakailan tiningnan",
  "recentlyViewed.clear": "Burahin",
  "related.title": "Maaaring magustuhan mo rin",
  "product.addToCart": "Idagdag sa cart",
  "product.save": "I-save",
  "product.saved": "Naka-save",
  "product.share": "I-share",
  "product.continueBrowsing": "Magpatuloy sa pag-browse",
  "cart.title": "Ang iyong cart",
  "cart.empty": "Walang laman ang iyong cart.",
  "cart.subtotal": "Subtotal",
  "cart.checkout": "Mag-checkout",
  "footer.copyright": "© {year} Pintaterra. Lahat ng karapatan ay nakalaan.",
};

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  tl: { ...en, ...tl },
};
