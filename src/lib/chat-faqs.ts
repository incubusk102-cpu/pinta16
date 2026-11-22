export interface ChatFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const CHAT_FAQ_MAX = 12;
export const CHAT_FAQ_QUESTION_MAX = 80;
export const CHAT_FAQ_ANSWER_MAX = 1200;

export const DEFAULT_CHAT_WELCOME =
  "Hi! Pick a topic below, or talk to a live agent for anything else.";

export const DEFAULT_CHAT_FAQS: ChatFaqItem[] = [
  {
    id: "shipping",
    question: "Shipping & delivery",
    answer:
      "We deliver within Luzon via Lalamove. Orders are packed within 2–3 business days, and dispatch is same-day once the rider accepts. You'll see live tracking in the Lalamove app and pay the rider directly in cash on delivery.",
  },
  {
    id: "returns",
    question: "Returns & refunds",
    answer:
      "Because each piece is an original hand-crafted product, we only accept returns if it arrives damaged. Email us within 48 hours of delivery with a clear photo and we'll arrange a refund or replacement right away.",
  },
  {
    id: "payment",
    question: "Payment methods",
    answer:
      "We accept GCash, Maya, bank transfer, and major credit / debit cards via our secure checkout. Full payment is required before the artwork ships.",
  },
  {
    id: "sizing",
    question: "Sizing & dimensions",
    answer:
      "Each artwork's detail page lists the exact width × height in inches and centimeters. If you need help choosing a size for a specific wall, tap 'Talk to a live agent' and we'll walk through it with you.",
  },
  {
    id: "originals",
    question: "Are these originals?",
    answer:
      "Every product in the catalogue is an original, hand-crafted piece — no prints, no reproductions, no customisation. Each piece is one-of-a-kind and ships with a signed certificate of authenticity from the maker.",
  },
  {
    id: "authenticity",
    question: "Authenticity",
    answer:
      "Every product ships with a signed certificate of authenticity from the maker. All works are original — no prints, no reproductions.",
  },
];

export const slugifyFaqId = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `faq-${Math.random().toString(36).slice(2, 8)}`;
};

export const sanitizeChatFaqs = (raw: unknown): ChatFaqItem[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ChatFaqItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const question = String(e.question ?? "")
      .trim()
      .slice(0, CHAT_FAQ_QUESTION_MAX);
    const answer = String(e.answer ?? "")
      .trim()
      .slice(0, CHAT_FAQ_ANSWER_MAX);
    if (!question || !answer) continue;
    let id = String(e.id ?? "")
      .trim()
      .slice(0, 40);
    if (!id) id = slugifyFaqId(question);
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);
    out.push({ id, question, answer });
    if (out.length >= CHAT_FAQ_MAX) break;
  }
  return out;
};
