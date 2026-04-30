import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  Image as ImageIcon,
  Loader2,
  Mail,
  Package,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Tag,
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

export interface WelcomeCustomItem {
  id: string;
  imageUrl: string;
  title: string;
  price: number;
  description: string;
}

export interface WelcomeProductsConfig {
  enabled: boolean;
  // "auto"   = newest products from the storefront
  // "manual" = explicit picks from the storefront
  // "custom" = email-only uploads (image + title + price + description)
  mode: "auto" | "manual" | "custom";
  count: number;
  manualIds: string[];
  customItems: WelcomeCustomItem[];
  sectionTitle: string;
  showPrice: boolean;
}

export interface WelcomeDiscountConfig {
  enabled: boolean;
  source: "linked" | "inline";
  linkedCode: string;
  inlineHeadline: string;
  inlineCode: string;
  inlineDescription: string;
  inlineExpiresAt: string;
}

// Mirrors functions/api/storefront-config.js DEFAULT_WELCOME_EMAIL.
export interface WelcomeEmailConfig {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  subject: string;
  body: string;
  signature: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  bannerUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  showLogo: boolean;
  showBanner: boolean;
  avatarUrl: string;
  avatarName: string;
  showAvatar: boolean;
  products: WelcomeProductsConfig;
  discount: WelcomeDiscountConfig;
}

interface AdminProductSummary {
  id: string;
  title: string;
  image?: string;
  images?: { url: string }[];
  price?: number;
  salePrice?: number;
  availability?: string;
  createdAt?: string;
}

interface AdminPromoSummary {
  code: string;
  type?: string;
  value?: number;
  description?: string;
  enabled?: boolean;
  expiresAt?: string;
  usageLimit?: number | null;
  usageCount?: number;
}

const DEFAULTS: WelcomeEmailConfig = {
  enabled: false,
  fromName: "Canvas Hub",
  fromEmail: "account@canvhub.com",
  replyTo: "account@canvhub.com",
  subject: "Welcome to Canvas Hub, {{firstName}}!",
  body:
    "Hi {{firstName}},\n\n" +
    "Thanks for joining Canvas Hub — we're glad to have you. " +
    "Every painting on the storefront is original, hand-painted, and shipped from the artist's studio.\n\n" +
    "Take your time exploring the collection. If a piece speaks to you, just tap it to see the full details and sizes.\n\n" +
    "If you have any questions, reply to this email and the team will get back to you.\n\n" +
    "— The Canvas Hub team",
  signature: "— The Canvas Hub team",
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  logoUrl: "",
  bannerUrl: "",
  ctaLabel: "Browse the collection",
  ctaUrl: "https://canvhub.com",
  showLogo: true,
  showBanner: false,
  avatarUrl: "",
  avatarName: "Canvas Hub team",
  showAvatar: false,
  products: {
    enabled: true,
    mode: "auto",
    count: 4,
    manualIds: [],
    customItems: [],
    sectionTitle: "A glimpse of the collection",
    showPrice: true,
  },
  discount: {
    enabled: false,
    source: "linked",
    linkedCode: "",
    inlineHeadline: "Your welcome gift",
    inlineCode: "WELCOME10",
    inlineDescription: "10% off your first painting.",
    inlineExpiresAt: "",
  },
};

const mergeWelcomeConfig = (
  partial: Partial<WelcomeEmailConfig> | undefined,
): WelcomeEmailConfig => ({
  ...DEFAULTS,
  ...(partial || {}),
  products: { ...DEFAULTS.products, ...(partial?.products || {}) },
  discount: { ...DEFAULTS.discount, ...(partial?.discount || {}) },
});

type SuggestedTemplate = {
  id: string;
  name: string;
  description: string;
  patch: Partial<WelcomeEmailConfig>;
};

const SUGGESTED_TEMPLATES: SuggestedTemplate[] = [
  {
    id: "classic",
    name: "Classic welcome",
    description: "Calm, gallery-style intro with a single CTA.",
    patch: {
      subject: "Welcome to Canvas Hub, {{firstName}}!",
      body:
        "Hi {{firstName}},\n\n" +
        "Thanks for joining Canvas Hub. Every painting on the storefront is original, hand-painted, and shipped from the artist's studio.\n\n" +
        "Take your time exploring — if a piece speaks to you, tap it for full details and sizes.\n\n" +
        "If you have questions, just reply to this email.\n\n" +
        "— The Canvas Hub team",
      signature: "— The Canvas Hub team",
      ctaLabel: "Browse the collection",
      ctaUrl: "https://canvhub.com",
      primaryColor: "#1c1c1c",
      accentColor: "#7a7468",
      showLogo: true,
      showBanner: false,
    },
  },
  {
    id: "warm",
    name: "Warm welcome",
    description:
      "Friendlier tone, mentions made-to-order. Good for a first signup.",
    patch: {
      subject: "Hi {{firstName}} — welcome to Canvas Hub",
      body:
        "Hi {{firstName}},\n\n" +
        "Welcome aboard! We're thrilled you're here.\n\n" +
        "Canvas Hub exists to bring affordable, hand-painted art to homes that deserve a bit of beauty. Each piece is made to order — what you receive is as unique as your space.\n\n" +
        "Have a look around. When you find a piece you love, tap it for sizing and a close look at the details.\n\n" +
        "Anything we can help with? Just reply to this email — a real human (us!) will write back.\n\n" +
        "Maraming salamat,\nThe Canvas Hub team",
      signature: "Maraming salamat,\nThe Canvas Hub team",
      ctaLabel: "Find your painting",
      ctaUrl: "https://canvhub.com",
      primaryColor: "#3a2e1f",
      accentColor: "#a08b6a",
      showLogo: true,
      showBanner: true,
    },
  },
  {
    id: "promo",
    name: "Promo-first",
    description:
      "Leads with a welcome discount. Pair with a real promo code in /admin → Storefront.",
    patch: {
      subject: "Welcome, {{firstName}} — here's 10% off your first painting",
      body:
        "Hi {{firstName}},\n\n" +
        "Thanks for signing up to Canvas Hub! As a thank-you, here's 10% off your first piece — just use code WELCOME10 at checkout.\n\n" +
        "All our paintings are original, hand-finished, and shipped from the artist directly. Take your time browsing.\n\n" +
        "— The Canvas Hub team",
      signature: "— The Canvas Hub team",
      ctaLabel: "Shop the collection",
      ctaUrl: "https://canvhub.com",
      primaryColor: "#1c1c1c",
      accentColor: "#a37b3d",
      showLogo: true,
      showBanner: false,
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Plain text feel, no banner. Loads instantly in any client.",
    patch: {
      subject: "Welcome to Canvas Hub",
      body:
        "Hi {{firstName}},\n\n" +
        "You're in. Welcome to Canvas Hub.\n\n" +
        "Browse the collection at your own pace, and reply to this email if you'd like a hand finding something.\n\n" +
        "— Canvas Hub",
      signature: "— Canvas Hub",
      ctaLabel: "",
      ctaUrl: "",
      primaryColor: "#000000",
      accentColor: "#666666",
      showLogo: true,
      showBanner: false,
    },
  },
];

const PLACEHOLDER_HINT =
  "Use {{firstName}}, {{name}}, or {{email}} as placeholders.";

const renderTemplateString = (
  template: string,
  vars: Record<string, string>,
): string =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) =>
    vars[key] == null ? "" : vars[key],
  );

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isSafeColor = (value: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(value.trim());

interface ResolvedDiscount {
  headline: string;
  code: string;
  description: string;
  expiresAt: string;
}

const formatPHP = (n?: number): string =>
  `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

const formatPromoDescription = (promo: AdminPromoSummary): string => {
  switch (promo.type) {
    case "percent":
      return `${promo.value}% off`;
    case "fixed":
    case "flat":
      return `${formatPHP(promo.value)} off`;
    case "free_shipping":
      return "Free shipping";
    default:
      return "";
  }
};

const productThumbnailUrl = (p: AdminProductSummary): string => {
  if (Array.isArray(p.images) && p.images[0]?.url) return p.images[0].url;
  return p.image || "";
};

const formatExpiryLabel = (iso: string): string => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Unified shape rendered in the live admin preview. Storefront products and
// custom email-only uploads both flatten into this so the renderer doesn't
// have to branch.
interface PreviewItem {
  imageUrl: string;
  title: string;
  price: number;
  description: string;
}

const productsHtmlForPreview = (
  config: WelcomeEmailConfig,
  picked: PreviewItem[],
): string => {
  const cfg = config.products;
  if (!cfg.enabled || picked.length === 0) return "";
  const heading = escapeHtml(cfg.sectionTitle || "A glimpse of the collection");
  const renderCell = (p?: PreviewItem): string => {
    if (!p) return `<td style="width:50%;padding:6px;"></td>`;
    const img = p.imageUrl;
    const title = escapeHtml(p.title || "Untitled");
    const priceLine =
      cfg.showPrice && p.price > 0
        ? `<div style="margin-top:4px;font-size:12px;color:#7a7468;">${formatPHP(p.price)}</div>`
        : "";
    const descLine = p.description
      ? `<div style="margin-top:4px;font-size:12px;color:#7a7468;line-height:1.4;">${escapeHtml(p.description)}</div>`
      : "";
    const safeImg = img
      ? `<img src="${img}" alt="${title}" style="display:block;width:100%;height:auto;border-radius:4px;border:1px solid #efece4;" />`
      : `<div style="width:100%;aspect-ratio:1/1;border-radius:4px;border:1px solid #efece4;background:#f5f3ee;"></div>`;
    return `<td valign="top" style="padding:6px;width:50%;">${safeImg}<div style="margin-top:8px;font-size:13px;color:#1c1c1c;line-height:1.35;">${title}</div>${priceLine}${descLine}</td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < picked.length; i += 2) {
    rows.push(`<tr>${renderCell(picked[i])}${renderCell(picked[i + 1])}</tr>`);
  }
  return `
    <h3 style="margin:32px 0 12px;font-family:'Playfair Display',Georgia,serif;font-size:18px;color:#1c1c1c;">${heading}</h3>
    <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:0;">
      ${rows.join("")}
    </table>
  `;
};

const productToPreviewItem = (p: AdminProductSummary): PreviewItem => ({
  imageUrl: productThumbnailUrl(p),
  title: p.title || "Untitled",
  price: Number(p.salePrice && p.salePrice > 0 ? p.salePrice : p.price) || 0,
  description: "",
});

const discountHtmlForPreview = (
  config: WelcomeEmailConfig,
  discount: ResolvedDiscount | null,
): string => {
  if (!discount || !discount.code) return "";
  const primary = isSafeColor(config.primaryColor)
    ? config.primaryColor
    : "#1c1c1c";
  const accent = isSafeColor(config.accentColor)
    ? config.accentColor
    : "#7a7468";
  const headline = escapeHtml(discount.headline || "Your welcome gift");
  const description = escapeHtml(discount.description || "");
  const code = escapeHtml(discount.code);
  const expiry = formatExpiryLabel(discount.expiresAt || "");
  const expiryLine = expiry
    ? `<div style="margin-top:6px;font-size:11px;color:${accent};">Use before ${escapeHtml(expiry)}.</div>`
    : "";
  return `
    <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:0;margin:24px 0;">
      <tr>
        <td style="background:${primary};padding:18px 20px;border-radius:6px;color:#ffffff;text-align:center;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:16px;letter-spacing:0.04em;">${headline}</div>
          ${description ? `<div style="margin-top:4px;font-size:13px;opacity:0.92;">${description}</div>` : ""}
          <div style="margin-top:12px;display:inline-block;padding:8px 14px;border:1px dashed rgba(255,255,255,0.55);border-radius:4px;font-family:'Courier New',monospace;font-size:18px;letter-spacing:0.18em;">${code}</div>
          ${expiryLine}
        </td>
      </tr>
    </table>
  `;
};

// Approximates the server-side wrapper so admins see the same thing the
// recipient will see (sans email-client quirks).
const renderPreviewHtml = (
  config: WelcomeEmailConfig,
  pickedProducts: PreviewItem[],
  discount: ResolvedDiscount | null,
): string => {
  const vars = {
    name: "Sample collector",
    firstName: "Sample",
    email: "sample@canvhub.com",
  };
  const subject = renderTemplateString(config.subject, vars);
  const bodyText = renderTemplateString(config.body, vars);
  const primary = isSafeColor(config.primaryColor)
    ? config.primaryColor
    : "#1c1c1c";
  const accent = isSafeColor(config.accentColor)
    ? config.accentColor
    : "#7a7468";
  const fromName = escapeHtml(config.fromName || "Canvas Hub");
  const showLogo = config.showLogo && config.logoUrl;
  const showBanner = config.showBanner && config.bannerUrl;

  const paragraphsHtml = bodyText
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(para)}</p>`,
    )
    .join("");

  const signature = config.signature.trim();
  const signatureHtml = signature
    ? `<p style="margin:24px 0 0;color:${accent};font-size:13px;white-space:pre-line;">${escapeHtml(signature)}</p>`
    : "";

  const ctaHtml =
    config.ctaLabel.trim() && config.ctaUrl.trim()
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(config.ctaUrl)}" style="display:inline-block;padding:12px 24px;background:${primary};color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;border-radius:4px;">${escapeHtml(config.ctaLabel)}</a></p>`
      : "";

  const discountHtml = discountHtmlForPreview(config, discount);
  const productsHtml = productsHtmlForPreview(config, pickedProducts);

  const avatarHtml =
    config.showAvatar && config.avatarUrl
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:28px;">
          <tr>
            <td valign="middle" style="padding:0 12px 0 0;line-height:0;">
              <img src="${config.avatarUrl}" alt="${escapeHtml(config.avatarName || config.fromName)}" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:9999px;object-fit:cover;border:1px solid #efece4;" />
            </td>
            <td valign="middle" style="font-size:13px;color:${primary};line-height:1.4;">
              <div style="font-weight:500;">${escapeHtml(config.avatarName || config.fromName || "Canvas Hub team")}</div>
              <div style="color:${accent};font-size:12px;">${escapeHtml(config.fromEmail || "")}</div>
            </td>
          </tr>
        </table>`
      : "";

  const logoBlock = showLogo
    ? `<img src="${config.logoUrl}" alt="${fromName}" style="max-height:48px;max-width:200px;display:block;" />`
    : `<div style="font-family:'EB Garamond',Georgia,'Playfair Display',serif;font-style:italic;font-size:28px;letter-spacing:0.02em;color:#c4a86a;">${fromName}</div>`;

  const bannerBlock = showBanner
    ? `<tr><td style="padding:0;"><img src="${config.bannerUrl}" alt="" style="display:block;width:100%;max-width:560px;height:auto;" /></td></tr>`
    : "";

  return `
<!doctype html>
<html><head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Playfair+Display:wght@400;500;600&display=swap" rel="stylesheet" />
</head><body style="margin:0;padding:24px;background:#f5f3ee;font-family:Helvetica,Arial,sans-serif;color:${primary};">
  <div style="max-width:560px;margin:0 auto;font-size:11px;color:${accent};margin-bottom:8px;">
    <strong>Subject:</strong> ${escapeHtml(subject)}
  </div>
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e1d8;border-radius:6px;overflow:hidden;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #efece4;">${logoBlock}</td></tr>
    ${bannerBlock}
    <tr><td style="padding:24px 28px;font-size:14px;line-height:1.6;">
      ${paragraphsHtml}
      ${discountHtml}
      ${productsHtml}
      ${ctaHtml}
      ${avatarHtml}
      ${signatureHtml}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid #efece4;font-size:11px;color:${accent};"><span style="font-family:'EB Garamond',Georgia,'Playfair Display',serif;font-style:italic;font-size:14px;letter-spacing:0.02em;color:#c4a86a;">${fromName}</span> &mdash; original Filipino paintings.</td></tr>
  </table>
</body></html>`;
};

export const WelcomeEmailSection = () => {
  const { token } = useAdminAuth();
  const [config, setConfig] = useState<WelcomeEmailConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [products, setProducts] = useState<AdminProductSummary[]>([]);
  const [promoCodes, setPromoCodes] = useState<AdminPromoSummary[]>([]);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Pull the storefront product list so the manual picker has something to
  // show. Public endpoint, so no admin token required.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) return;
        const data = (await res.json()) as { products?: AdminProductSummary[] };
        if (!cancelled && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      } catch {
        /* fail silently — manual picker will just be empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          config?: {
            welcomeEmail?: Partial<WelcomeEmailConfig>;
            promoCodes?: AdminPromoSummary[];
          };
        };
        if (cancelled) return;
        if (data?.config?.welcomeEmail) {
          setConfig(mergeWelcomeConfig(data.config.welcomeEmail));
        }
        if (Array.isArray(data?.config?.promoCodes)) {
          setPromoCodes(data.config.promoCodes as AdminPromoSummary[]);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error ? e.message : "Could not load welcome email",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const update = <K extends keyof WelcomeEmailConfig>(
    key: K,
    value: WelcomeEmailConfig[K],
  ) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  const updateProducts = <K extends keyof WelcomeProductsConfig>(
    key: K,
    value: WelcomeProductsConfig[K],
  ) => {
    setConfig((c) => ({ ...c, products: { ...c.products, [key]: value } }));
  };

  const updateDiscount = <K extends keyof WelcomeDiscountConfig>(
    key: K,
    value: WelcomeDiscountConfig[K],
  ) => {
    setConfig((c) => ({ ...c, discount: { ...c.discount, [key]: value } }));
  };

  const toggleManualProduct = (id: string) => {
    setConfig((c) => {
      const present = c.products.manualIds.includes(id);
      const next = present
        ? c.products.manualIds.filter((x) => x !== id)
        : [...c.products.manualIds, id].slice(0, 8);
      return { ...c, products: { ...c.products, manualIds: next } };
    });
  };

  // Sync the custom-items array length with the configured count so admins
  // see the right number of empty slots when they change "How many to show"
  // or first switch to the custom mode.
  const ensureCustomItems = (count: number, items: WelcomeCustomItem[]) => {
    const next = items.slice(0, count);
    while (next.length < count) {
      next.push({
        id: `item-${Math.random().toString(36).slice(2, 10)}`,
        imageUrl: "",
        title: "",
        price: 0,
        description: "",
      });
    }
    return next;
  };

  const updateCustomItem = (
    index: number,
    patch: Partial<WelcomeCustomItem>,
  ) => {
    setConfig((c) => {
      const items = ensureCustomItems(c.products.count, c.products.customItems);
      items[index] = { ...items[index], ...patch };
      return { ...c, products: { ...c.products, customItems: items } };
    });
  };

  const handleCustomItemImage = async (index: number, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    try {
      const compressed = await compressImage(file, {
        maxDim: 1400,
        maxBytes: 500 * 1024,
      });
      updateCustomItem(index, { imageUrl: compressed.url });
      toast.success(
        `Image uploaded (${Math.round(compressed.bytes / 1024)} KB)`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload image");
    }
  };

  // Make sure the custom items array is the right length for the current
  // count. Runs whenever the admin enters custom mode or changes count.
  useEffect(() => {
    if (config.products.mode !== "custom") return;
    const desired = ensureCustomItems(
      config.products.count,
      config.products.customItems,
    );
    if (desired.length !== config.products.customItems.length) {
      setConfig((c) => ({
        ...c,
        products: { ...c.products, customItems: desired },
      }));
    }
  }, [
    config.products.mode,
    config.products.count,
    config.products.customItems,
  ]);

  const handleUploadImage = async (
    file: File | null,
    field: "logoUrl" | "bannerUrl" | "avatarUrl",
  ) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    try {
      const presets: Record<
        typeof field,
        { maxDim: number; maxBytes: number }
      > = {
        logoUrl: { maxDim: 600, maxBytes: 200 * 1024 },
        bannerUrl: { maxDim: 1600, maxBytes: 600 * 1024 },
        avatarUrl: { maxDim: 256, maxBytes: 80 * 1024 },
      };
      const labels: Record<typeof field, string> = {
        logoUrl: "Logo",
        bannerUrl: "Banner",
        avatarUrl: "Avatar",
      };
      const compressed = await compressImage(file, presets[field]);
      update(field, compressed.url);
      toast.success(
        `${labels[field]} uploaded (${Math.round(compressed.bytes / 1024)} KB)`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload image");
    }
  };

  const applyTemplate = (template: SuggestedTemplate) => {
    setConfig((c) => ({ ...c, ...template.patch }));
    toast.success(`Loaded "${template.name}" template into the form`);
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
          action: "update-welcome-email",
          welcomeEmail: config,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success("Welcome email saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULTS);
    toast.message("Reverted form to default template (not yet saved)");
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
          action: "send-welcome-test",
          to: testEmail.trim(),
          welcomeEmail: config,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        provider?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success(
        `Test email sent to ${testEmail}${data.provider ? ` via ${data.provider}` : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send test");
    } finally {
      setSendingTest(false);
    }
  };

  const sortedProducts = useMemo(() => {
    return [...products]
      .filter((p) => p.availability !== "draft")
      .sort(
        (a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""),
      );
  }, [products]);

  const previewProducts = useMemo<PreviewItem[]>(() => {
    if (!config.products.enabled) return [];
    if (config.products.mode === "custom") {
      return config.products.customItems
        .filter((it) => it.imageUrl || it.title)
        .slice(0, config.products.count)
        .map((it) => ({
          imageUrl: it.imageUrl,
          title: it.title || "Untitled",
          price: Number(it.price) || 0,
          description: it.description,
        }));
    }
    if (config.products.mode === "manual") {
      const byId = new Map(products.map((p) => [p.id, p]));
      return config.products.manualIds
        .map((id) => byId.get(id))
        .filter(
          (p): p is AdminProductSummary =>
            Boolean(p) && p!.availability !== "draft",
        )
        .slice(0, config.products.count)
        .map(productToPreviewItem);
    }
    return sortedProducts
      .slice(0, config.products.count)
      .map(productToPreviewItem);
  }, [config.products, products, sortedProducts]);

  const previewDiscount = useMemo<ResolvedDiscount | null>(() => {
    const d = config.discount;
    if (!d.enabled) return null;
    if (d.source === "inline") {
      if (!d.inlineCode) return null;
      return {
        headline: d.inlineHeadline,
        code: d.inlineCode,
        description: d.inlineDescription,
        expiresAt: d.inlineExpiresAt || "",
      };
    }
    if (!d.linkedCode) return null;
    const promo = promoCodes.find(
      (p) =>
        p.enabled !== false &&
        p.code.toUpperCase() === d.linkedCode.toUpperCase(),
    );
    if (!promo) return null;
    return {
      headline: "Your welcome gift",
      code: promo.code,
      description: promo.description || formatPromoDescription(promo),
      expiresAt: promo.expiresAt || "",
    };
  }, [config.discount, promoCodes]);

  const previewHtml = useMemo(
    () => renderPreviewHtml(config, previewProducts, previewDiscount),
    [config, previewProducts, previewDiscount],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading welcome email…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-card/40 border border-border/60 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl">Welcome email</h2>
          <p className="text-sm text-muted-foreground">
            Sent automatically the first time a user signs up with email or
            connects with Google. Edit the subject, body, branding, and a CTA
            button. Replies go to the address in <em>Reply-to</em>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label
            htmlFor="welcome-enabled"
            className="text-sm text-muted-foreground"
          >
            Enabled
          </Label>
          <Switch
            id="welcome-enabled"
            checked={config.enabled}
            onCheckedChange={(v) => update("enabled", Boolean(v))}
          />
        </div>
      </header>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="font-display text-sm uppercase tracking-[0.2em]">
            Suggested templates
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Click one to load it into the form below. You can edit afterwards
          before saving.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTED_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="text-left rounded-md border border-border/60 bg-background/60 hover:border-foreground/40 transition p-3"
              onClick={() => applyTemplate(tpl)}
            >
              <div className="font-display text-sm">{tpl.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {tpl.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-[0.2em]">
          From & reply-to
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>From name</Label>
            <Input
              value={config.fromName}
              onChange={(e) => update("fromName", e.target.value)}
              placeholder="Canvas Hub"
            />
          </div>
          <div className="space-y-1">
            <Label>From email (display)</Label>
            <Input
              value={config.fromEmail}
              onChange={(e) => update("fromEmail", e.target.value)}
              placeholder="account@canvhub.com"
            />
            <p className="text-[11px] text-muted-foreground">
              The actual sender header is controlled by the{" "}
              <code className="px-1 rounded bg-muted/40">EMAIL_FROM</code> env
              var on Cloudflare Pages. This field is shown for your reference.
            </p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Reply-to</Label>
            <Input
              value={config.replyTo}
              onChange={(e) => update("replyTo", e.target.value)}
              placeholder="account@canvhub.com"
            />
            <p className="text-[11px] text-muted-foreground">
              Reply-to is set on Cloudflare via{" "}
              <code className="px-1 rounded bg-muted/40">EMAIL_REPLY_TO</code>.
              When that env var is set, replies land in your Namecheap inbox.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-[0.2em]">
          Subject & body
        </h3>
        <div className="space-y-1">
          <Label>Subject</Label>
          <Input
            value={config.subject}
            onChange={(e) => update("subject", e.target.value)}
            placeholder={DEFAULTS.subject}
          />
          <p className="text-[11px] text-muted-foreground">
            {PLACEHOLDER_HINT}
          </p>
        </div>
        <div className="space-y-1">
          <Label>Body</Label>
          <Textarea
            value={config.body}
            onChange={(e) => update("body", e.target.value)}
            rows={10}
            placeholder={DEFAULTS.body}
          />
          <p className="text-[11px] text-muted-foreground">
            Plain text with line breaks. Blank lines start a new paragraph.{" "}
            {PLACEHOLDER_HINT}
          </p>
        </div>
        <div className="space-y-1">
          <Label>Signature</Label>
          <Textarea
            value={config.signature}
            onChange={(e) => update("signature", e.target.value)}
            rows={3}
            placeholder={DEFAULTS.signature}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-[0.2em]">
          Branding & images
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Primary color</Label>
            <div className="flex items-center gap-2">
              <input
                aria-label="Primary color"
                type="color"
                value={
                  isSafeColor(config.primaryColor)
                    ? config.primaryColor
                    : "#1c1c1c"
                }
                onChange={(e) => update("primaryColor", e.target.value)}
                className="h-9 w-12 rounded border border-border/60 bg-transparent"
              />
              <Input
                value={config.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                placeholder="#1c1c1c"
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                aria-label="Accent color"
                type="color"
                value={
                  isSafeColor(config.accentColor)
                    ? config.accentColor
                    : "#7a7468"
                }
                onChange={(e) => update("accentColor", e.target.value)}
                className="h-9 w-12 rounded border border-border/60 bg-transparent"
              />
              <Input
                value={config.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                placeholder="#7a7468"
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <ImageUploader
          label="Logo"
          description="Optional. Leave empty to use the gold italic 'Canvas Hub' wordmark. Recommended ~200×48 px on a transparent or white background."
          value={config.logoUrl}
          show={config.showLogo}
          onShowChange={(v) => update("showLogo", v)}
          onUpload={(file) => handleUploadImage(file, "logoUrl")}
          onClear={() => update("logoUrl", "")}
          onUrlChange={(v) => update("logoUrl", v)}
          inputRef={logoInputRef}
        />

        <ImageUploader
          label="Banner image"
          description="Optional image rendered full-width below the logo. Recommended ~1200×400 px."
          value={config.bannerUrl}
          show={config.showBanner}
          onShowChange={(v) => update("showBanner", v)}
          onUpload={(file) => handleUploadImage(file, "bannerUrl")}
          onClear={() => update("bannerUrl", "")}
          onUrlChange={(v) => update("bannerUrl", v)}
          inputRef={bannerInputRef}
        />

        <ImageUploader
          label="Profile photo"
          description="Optional round avatar shown above the signature. Upload a square image (e.g. 256×256) and toggle Show in email on if you want it. The avatar that appears next to 'From: Canvas Hub' in Gmail's inbox list is a separate thing — that one comes from Gravatar (set up at gravatar.com using account@canvhub.com)."
          value={config.avatarUrl}
          show={config.showAvatar}
          onShowChange={(v) => update("showAvatar", v)}
          onUpload={(file) => handleUploadImage(file, "avatarUrl")}
          onClear={() => update("avatarUrl", "")}
          onUrlChange={(v) => update("avatarUrl", v)}
          inputRef={avatarInputRef}
        />

        {config.showAvatar && (
          <div className="space-y-1">
            <Label>Sender name (next to the photo)</Label>
            <Input
              value={config.avatarName}
              onChange={(e) => update("avatarName", e.target.value)}
              placeholder="Canvas Hub team"
            />
            <p className="text-[11px] text-muted-foreground">
              Shown next to the avatar with the From email below it.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-[0.2em]">
          Call-to-action button
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Button label</Label>
            <Input
              value={config.ctaLabel}
              onChange={(e) => update("ctaLabel", e.target.value)}
              placeholder="Browse the collection"
            />
          </div>
          <div className="space-y-1">
            <Label>Button URL</Label>
            <Input
              value={config.ctaUrl}
              onChange={(e) => update("ctaUrl", e.target.value)}
              placeholder="https://canvhub.com"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Leave the label or URL blank to hide the button.
        </p>
      </section>

      <section className="space-y-4 rounded-md border border-border/60 bg-card/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm uppercase tracking-[0.2em] flex items-center gap-2">
            <Package className="w-4 h-4" /> Products in the email
          </h3>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="welcome-products-enabled"
              className="text-xs text-muted-foreground"
            >
              Show
            </Label>
            <Switch
              id="welcome-products-enabled"
              checked={config.products.enabled}
              onCheckedChange={(v) => updateProducts("enabled", Boolean(v))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Drops a small grid of paintings into the email so the customer sees
          something they can click straight from their inbox. Draft products are
          skipped automatically.
        </p>

        {config.products.enabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Mode</Label>
                <select
                  className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm"
                  value={config.products.mode}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next: WelcomeProductsConfig["mode"] =
                      v === "manual"
                        ? "manual"
                        : v === "custom"
                          ? "custom"
                          : "auto";
                    updateProducts("mode", next);
                  }}
                >
                  <option value="auto">Auto — newest products</option>
                  <option value="manual">Manual — I'll pick</option>
                  <option value="custom">
                    Email-only uploads — image + title + price + description
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>How many to show</Label>
                <select
                  className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm"
                  value={String(config.products.count)}
                  onChange={(e) =>
                    updateProducts("count", Number(e.target.value) || 4)
                  }
                >
                  {[2, 3, 4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Show prices</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={config.products.showPrice}
                    onCheckedChange={(v) =>
                      updateProducts("showPrice", Boolean(v))
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {config.products.showPrice ? "On" : "Off"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Section heading</Label>
              <Input
                value={config.products.sectionTitle}
                onChange={(e) => updateProducts("sectionTitle", e.target.value)}
                placeholder="A glimpse of the collection"
              />
            </div>

            {config.products.mode === "manual" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Pick paintings ({config.products.manualIds.length}/
                    {config.products.count} chosen)
                  </Label>
                  {config.products.manualIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateProducts("manualIds", [])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {sortedProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No products yet — add some in <em>Stock listings</em> first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-72 overflow-auto rounded-md border border-border/60 p-2">
                    {sortedProducts.map((p) => {
                      const checked = config.products.manualIds.includes(p.id);
                      const overflow =
                        !checked &&
                        config.products.manualIds.length >=
                          config.products.count;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={overflow}
                          onClick={() => toggleManualProduct(p.id)}
                          className={`text-left rounded-md border p-1.5 transition ${
                            checked
                              ? "border-foreground bg-foreground/5"
                              : "border-border/60 hover:border-foreground/40"
                          } ${overflow ? "opacity-40 cursor-not-allowed" : ""}`}
                        >
                          <div className="aspect-square rounded bg-card/40 overflow-hidden">
                            {productThumbnailUrl(p) ? (
                              <img
                                src={productThumbnailUrl(p)}
                                alt={p.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] mt-1 line-clamp-2">
                            {p.title}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Order matches the order you click them.
                </p>
              </div>
            )}

            {config.products.mode === "custom" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Email-only paintings</Label>
                  <p className="text-[11px] text-muted-foreground">
                    These don't appear on the public storefront. Each card links
                    to a preview page (
                    <code className="text-[10px]">/preview/&lt;id&gt;</code>)
                    that shows the painting larger so customers can browse
                    before deciding to visit the full collection.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: config.products.count }).map((_, i) => {
                    const item = config.products.customItems[i] ?? {
                      id: "",
                      imageUrl: "",
                      title: "",
                      price: 0,
                      description: "",
                    };
                    return (
                      <div
                        key={item.id || `slot-${i}`}
                        className="rounded-md border border-border/60 bg-background/50 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">
                            Slot {i + 1}
                          </Label>
                          {item.imageUrl || item.title ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() =>
                                updateCustomItem(i, {
                                  imageUrl: "",
                                  title: "",
                                  price: 0,
                                  description: "",
                                })
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          ) : null}
                        </div>
                        <div className="aspect-square rounded-md bg-card/40 overflow-hidden border border-border/60 relative">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title || ""}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        <label className="block">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleCustomItemImage(
                                i,
                                e.target.files?.[0] ?? null,
                              )
                            }
                          />
                          <span className="inline-flex items-center gap-1 text-xs underline cursor-pointer text-foreground/80 hover:text-foreground">
                            <Upload className="w-3 h-3" />
                            {item.imageUrl ? "Replace image" : "Upload image"}
                          </span>
                        </label>
                        <div className="space-y-1">
                          <Label className="text-xs">Title</Label>
                          <Input
                            value={item.title}
                            onChange={(e) =>
                              updateCustomItem(i, { title: e.target.value })
                            }
                            placeholder="Untitled painting"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Price (₱)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={item.price || ""}
                            onChange={(e) =>
                              updateCustomItem(i, {
                                price: Math.max(
                                  0,
                                  Math.round(Number(e.target.value) || 0),
                                ),
                              })
                            }
                            placeholder="2500"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Short description</Label>
                          <Textarea
                            rows={2}
                            value={item.description}
                            onChange={(e) =>
                              updateCustomItem(i, {
                                description: e.target.value,
                              })
                            }
                            placeholder="One or two lines about the piece"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-4 rounded-md border border-border/60 bg-card/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm uppercase tracking-[0.2em] flex items-center gap-2">
            <Tag className="w-4 h-4" /> Welcome discount
          </h3>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="welcome-discount-enabled"
              className="text-xs text-muted-foreground"
            >
              Include
            </Label>
            <Switch
              id="welcome-discount-enabled"
              checked={config.discount.enabled}
              onCheckedChange={(v) => updateDiscount("enabled", Boolean(v))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Drop a promo code into the email. Customers like a small "thanks for
          joining" gift and tend to come back to use it.
        </p>

        {config.discount.enabled && (
          <>
            <div className="space-y-1">
              <Label>Source</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    {
                      id: "linked",
                      label: "Pick an existing promo code",
                    },
                    {
                      id: "inline",
                      label: "Write it inline",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateDiscount("source", opt.id)}
                    className={`px-3 py-1.5 rounded-md border text-xs ${
                      config.discount.source === opt.id
                        ? "border-foreground bg-foreground/5"
                        : "border-border/60 hover:border-foreground/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {config.discount.source === "linked" ? (
              <div className="space-y-1">
                <Label>Promo code</Label>
                {promoCodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No promo codes set up yet — create one in{" "}
                    <em>Storefront → Promo codes</em>, then come back.
                  </p>
                ) : (
                  <select
                    className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm"
                    value={config.discount.linkedCode}
                    onChange={(e) =>
                      updateDiscount("linkedCode", e.target.value.toUpperCase())
                    }
                  >
                    <option value="">— Pick a code —</option>
                    {promoCodes.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} ({formatPromoDescription(p) || "custom"})
                        {p.enabled === false ? " — disabled" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Description and expiry are pulled from the promo code, so
                  edits there flow into future welcome emails automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Headline</Label>
                  <Input
                    value={config.discount.inlineHeadline}
                    onChange={(e) =>
                      updateDiscount("inlineHeadline", e.target.value)
                    }
                    placeholder="Your welcome gift"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Code</Label>
                  <Input
                    value={config.discount.inlineCode}
                    onChange={(e) =>
                      updateDiscount("inlineCode", e.target.value.toUpperCase())
                    }
                    placeholder="WELCOME10"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={config.discount.inlineDescription}
                    onChange={(e) =>
                      updateDiscount("inlineDescription", e.target.value)
                    }
                    placeholder="10% off your first painting."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expires (optional)</Label>
                  <Input
                    type="date"
                    value={
                      config.discount.inlineExpiresAt
                        ? config.discount.inlineExpiresAt.slice(0, 10)
                        : ""
                    }
                    onChange={(e) =>
                      updateDiscount(
                        "inlineExpiresAt",
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      )
                    }
                  />
                </div>
                <p className="text-[11px] text-muted-foreground sm:col-span-2">
                  Make sure to actually create a matching code in{" "}
                  <em>Storefront → Promo codes</em>, otherwise the customer
                  won't be able to redeem it at checkout.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-[0.2em] flex items-center gap-2">
            <Eye className="w-4 h-4" /> Preview
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? "Hide" : "Show"}
          </Button>
        </div>
        {showPreview && (
          <iframe
            title="Welcome email preview"
            srcDoc={previewHtml}
            className="w-full min-h-[480px] rounded-md border border-border/60 bg-white"
          />
        )}
      </section>

      <section className="space-y-3 rounded-md border border-border/60 bg-card/30 p-4">
        <h3 className="font-display text-sm uppercase tracking-[0.2em]">
          Send a test
        </h3>
        <p className="text-xs text-muted-foreground">
          Sends the current (unsaved) template to the address below so you can
          check how it actually lands in an inbox.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={handleSendTest}
            disabled={sendingTest || !testEmail.trim()}
          >
            {sendingTest ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send test
          </Button>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleResetDefaults}>
          <RotateCcw className="w-4 h-4" /> Reset to defaults
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save welcome email
        </Button>
      </div>
    </div>
  );
};

interface ImageUploaderProps {
  label: string;
  description: string;
  value: string;
  show: boolean;
  onShowChange: (v: boolean) => void;
  onUpload: (file: File | null) => void;
  onClear: () => void;
  onUrlChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const ImageUploader = ({
  label,
  description,
  value,
  show,
  onShowChange,
  onUpload,
  onClear,
  onUrlChange,
  inputRef,
}: ImageUploaderProps) => (
  <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
    <div className="flex items-start gap-3">
      <div className="w-12 h-12 rounded bg-card/60 border border-border/60 flex items-center justify-center shrink-0 overflow-hidden">
        {value ? (
          <img
            src={value}
            alt={`${label} preview`}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm">{label}</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show in email</span>
            <Switch checked={show} onCheckedChange={onShowChange} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
      </div>
    </div>

    <div className="flex flex-col sm:flex-row gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-4 h-4" /> Upload
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="w-4 h-4" /> Remove
        </Button>
      )}
    </div>

    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        …or paste a public URL
      </Label>
      <Input
        value={value.startsWith("data:") ? "" : value}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://canvhub.com/logo.png"
      />
    </div>
  </div>
);
