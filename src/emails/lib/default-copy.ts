import type { OrderEmailKind, OrderEmailKindCopy } from "../types";

/**
 * Default per-kind copy used when the admin hasn't customised the
 * orderEmail subtree. Mirrors the seed values in
 * functions/api/storefront-config.js DEFAULT_ORDER_EMAIL.kinds — keep
 * them in sync.
 *
 * Templates use {{var}} placeholders which substituteTemplate() resolves
 * at render time:
 *   {{name}}, {{firstName}}, {{orderId}}, {{total}}, {{itemCount}},
 *   {{itemPlural}}, {{courier}}, {{trackingNumber}}, {{refundAmount}},
 *   {{failureMessage}}
 */
export const DEFAULT_KIND_COPY: Record<OrderEmailKind, OrderEmailKindCopy> = {
  confirmed: {
    subject: "Order {{orderId}} confirmed",
    heading: "Thanks — your order is confirmed",
    intro:
      "Hi {{name}},\n\nThanks for your order at Canvas Hub. We've recorded your payment of {{total}} and the team is getting your painting{{itemPlural}} ready. We'll send another note the moment the artist starts on it.",
  },
  in_progress: {
    subject: "Order {{orderId}}: in progress",
    heading: "Painting in progress",
    intro:
      "Hi {{name}},\n\nGood news — the artist has started working on your order. We'll send another note the moment it ships.",
  },
  out_for_delivery: {
    subject: "Order {{orderId}}: shipped",
    heading: "Out for delivery",
    intro:
      "Hi {{name}},\n\nYour painting is on its way! Tracking details are below — keep them handy in case you'd like to follow the parcel's journey.",
  },
  received: {
    subject: "Order {{orderId}}: delivered",
    heading: "Order delivered — thank you",
    intro:
      "Hi {{name}},\n\nWe've marked your order as received. We hope your painting feels right at home — we'd love to hear what you think.",
  },
  refund_requested: {
    subject: "Refund initiated for order {{orderId}}",
    heading: "Refund in progress",
    intro:
      "Hi {{name}},\n\nYour refund of {{refundAmount}} for order {{orderId}} has been initiated and should land back in your wallet shortly.",
  },
  refund_succeeded: {
    subject: "Refund completed for order {{orderId}}",
    heading: "Refund completed",
    intro:
      "Hi {{name}},\n\nYour refund of {{refundAmount}} for order {{orderId}} has been credited back. Thank you for your patience.",
  },
  refund_failed: {
    subject: "Refund failed for order {{orderId}}",
    heading: "Refund could not be processed",
    intro:
      "Hi {{name}},\n\nUnfortunately your refund for order {{orderId}} could not be processed automatically{{failureMessage}}. Please reply to this email and we'll sort it out manually.",
  },
};

export const resolveKindCopy = (
  config:
    | { kinds?: Partial<Record<OrderEmailKind, Partial<OrderEmailKindCopy>>> }
    | null
    | undefined,
  kind: OrderEmailKind,
): OrderEmailKindCopy => {
  const def = DEFAULT_KIND_COPY[kind] || DEFAULT_KIND_COPY.confirmed;
  const adminKind = config?.kinds?.[kind];
  if (!adminKind || typeof adminKind !== "object") return def;
  const trimmed = (s: string | undefined) => (s && s.trim() ? s : "");
  return {
    subject: trimmed(adminKind.subject) || def.subject,
    heading: trimmed(adminKind.heading) || def.heading,
    intro: trimmed(adminKind.intro) || def.intro,
  };
};
