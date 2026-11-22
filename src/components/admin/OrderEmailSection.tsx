import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Mail,
  Package,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { compressImage } from "@/lib/imageCompress";
import {
  BODY_FONT_OPTIONS,
  TEMPLATE_OPTIONS,
  HEADER_ALIGN_OPTIONS,
  DIVIDER_STYLE_OPTIONS,
  BUTTON_STYLE_OPTIONS,
  type WelcomeBodyFont,
  type WelcomeTemplate,
  type WelcomeHeaderAlign,
  type WelcomeDividerStyle,
  type WelcomeButtonStyle,
  type WelcomeFooterLink,
  type WelcomeFooterLinkKind,
  type WelcomeEmailConfig,
  renderDefaultBrandLogoHtml,
} from "@/components/admin/WelcomeEmailSection";
import { EmailImageHealthCard } from "@/components/admin/EmailImageHealthCard";

// Mirrors functions/api/_lib/email.js ORDER_EMAIL_KINDS — kept in sync by
// hand. Each kind maps to exactly one notification stage in orders.js.
type OrderEmailKind =
  | "confirmed"
  | "in_progress"
  | "out_for_delivery"
  | "received"
  | "refund_requested"
  | "refund_succeeded"
  | "refund_failed";

const ORDER_KINDS: { value: OrderEmailKind; label: string; hint: string }[] = [
  {
    value: "confirmed",
    label: "Confirmed",
    hint: "Sent right after the customer pays.",
  },
  {
    value: "in_progress",
    label: "In progress",
    hint: "Sent when the artist starts work.",
  },
  {
    value: "out_for_delivery",
    label: "Out for delivery",
    hint: "Sent when the parcel ships (with tracking).",
  },
  {
    value: "received",
    label: "Delivered",
    hint: "Sent when the order is marked as received.",
  },
  {
    value: "refund_requested",
    label: "Refund initiated",
    hint: "Sent when a refund is started on PayMongo.",
  },
  {
    value: "refund_succeeded",
    label: "Refund completed",
    hint: "Sent when PayMongo confirms the refund.",
  },
  {
    value: "refund_failed",
    label: "Refund failed",
    hint: "Sent when a refund couldn't be processed.",
  },
];

interface OrderKindConfig {
  enabled: boolean;
  subject: string;
  heading: string;
  intro: string;
}

// Mirrors functions/api/storefront-config.js DEFAULT_ORDER_EMAIL.
interface OrderEmailConfig {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  adminRecipient: string;
  // When true (default), the renderer overlays the Welcome email's
  // logo / banner / palette / footer onto every order stage so the
  // full set of customer-facing mails reads as one template.
  inheritWelcomeBranding: boolean;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  bannerUrl: string;
  showLogo: boolean;
  showBanner: boolean;
  bodyFont: WelcomeBodyFont;
  template: WelcomeTemplate;
  headerAlign: WelcomeHeaderAlign;
  dividerStyle: WelcomeDividerStyle;
  buttonStyle: WelcomeButtonStyle;
  footerTagline: string;
  footerLinks: WelcomeFooterLink[];
  trackButtonText: string;
  reviewButtonText: string;
  kinds: Record<OrderEmailKind, OrderKindConfig>;
}

// Defaults match functions/api/_lib/email.js DEFAULT_ORDER_EMAIL_KINDS so
// the form has sensible copy before any /api/storefront-config?admin=1
// fetch comes back. The server-side sanitizer will normalise anything
// the admin types so the UI doesn't need to police values.
const DEFAULT_KIND: Record<OrderEmailKind, OrderKindConfig> = {
  confirmed: {
    enabled: true,
    subject: "Order {{orderId}} confirmed",
    heading: "Thanks — your order is confirmed",
    intro:
      "Hi {{name}},\n\nThanks for your order at Canvas Hub. We've recorded your payment of {{total}} and the team is getting your product{{itemPlural}} ready. We'll send another note the moment the maker starts on it.",
  },
  in_progress: {
    enabled: true,
    subject: "Order {{orderId}}: in progress",
    heading: "Order in progress",
    intro:
      "Hi {{name}},\n\nGood news — the maker has started working on your order. We'll send another note the moment it ships.",
  },
  out_for_delivery: {
    enabled: true,
    subject: "Order {{orderId}}: shipped",
    heading: "Out for delivery",
    intro:
      "Hi {{name}},\n\nYour order is on its way! Tracking details are below — keep them handy in case you'd like to follow the parcel's journey.",
  },
  received: {
    enabled: true,
    subject: "Order {{orderId}}: delivered",
    heading: "Order delivered — thank you",
    intro:
      "Hi {{name}},\n\nWe've marked your order as received. We hope your product feels right at home — we'd love to hear what you think.",
  },
  refund_requested: {
    enabled: true,
    subject: "Refund initiated for order {{orderId}}",
    heading: "Refund in progress",
    intro:
      "Hi {{name}},\n\nYour refund of {{refundAmount}} for order {{orderId}} has been initiated and should land back in your wallet shortly.",
  },
  refund_succeeded: {
    enabled: true,
    subject: "Refund completed for order {{orderId}}",
    heading: "Refund completed",
    intro:
      "Hi {{name}},\n\nYour refund of {{refundAmount}} for order {{orderId}} has been credited back. Thank you for your patience.",
  },
  refund_failed: {
    enabled: true,
    subject: "Refund failed for order {{orderId}}",
    heading: "Refund could not be processed",
    intro:
      "Hi {{name}},\n\nUnfortunately your refund for order {{orderId}} could not be processed automatically{{failureMessage}}. Please reply to this email and we'll sort it out manually.",
  },
};

const DEFAULTS: OrderEmailConfig = {
  enabled: true,
  fromName: "Canvas Hub",
  fromEmail: "order@canvhub.com",
  replyTo: "order@canvhub.com",
  adminRecipient: "",
  inheritWelcomeBranding: true,
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  logoUrl: "",
  bannerUrl: "",
  showLogo: true,
  showBanner: false,
  bodyFont: "inter",
  template: "classic",
  headerAlign: "left",
  dividerStyle: "line",
  buttonStyle: "filled",
  footerTagline: "original Filipino products",
  footerLinks: [],
  trackButtonText: "Track shipment",
  reviewButtonText: "Write a review",
  kinds: DEFAULT_KIND,
};

const FOOTER_LINKS_MAX = 8;

const FOOTER_LINK_KIND_OPTIONS: {
  value: WelcomeFooterLinkKind;
  label: string;
}[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X / Twitter" },
  { value: "youtube", label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "threads", label: "Threads" },
  { value: "mail", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "globe", label: "Website" },
  { value: "headphones", label: "Support" },
  { value: "custom", label: "Custom" },
];

const mergeOrderConfig = (raw: unknown): OrderEmailConfig => {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<OrderEmailConfig> & {
    kinds?: Partial<Record<OrderEmailKind, Partial<OrderKindConfig>>>;
  };
  const kinds = (Object.keys(DEFAULT_KIND) as OrderEmailKind[]).reduce(
    (acc, k) => {
      const incoming: Partial<OrderKindConfig> = data.kinds?.[k] || {};
      acc[k] = {
        enabled: incoming.enabled !== false,
        subject:
          typeof incoming.subject === "string" && incoming.subject.trim()
            ? incoming.subject
            : DEFAULT_KIND[k].subject,
        heading:
          typeof incoming.heading === "string" && incoming.heading.trim()
            ? incoming.heading
            : DEFAULT_KIND[k].heading,
        intro:
          typeof incoming.intro === "string" && incoming.intro.trim()
            ? incoming.intro
            : DEFAULT_KIND[k].intro,
      };
      return acc;
    },
    {} as Record<OrderEmailKind, OrderKindConfig>,
  );
  return {
    ...DEFAULTS,
    ...data,
    inheritWelcomeBranding: data.inheritWelcomeBranding !== false,
    kinds,
  };
};

// Branding chrome fields the order email inherits from the welcome
// email when `inheritWelcomeBranding` is on. Mirrors
// WELCOME_BRANDING_INHERIT_KEYS in functions/api/_lib/email.js so the
// admin preview iframe and the server-rendered email stay byte-
// identical for the chrome layer.
const WELCOME_BRANDING_INHERIT_KEYS = [
  "logoUrl",
  "bannerUrl",
  "showLogo",
  "showBanner",
  "primaryColor",
  "accentColor",
  "bodyFont",
  "template",
  "headerAlign",
  "dividerStyle",
  "buttonStyle",
  "footerTagline",
  "footerLinks",
] as const satisfies readonly (keyof OrderEmailConfig &
  keyof WelcomeEmailConfig)[];

// Overlay the welcome email's branding fields onto the order email
// config when the inherit toggle is on. Returns a new object so the
// React `setConfig` state stays untouched. Pass-through when the
// toggle is off or no welcome config has been loaded yet.
const applyWelcomeBrandingMerge = (
  order: OrderEmailConfig,
  welcome: WelcomeEmailConfig | null,
): OrderEmailConfig => {
  if (!order.inheritWelcomeBranding) return order;
  if (!welcome) return order;
  const merged: OrderEmailConfig = { ...order };
  for (const key of WELCOME_BRANDING_INHERIT_KEYS) {
    const value = welcome[key];
    if (value !== undefined) {
      // Each key in WELCOME_BRANDING_INHERIT_KEYS is constrained to
      // appear in both interfaces with compatible types, so the
      // assignment is structurally safe — TS can't follow the
      // mapped-key narrowing across two unrelated interfaces.
      (merged[key] as WelcomeEmailConfig[typeof key]) = value;
    }
  }
  return merged;
};

// Inline placeholder cheat-sheet shown above each per-kind form so admins
// know what variables they can sprinkle into a subject / intro.
const PLACEHOLDER_HELP: Record<OrderEmailKind, string> = {
  confirmed: "Use {{name}} {{firstName}} {{orderId}} {{total}} {{itemPlural}}.",
  in_progress: "Use {{name}} {{firstName}} {{orderId}}.",
  out_for_delivery:
    "Use {{name}} {{orderId}} {{courier}} {{trackingNumber}}. Tracking link auto-renders below.",
  received: "Use {{name}} {{firstName}} {{orderId}}.",
  refund_requested: "Use {{name}} {{orderId}} {{refundAmount}}.",
  refund_succeeded: "Use {{name}} {{orderId}} {{refundAmount}}.",
  refund_failed:
    "Use {{name}} {{orderId}} {{refundAmount}} {{failureMessage}}.",
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Client-side preview substitutes the same placeholders the server uses.
// Mirrors functions/api/_lib/email.js renderOrderIntroHtml so the live
// preview matches what the inbox will actually show.
const renderIntroPreview = (template: string, vars: Record<string, string>) => {
  const parts: string[] = [];
  let last = 0;
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    parts.push(escapeHtml(template.slice(last, m.index)));
    const v = vars[m[1]];
    parts.push(v === undefined || v === null ? "" : escapeHtml(String(v)));
    last = re.lastIndex;
  }
  parts.push(escapeHtml(template.slice(last)));
  return parts
    .join("")
    .split(/\n{2,}/)
    .filter((p) => p.length)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
};

const substitutePreview = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] === undefined ? "" : String(vars[key]),
  );

// Fake order data used to populate the preview iframe. Mirrors what
// sendOrderTestEmail builds server-side so what admins see in the
// preview matches what the test send produces.
const PREVIEW_VARS: Record<OrderEmailKind, Record<string, string>> = {
  confirmed: {
    name: "Test collector",
    firstName: "Test",
    orderId: "TEST-1234",
    total: "₱11,250",
    itemCount: "2",
    itemPlural: "s",
  },
  in_progress: {
    name: "Test collector",
    firstName: "Test",
    orderId: "TEST-1234",
  },
  out_for_delivery: {
    name: "Test collector",
    firstName: "Test",
    orderId: "TEST-1234",
    courier: "LBC Express",
    trackingNumber: "LBC-PREVIEW-001",
  },
  received: {
    name: "Test collector",
    firstName: "Test",
    orderId: "TEST-1234",
  },
  refund_requested: {
    name: "Test collector",
    orderId: "TEST-1234",
    refundAmount: "₱11,250",
  },
  refund_succeeded: {
    name: "Test collector",
    orderId: "TEST-1234",
    refundAmount: "₱11,250",
  },
  refund_failed: {
    name: "Test collector",
    orderId: "TEST-1234",
    refundAmount: "₱11,250",
    failureMessage: ": insufficient wallet balance at provider",
  },
};

const resolveBodyFontStack = (font: WelcomeBodyFont) =>
  BODY_FONT_OPTIONS.find((o) => o.value === font)?.stack ??
  BODY_FONT_OPTIONS[0].stack;

const resolveTemplate = (template: WelcomeTemplate) =>
  TEMPLATE_OPTIONS.find((o) => o.value === template) ?? TEMPLATE_OPTIONS[0];

// Build the preview HTML. Kept intentionally close to the server-side
// renderer so what admins see in the iframe is what the actual email
// looks like — minus the rehosted assets (preview shows data: URIs
// directly so admins don't need to hit /api/welcome-asset/order-* yet).
const buildPreviewHtml = (
  config: OrderEmailConfig,
  kind: OrderEmailKind,
): string => {
  const tpl = resolveTemplate(config.template);
  const fontStack = resolveBodyFontStack(config.bodyFont);
  const accent = config.accentColor || "#7a7468";
  const primary = config.primaryColor || "#1c1c1c";
  const align = config.headerAlign === "center" ? "center" : "left";
  const kindCfg = config.kinds[kind];
  const vars = PREVIEW_VARS[kind];

  const introHtml = renderIntroPreview(kindCfg.intro, vars);

  const showLogo = config.showLogo && config.logoUrl;
  const logoHtml = showLogo
    ? `<img src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(
        config.fromName,
      )}" style="max-height:48px;max-width:200px;display:${
        align === "center" ? "inline-block" : "block"
      };" />`
    : renderDefaultBrandLogoHtml(config.fromName || "Canvas Hub", tpl, align);

  const showBanner = config.showBanner && config.bannerUrl;
  const bannerHtml = showBanner
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(
        config.bannerUrl,
      )}" alt="" style="display:block;width:100%;max-width:560px;height:auto;" /></td></tr>`
    : "";

  const isShipment = kind === "out_for_delivery";
  const shipmentLine = isShipment
    ? `<p style="margin:0 0 12px;color:${accent};font-size:13px;">Shipped via <strong>${escapeHtml(
        vars.courier || "",
      )}</strong> &mdash; tracking <code>${escapeHtml(
        vars.trackingNumber || "",
      )}</code>.</p>`
    : "";

  const trackBtn = isShipment
    ? `<p style="margin:16px 0;"><a href="#" style="display:inline-block;padding:12px 24px;background:${primary};color:#ffffff;text-decoration:none;border-radius:4px;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;font-weight:500;">${escapeHtml(
        config.trackButtonText || "Track shipment",
      )}</a></p>`
    : "";

  const dividerHtml =
    config.dividerStyle === "none"
      ? ""
      : config.dividerStyle === "brush"
        ? `<div style="margin:24px 0;color:${accent};line-height:0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 12" preserveAspectRatio="none" style="display:block;width:100%;height:12px;"><path d="M2 7 C 40 1, 80 11, 120 4 S 180 9, 198 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="198" cy="5" r="1.4" fill="currentColor" /></svg></div>`
        : `<hr style="border:none;border-top:1px solid ${accent}33;margin:24px 0;" />`;

  // Mocked items table for the preview. The server renderer pulls this
  // straight from order.items but admins want to see structure here.
  const itemsHtml = `
    <table role="presentation" width="100%" style="border-top:1px solid #efece4;border-bottom:1px solid #efece4;margin:16px 0;">
      <tr><td style="padding:8px 0;font-size:13px;color:${tpl.bodyColor};">Sunset over Mayon <span style="color:${accent};">&times; 1</span></td><td style="padding:8px 0;font-size:13px;text-align:right;color:${tpl.bodyColor};">₱4,500</td></tr>
      <tr><td style="padding:8px 0;font-size:13px;color:${tpl.bodyColor};">Banaue rice terraces <span style="color:${accent};">&times; 1</span></td><td style="padding:8px 0;font-size:13px;text-align:right;color:${tpl.bodyColor};">₱6,500</td></tr>
    </table>
    <table role="presentation" width="100%" style="font-size:13px;">
      <tr><td style="color:${accent};">Subtotal</td><td style="text-align:right;color:${tpl.bodyColor};">₱11,000</td></tr>
      <tr><td style="color:${accent};">Shipping</td><td style="text-align:right;color:${tpl.bodyColor};">₱250</td></tr>
      <tr><td style="padding-top:8px;font-weight:600;color:${tpl.bodyColor};">Total</td><td style="padding-top:8px;text-align:right;font-weight:600;color:${tpl.bodyColor};">₱11,250</td></tr>
    </table>
  `;

  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Preview</title>
</head>
<body style="margin:0;padding:24px;background:${tpl.pageBg};font-family:${fontStack};color:${tpl.bodyColor};">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:${tpl.cardBg};border:${tpl.cardBorder};border-radius:${tpl.cardRadius};overflow:hidden;">
    <tr>
      <td style="padding:${tpl.headerPad};border-bottom:${tpl.separator};text-align:${align};">
        ${logoHtml}
      </td>
    </tr>
    ${bannerHtml}
    <tr>
      <td style="padding:${tpl.contentPad};font-size:14px;line-height:1.6;color:${tpl.bodyColor};font-family:${fontStack};">
        ${introHtml}
        <p style="margin:0 0 12px;color:${accent};font-size:12px;letter-spacing:0.05em;">Order ${escapeHtml(vars.orderId || "")}</p>
        ${shipmentLine}
        ${dividerHtml}
        ${itemsHtml}
        ${trackBtn}
        <p style="margin:24px 0 0;font-size:12px;color:${accent};">Questions? Just reply to this email.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:${tpl.footerPad};border-top:${tpl.separator};font-size:11px;color:${accent};text-align:${align};">
        <span style="font-family:'EB Garamond',Georgia,serif;font-style:italic;font-size:14px;letter-spacing:0.02em;color:#c4a86a;">${escapeHtml(config.fromName)}</span>
        ${config.footerTagline ? `&mdash; ${escapeHtml(config.footerTagline)}` : ""}
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
};

const compressEmailImage = async (
  file: File,
  opts: { preserveAlpha?: boolean } = {},
): Promise<string> => {
  // 1200px long-edge cap so logos / banners stay under Cloudflare KV's
  // value ceiling once base64-inflated. Logos pass `preserveAlpha: true`
  // so a PNG with transparency stays transparent (encoded as PNG, no
  // white-flatten); banners stay JPEG since they're typically full-bleed
  // photos with no alpha channel to preserve.
  const result = await compressImage(file, {
    maxDim: 1200,
    initialQuality: 0.85,
    preserveAlpha: opts.preserveAlpha,
  });
  return result.url;
};

export const OrderEmailSection = () => {
  const { token } = useAdminAuth();
  const [config, setConfig] = useState<OrderEmailConfig>(DEFAULTS);
  // Cached welcome email config used to mirror server-side branding
  // inheritance in the live preview iframe + "Send test" button. We
  // only read the fields listed in WELCOME_BRANDING_INHERIT_KEYS so
  // any future welcome-only additions don't affect this surface.
  const [welcomeConfig, setWelcomeConfig] = useState<WelcomeEmailConfig | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeKind, setActiveKind] = useState<OrderEmailKind>("confirmed");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json().catch(() => ({}))) as {
          config?: {
            orderEmail?: unknown;
            welcomeEmail?: Partial<WelcomeEmailConfig>;
          };
        };
        if (cancelled) return;
        if (data?.config?.orderEmail) {
          setConfig(mergeOrderConfig(data.config.orderEmail));
        }
        if (data?.config?.welcomeEmail) {
          // Store the welcome subtree verbatim — we only read the
          // branding fields out of it for the inheritance merge.
          setWelcomeConfig(data.config.welcomeEmail as WelcomeEmailConfig);
        }
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error
            ? `Could not load order email config: ${e.message}`
            : "Could not load order email config",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const update = <K extends keyof OrderEmailConfig>(
    key: K,
    value: OrderEmailConfig[K],
  ) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  const updateKind = (
    kind: OrderEmailKind,
    patch: Partial<OrderKindConfig>,
  ) => {
    setConfig((c) => ({
      ...c,
      kinds: { ...c.kinds, [kind]: { ...c.kinds[kind], ...patch } },
    }));
  };

  // Picking a template from the 4-card grid seeds the related individual
  // controls (font / alignment / divider / button) but each remains
  // independently editable underneath.
  const onTemplateChange = (next: WelcomeTemplate) => {
    const preset = TEMPLATE_OPTIONS.find((o) => o.value === next);
    if (!preset) return;
    setConfig((c) => ({
      ...c,
      template: preset.value,
      bodyFont: preset.bodyFont,
      headerAlign: preset.headerAlign,
      dividerStyle: preset.dividerStyle,
      buttonStyle: preset.buttonStyle,
    }));
  };

  const handleLogoFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await compressEmailImage(file, { preserveAlpha: true });
      update("logoUrl", dataUrl);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(
        e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed",
      );
    }
  };

  const handleBannerFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await compressEmailImage(file);
      update("bannerUrl", dataUrl);
      toast.success("Banner uploaded");
    } catch (e) {
      toast.error(
        e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed",
      );
    }
  };

  const addFooterLink = () => {
    setConfig((c) => {
      const links = c.footerLinks || [];
      if (links.length >= FOOTER_LINKS_MAX) return c;
      return {
        ...c,
        footerLinks: [
          ...links,
          {
            id: `link-${Date.now().toString(36)}`,
            kind: "instagram" as WelcomeFooterLinkKind,
            label: "Instagram",
            url: "",
          },
        ],
      };
    });
  };

  const updateFooterLink = (
    index: number,
    patch: Partial<WelcomeFooterLink>,
  ) => {
    setConfig((c) => {
      const links = (c.footerLinks || []).slice();
      const current = links[index];
      if (!current) return c;
      links[index] = { ...current, ...patch };
      return { ...c, footerLinks: links };
    });
  };

  const removeFooterLink = (index: number) => {
    setConfig((c) => {
      const links = (c.footerLinks || []).slice();
      links.splice(index, 1);
      return { ...c, footerLinks: links };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "update-order-email",
          orderEmail: config,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success("Order email saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULTS);
    toast.message("Reverted form to defaults (not yet saved)");
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter a recipient email for the test send");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "send-order-test",
          to: testEmail.trim(),
          kind: activeKind,
          orderEmail: config,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: { provider?: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success(
        `Test ${activeKind} email sent to ${testEmail}${
          data.result?.provider ? ` via ${data.result.provider}` : ""
        }`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send test");
    } finally {
      setSendingTest(false);
    }
  };

  // The preview iframe must show the EXACT chrome a recipient will
  // see, which means applying the same welcome-email branding overlay
  // the server-side renderer will apply at send time. Per-channel
  // subject / heading / intro stay on `config` because those are
  // never inherited from welcome.
  const resolvedConfig = useMemo(
    () => applyWelcomeBrandingMerge(config, welcomeConfig),
    [config, welcomeConfig],
  );

  const previewHtml = useMemo(
    () => buildPreviewHtml(resolvedConfig, activeKind),
    [resolvedConfig, activeKind],
  );

  const previewSubject = useMemo(
    () =>
      substitutePreview(
        config.kinds[activeKind].subject,
        PREVIEW_VARS[activeKind],
      ),
    [config, activeKind],
  );

  const inheriting = config.inheritWelcomeBranding && Boolean(welcomeConfig);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading order email config…
      </div>
    );
  }

  const activeKindCfg = config.kinds[activeKind];
  const activeKindMeta = ORDER_KINDS.find((k) => k.value === activeKind)!;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-display flex items-center gap-2">
            <Package className="w-6 h-6" /> Order email
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Customise every transactional order email — payment received, in
            progress, shipped, delivered, and the three refund states. Sent from{" "}
            <code className="text-foreground">order@canvhub.com</code> via the
            per-purpose env vars (<code>EMAIL_FROM_ORDER</code>,{" "}
            <code>EMAIL_REPLY_TO_ORDER</code>).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            type="button"
          >
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <Button onClick={handleSave} disabled={saving} type="button">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/40 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Send order emails</p>
          <p className="text-sm text-muted-foreground">
            Master switch — turn off to mute every kind below.
          </p>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => update("enabled", v)}
        />
      </div>

      <div className="rounded-lg border border-border/60 bg-card/40 p-4 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">
            Use the Welcome email's logo, banner & palette
          </p>
          <p className="text-sm text-muted-foreground max-w-xl">
            When on, every order stage (Confirmed, In progress, Out for
            delivery, Delivered, Refund …) renders with the same header, banner,
            colors, footer links and tagline as your Welcome email — so the
            customer sees one continuous brand. Turn off to give the order
            channel its own per-channel branding.
          </p>
        </div>
        <Switch
          checked={config.inheritWelcomeBranding}
          onCheckedChange={(v) => update("inheritWelcomeBranding", v)}
        />
      </div>

      <EmailImageHealthCard />

      <div className="grid lg:grid-cols-[2fr_3fr] gap-6">
        {/* Left column: per-kind editor + chrome controls */}
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Notification stage</h2>
            <p className="text-sm text-muted-foreground">
              Pick a stage to edit its subject, heading, and intro. Shared
              chrome (logo / fonts / palette) applies to all stages.
            </p>
            <div className="flex flex-wrap gap-2">
              {ORDER_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setActiveKind(k.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    activeKind === k.value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card/60 border-border/60 hover:bg-card"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-medium">{activeKindMeta.label}</h3>
                <p className="text-sm text-muted-foreground">
                  {activeKindMeta.hint}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Send</Label>
                <Switch
                  checked={activeKindCfg.enabled}
                  onCheckedChange={(v) =>
                    updateKind(activeKind, { enabled: v })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {PLACEHOLDER_HELP[activeKind]}
            </p>

            <div className="space-y-2">
              <Label htmlFor={`subject-${activeKind}`}>Subject</Label>
              <Input
                id={`subject-${activeKind}`}
                value={activeKindCfg.subject}
                onChange={(e) =>
                  updateKind(activeKind, { subject: e.target.value })
                }
                placeholder={DEFAULT_KIND[activeKind].subject}
              />
              <p className="text-xs text-muted-foreground">
                Inbox preview:{" "}
                <span className="text-foreground">{previewSubject}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`heading-${activeKind}`}>Heading</Label>
              <Input
                id={`heading-${activeKind}`}
                value={activeKindCfg.heading}
                onChange={(e) =>
                  updateKind(activeKind, { heading: e.target.value })
                }
                placeholder={DEFAULT_KIND[activeKind].heading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`intro-${activeKind}`}>Intro</Label>
              <Textarea
                id={`intro-${activeKind}`}
                value={activeKindCfg.intro}
                onChange={(e) =>
                  updateKind(activeKind, { intro: e.target.value })
                }
                rows={6}
                placeholder={DEFAULT_KIND[activeKind].intro}
              />
              <p className="text-xs text-muted-foreground">
                Blank lines become paragraph breaks. Single newlines become line
                breaks.
              </p>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="font-medium flex items-center gap-2">
              <Mail className="w-4 h-4" /> From & reply-to
            </h3>
            <p className="text-xs text-muted-foreground">
              These are display-only labels for the admin. The actual
              from-address and reply-to come from the{" "}
              <code>EMAIL_FROM_ORDER</code> / <code>EMAIL_REPLY_TO_ORDER</code>{" "}
              env vars in Cloudflare.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="order-from-name">From name</Label>
                <Input
                  id="order-from-name"
                  value={config.fromName}
                  onChange={(e) => update("fromName", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-from-email">From email (display)</Label>
                <Input
                  id="order-from-email"
                  value={config.fromEmail}
                  onChange={(e) => update("fromEmail", e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="order-reply-to">Reply-to (display)</Label>
                <Input
                  id="order-reply-to"
                  value={config.replyTo}
                  onChange={(e) => update("replyTo", e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="order-admin-recipient">
                  New-order alerts to (admin)
                </Label>
                <Input
                  id="order-admin-recipient"
                  type="email"
                  placeholder="orders-team@example.com"
                  value={config.adminRecipient}
                  onChange={(e) => update("adminRecipient", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  When set, the server fires a separate, concise alert to this
                  address every time a guest places an order. Leave blank to
                  fall back to the <code>EMAIL_BCC_ORDER</code> /{" "}
                  <code>EMAIL_ADMIN_RECIPIENT_ORDER</code> env vars or disable
                  the alert entirely.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="font-medium flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Branding
            </h3>
            {inheriting && (
              <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 px-3 py-2">
                Currently inheriting logo, banner and palette from the Welcome
                email. The values you set below are saved but only used once you
                turn off the inherit toggle above.
              </p>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Logo</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Show</Label>
                  <Switch
                    checked={config.showLogo}
                    onCheckedChange={(v) => update("showLogo", v)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                {config.logoUrl ? (
                  <img
                    src={config.logoUrl}
                    alt="Order email logo preview"
                    className="h-12 w-auto max-w-[120px] border border-border/40 rounded bg-white p-1 object-contain"
                  />
                ) : (
                  <div className="h-12 w-32 border border-dashed border-border/60 rounded flex items-center justify-center text-xs text-muted-foreground">
                    No logo
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" /> Upload
                </Button>
                {config.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update("logoUrl", "")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    handleLogoFile(f);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Banner</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Show</Label>
                  <Switch
                    checked={config.showBanner}
                    onCheckedChange={(v) => update("showBanner", v)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                {config.bannerUrl ? (
                  <img
                    src={config.bannerUrl}
                    alt="Order email banner preview"
                    className="h-16 w-auto max-w-[180px] border border-border/40 rounded object-cover"
                  />
                ) : (
                  <div className="h-16 w-32 border border-dashed border-border/60 rounded flex items-center justify-center text-xs text-muted-foreground">
                    No banner
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" /> Upload
                </Button>
                {config.bannerUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update("bannerUrl", "")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    handleBannerFile(f);
                  }}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="order-primary">Primary color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="order-primary"
                    type="color"
                    className="w-14 h-9 p-0 border-0"
                    value={config.primaryColor}
                    onChange={(e) => update("primaryColor", e.target.value)}
                  />
                  <Input
                    value={config.primaryColor}
                    onChange={(e) => update("primaryColor", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-accent">Accent color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="order-accent"
                    type="color"
                    className="w-14 h-9 p-0 border-0"
                    value={config.accentColor}
                    onChange={(e) => update("accentColor", e.target.value)}
                  />
                  <Input
                    value={config.accentColor}
                    onChange={(e) => update("accentColor", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="font-medium">Layout</h3>
            {inheriting && (
              <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 px-3 py-2">
                Layout (template, font, alignment, divider, button) is also
                being inherited from the Welcome email right now.
              </p>
            )}
            <div className="space-y-2">
              <Label>Template</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {TEMPLATE_OPTIONS.map((opt) => {
                  const active = config.template === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onTemplateChange(opt.value)}
                      className={`text-left p-3 rounded-md border transition-colors ${
                        active
                          ? "border-foreground bg-foreground/5"
                          : "border-border/60 bg-card/60 hover:bg-card"
                      }`}
                    >
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Header alignment</Label>
                <div className="flex gap-2">
                  {HEADER_ALIGN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update("headerAlign", opt.value)}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm border ${
                        config.headerAlign === opt.value
                          ? "bg-foreground text-background border-foreground"
                          : "bg-card/60 border-border/60 hover:bg-card"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Body font</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-border/60 bg-card/60 text-sm"
                  value={config.bodyFont}
                  onChange={(e) =>
                    update("bodyFont", e.target.value as WelcomeBodyFont)
                  }
                >
                  {BODY_FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Section divider</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-border/60 bg-card/60 text-sm"
                  value={config.dividerStyle}
                  onChange={(e) =>
                    update(
                      "dividerStyle",
                      e.target.value as WelcomeDividerStyle,
                    )
                  }
                >
                  {DIVIDER_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Button style</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-border/60 bg-card/60 text-sm"
                  value={config.buttonStyle}
                  onChange={(e) =>
                    update("buttonStyle", e.target.value as WelcomeButtonStyle)
                  }
                >
                  {BUTTON_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="order-track-btn">Track-shipment button</Label>
                <Input
                  id="order-track-btn"
                  value={config.trackButtonText}
                  onChange={(e) => update("trackButtonText", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-review-btn">Review button</Label>
                <Input
                  id="order-review-btn"
                  value={config.reviewButtonText}
                  onChange={(e) => update("reviewButtonText", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="font-medium">Footer</h3>
            <div className="space-y-1">
              <Label htmlFor="order-footer-tagline">Tagline</Label>
              <Input
                id="order-footer-tagline"
                value={config.footerTagline}
                onChange={(e) => update("footerTagline", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Footer links</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addFooterLink}
                  disabled={config.footerLinks.length >= FOOTER_LINKS_MAX}
                >
                  Add link
                </Button>
              </div>
              {config.footerLinks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No footer links yet. Add Instagram, support email, etc.
                </p>
              )}
              {config.footerLinks.map((link, i) => (
                <div
                  key={link.id}
                  className="grid grid-cols-[auto_1fr_2fr_auto] gap-2 items-center"
                >
                  <select
                    className="h-9 px-2 rounded-md border border-border/60 bg-card/60 text-sm"
                    value={link.kind}
                    onChange={(e) =>
                      updateFooterLink(i, {
                        kind: e.target.value as WelcomeFooterLinkKind,
                      })
                    }
                  >
                    {FOOTER_LINK_KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={link.label}
                    placeholder="Label"
                    onChange={(e) =>
                      updateFooterLink(i, { label: e.target.value })
                    }
                  />
                  <Input
                    value={link.url}
                    placeholder="https://… or mailto:…"
                    onChange={(e) =>
                      updateFooterLink(i, { url: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFooterLink(i)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="font-medium flex items-center gap-2">
              <Send className="w-4 h-4" /> Send a test
            </h3>
            <p className="text-sm text-muted-foreground">
              Sends the current draft for the{" "}
              <strong>{activeKindMeta.label}</strong> stage from{" "}
              <code>order@canvhub.com</code> to the address below. Subject is
              prefixed with <code>[Test]</code>.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Input
                type="email"
                placeholder="you@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 min-w-[200px]"
              />
              <Button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest}
              >
                {sendingTest ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Send test
              </Button>
            </div>
          </section>
        </div>

        {/* Right column: live preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Live preview</h2>
            <span className="text-xs text-muted-foreground">
              Stage: {activeKindMeta.label}
            </span>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
            <iframe
              title="Order email preview"
              srcDoc={previewHtml}
              className="w-full"
              style={{ height: "calc(100vh - 240px)", minHeight: 600 }}
              sandbox=""
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Preview uses placeholder order data (TEST-1234, ₱11,250 total, two
            products). Actual emails substitute the real customer + order values
            at send time.
          </p>
        </div>
      </div>
    </div>
  );
};
