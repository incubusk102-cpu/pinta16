import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Type } from "lucide-react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  DEFAULT_SITE_COPY,
  useStorefrontConfig,
  type SiteCopy,
} from "@/contexts/StorefrontConfigContext";
import { toast } from "sonner";

const cloneDefaults = (): SiteCopy => ({
  gallery: { ...DEFAULT_SITE_COPY.gallery },
  about: { ...DEFAULT_SITE_COPY.about },
  reviews: { ...DEFAULT_SITE_COPY.reviews },
  contact: { ...DEFAULT_SITE_COPY.contact },
  newsletter: { ...DEFAULT_SITE_COPY.newsletter },
  madeToOrderNotice: { ...DEFAULT_SITE_COPY.madeToOrderNotice },
  productInfo: { ...DEFAULT_SITE_COPY.productInfo },
});

export const SiteCopySection = () => {
  const { token } = useAdminAuth();
  const { config, refresh } = useStorefrontConfig();
  const [copy, setCopy] = useState<SiteCopy>(cloneDefaults);
  const [baselineJson, setBaselineJson] = useState<string>(() =>
    JSON.stringify(cloneDefaults()),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isDirty = useMemo(() => {
    if (loading) return false;
    try {
      return JSON.stringify(copy) !== baselineJson;
    } catch {
      return false;
    }
  }, [copy, loading, baselineJson]);
  useUnsavedChangesGuard(isDirty);

  // Pull the current saved values from the admin endpoint so blanks vs
  // saved-empty are unambiguous. We seed from context first for a fast
  // first paint, then overwrite once the admin fetch lands.
  useEffect(() => {
    setCopy({
      gallery: { ...config.siteCopy.gallery },
      about: { ...config.siteCopy.about },
      reviews: { ...config.siteCopy.reviews },
      contact: { ...config.siteCopy.contact },
      newsletter: { ...config.siteCopy.newsletter },
      madeToOrderNotice: { ...config.siteCopy.madeToOrderNotice },
      productInfo: { ...config.siteCopy.productInfo },
    });
  }, [config.siteCopy]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.config?.siteCopy) {
          const next: SiteCopy = {
            gallery: {
              ...DEFAULT_SITE_COPY.gallery,
              ...data.config.siteCopy.gallery,
            },
            about: {
              ...DEFAULT_SITE_COPY.about,
              ...data.config.siteCopy.about,
            },
            reviews: {
              ...DEFAULT_SITE_COPY.reviews,
              ...data.config.siteCopy.reviews,
            },
            contact: {
              ...DEFAULT_SITE_COPY.contact,
              ...data.config.siteCopy.contact,
            },
            newsletter: {
              ...DEFAULT_SITE_COPY.newsletter,
              ...data.config.siteCopy.newsletter,
            },
            madeToOrderNotice: {
              ...DEFAULT_SITE_COPY.madeToOrderNotice,
              ...data.config.siteCopy.madeToOrderNotice,
            },
            productInfo: {
              ...DEFAULT_SITE_COPY.productInfo,
              ...data.config.siteCopy.productInfo,
            },
          };
          setCopy(next);
          setBaselineJson(JSON.stringify(next));
        }
      } catch (e) {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Could not load site copy",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "update-site-copy", siteCopy: copy }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success("Site copy saved");
      setBaselineJson(JSON.stringify(copy));
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCopy(cloneDefaults());
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading site copy…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-card/40 border border-border/60 flex items-center justify-center shrink-0">
          <Type className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl">Site copy</h2>
          <p className="text-sm text-muted-foreground">
            Edit the eyebrow, title, and (where applicable) body of each
            homepage section. Leaving a field blank reverts to the default text.
            Hero, Products, Policies, and the announcement bar are managed in
            their own admin tabs.
          </p>
        </div>
      </header>

      <SectionEditor
        title="Our Collection"
        description="Heading above the products grid on the homepage."
        fields={[
          {
            label: "Eyebrow (small caps line)",
            value: copy.gallery.eyebrow,
            onChange: (v) =>
              setCopy((c) => ({ ...c, gallery: { ...c.gallery, eyebrow: v } })),
            placeholder: DEFAULT_SITE_COPY.gallery.eyebrow,
          },
          {
            label: "Title",
            value: copy.gallery.title,
            onChange: (v) =>
              setCopy((c) => ({ ...c, gallery: { ...c.gallery, title: v } })),
            placeholder: DEFAULT_SITE_COPY.gallery.title,
          },
        ]}
      />

      <SectionEditor
        title="About"
        description="The studio / about section on the homepage."
        fields={[
          {
            label: "Eyebrow",
            value: copy.about.eyebrow,
            onChange: (v) =>
              setCopy((c) => ({ ...c, about: { ...c.about, eyebrow: v } })),
            placeholder: DEFAULT_SITE_COPY.about.eyebrow,
          },
          {
            label: "Title",
            value: copy.about.title,
            onChange: (v) =>
              setCopy((c) => ({ ...c, about: { ...c.about, title: v } })),
            placeholder: DEFAULT_SITE_COPY.about.title,
          },
          {
            label: "Body (line breaks preserved)",
            value: copy.about.body,
            onChange: (v) =>
              setCopy((c) => ({ ...c, about: { ...c.about, body: v } })),
            placeholder: DEFAULT_SITE_COPY.about.body,
            multiline: true,
            rows: 6,
          },
        ]}
      />

      <SectionEditor
        title="Reviews"
        description="Heading above the customer reviews list on the homepage."
        fields={[
          {
            label: "Eyebrow",
            value: copy.reviews.eyebrow,
            onChange: (v) =>
              setCopy((c) => ({ ...c, reviews: { ...c.reviews, eyebrow: v } })),
            placeholder: DEFAULT_SITE_COPY.reviews.eyebrow,
          },
          {
            label: "Title",
            value: copy.reviews.title,
            onChange: (v) =>
              setCopy((c) => ({ ...c, reviews: { ...c.reviews, title: v } })),
            placeholder: DEFAULT_SITE_COPY.reviews.title,
          },
        ]}
      />

      <SectionEditor
        title="Contact"
        description="Heading above the email / phone / studio details on the homepage."
        fields={[
          {
            label: "Eyebrow",
            value: copy.contact.eyebrow,
            onChange: (v) =>
              setCopy((c) => ({ ...c, contact: { ...c.contact, eyebrow: v } })),
            placeholder: DEFAULT_SITE_COPY.contact.eyebrow,
          },
          {
            label: "Title",
            value: copy.contact.title,
            onChange: (v) =>
              setCopy((c) => ({ ...c, contact: { ...c.contact, title: v } })),
            placeholder: DEFAULT_SITE_COPY.contact.title,
          },
        ]}
      />

      <SectionEditor
        title="Newsletter"
        description="The strapline above the email subscribe form in the Contact section."
        fields={[
          {
            label: "Eyebrow (small caps line)",
            value: copy.newsletter.eyebrow,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                newsletter: { ...c.newsletter, eyebrow: v },
              })),
            placeholder: DEFAULT_SITE_COPY.newsletter.eyebrow,
          },
          {
            label: "Headline",
            value: copy.newsletter.title,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                newsletter: { ...c.newsletter, title: v },
              })),
            placeholder: DEFAULT_SITE_COPY.newsletter.title,
            multiline: true,
            rows: 3,
          },
        ]}
      />

      <SectionEditor
        title="Product page — shipping & care"
        description="The two small lines at the bottom of every product page."
        fields={[
          {
            label: "Shipping label (small caps)",
            value: copy.productInfo.shippingLabel,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                productInfo: { ...c.productInfo, shippingLabel: v },
              })),
            placeholder: DEFAULT_SITE_COPY.productInfo.shippingLabel,
          },
          {
            label: "Shipping body",
            value: copy.productInfo.shippingBody,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                productInfo: { ...c.productInfo, shippingBody: v },
              })),
            placeholder: DEFAULT_SITE_COPY.productInfo.shippingBody,
            multiline: true,
            rows: 3,
          },
          {
            label: "Care label (small caps)",
            value: copy.productInfo.careLabel,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                productInfo: { ...c.productInfo, careLabel: v },
              })),
            placeholder: DEFAULT_SITE_COPY.productInfo.careLabel,
          },
          {
            label: "Care body",
            value: copy.productInfo.careBody,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                productInfo: { ...c.productInfo, careBody: v },
              })),
            placeholder: DEFAULT_SITE_COPY.productInfo.careBody,
            multiline: true,
            rows: 3,
          },
        ]}
      />

      <SectionEditor
        title="Made to order notice"
        description="The blue info box shown on a product page when its availability is set to Made to order."
        fields={[
          {
            label: "Heading (small caps line)",
            value: copy.madeToOrderNotice.heading,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                madeToOrderNotice: { ...c.madeToOrderNotice, heading: v },
              })),
            placeholder: DEFAULT_SITE_COPY.madeToOrderNotice.heading,
          },
          {
            label: "Body (line breaks preserved)",
            value: copy.madeToOrderNotice.body,
            onChange: (v) =>
              setCopy((c) => ({
                ...c,
                madeToOrderNotice: { ...c.madeToOrderNotice, body: v },
              })),
            placeholder: DEFAULT_SITE_COPY.madeToOrderNotice.body,
            multiline: true,
            rows: 5,
          },
        ]}
      />

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isDirty ? "Save site copy" : "Saved"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={saving}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset to defaults
        </Button>
      </div>

      {/* Sticky save bar — slides in at the bottom of the viewport when
          the admin has scrolled past the inline Save button and there
          are unsaved edits. Avoids pinning a bar permanently when no
          changes are pending. */}
      {isDirty && (
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-card/95 backdrop-blur-md border-t border-border/40 flex items-center justify-between gap-3 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span
            className="font-body text-xs text-amber-600 dark:text-amber-300 flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block w-2 h-2 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            Unsaved changes
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      )}
    </div>
  );
};

interface SectionField {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}

const SectionEditor = ({
  title,
  description,
  fields,
}: {
  title: string;
  description: string;
  fields: SectionField[];
}) => (
  <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
    <div>
      <h3 className="font-display text-base">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.label} className="space-y-1.5">
          <Label className="text-xs">{f.label}</Label>
          {f.multiline ? (
            <Textarea
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              rows={f.rows ?? 4}
            />
          ) : (
            <Input
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
            />
          )}
        </div>
      ))}
    </div>
  </section>
);
