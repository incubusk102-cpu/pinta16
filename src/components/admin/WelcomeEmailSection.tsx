import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  Image as ImageIcon,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  Send,
  Sparkles,
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
};

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

// Approximates the server-side wrapper so admins see the same thing the
// recipient will see (sans email-client quirks).
const renderPreviewHtml = (config: WelcomeEmailConfig): string => {
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

  const logoBlock = showLogo
    ? `<img src="${config.logoUrl}" alt="${fromName}" style="max-height:48px;max-width:200px;display:block;" />`
    : `<div style="font-family:Georgia,serif;font-size:22px;letter-spacing:0.02em;color:${primary};">${fromName}</div>`;

  const bannerBlock = showBanner
    ? `<tr><td style="padding:0;"><img src="${config.bannerUrl}" alt="" style="display:block;width:100%;max-width:560px;height:auto;" /></td></tr>`
    : "";

  return `
<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f3ee;font-family:Helvetica,Arial,sans-serif;color:${primary};">
  <div style="max-width:560px;margin:0 auto;font-size:11px;color:${accent};margin-bottom:8px;">
    <strong>Subject:</strong> ${escapeHtml(subject)}
  </div>
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e1d8;border-radius:6px;overflow:hidden;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #efece4;">${logoBlock}</td></tr>
    ${bannerBlock}
    <tr><td style="padding:24px 28px;font-size:14px;line-height:1.6;">
      ${paragraphsHtml}
      ${ctaHtml}
      ${signatureHtml}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid #efece4;font-size:11px;color:${accent};">${fromName} &mdash; original Filipino paintings.</td></tr>
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
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          config?: { welcomeEmail?: Partial<WelcomeEmailConfig> };
        };
        if (cancelled) return;
        if (data?.config?.welcomeEmail) {
          setConfig({ ...DEFAULTS, ...data.config.welcomeEmail });
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

  const handleUploadImage = async (
    file: File | null,
    field: "logoUrl" | "bannerUrl",
  ) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    try {
      const compressed = await compressImage(file, {
        maxDim: field === "bannerUrl" ? 1600 : 600,
        maxBytes: field === "bannerUrl" ? 600 * 1024 : 200 * 1024,
      });
      update(field, compressed.url);
      toast.success(
        `${field === "bannerUrl" ? "Banner" : "Logo"} uploaded (${Math.round(compressed.bytes / 1024)} KB)`,
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

  const previewHtml = useMemo(() => renderPreviewHtml(config), [config]);

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
          description="Shown at the top of the email. Recommended ~200×48 px on a transparent or white background."
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
