import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save, Type } from "lucide-react";
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
});

export const SiteCopySection = () => {
  const { token } = useAdminAuth();
  const { config, refresh } = useStorefrontConfig();
  const [copy, setCopy] = useState<SiteCopy>(cloneDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Pull the current saved values from the admin endpoint so blanks vs
  // saved-empty are unambiguous. We seed from context first for a fast
  // first paint, then overwrite once the admin fetch lands.
  useEffect(() => {
    setCopy({
      gallery: { ...config.siteCopy.gallery },
      about: { ...config.siteCopy.about },
      reviews: { ...config.siteCopy.reviews },
      contact: { ...config.siteCopy.contact },
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
          setCopy({
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
          });
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

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save site copy
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
