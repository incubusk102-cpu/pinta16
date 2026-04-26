import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import {
  POLICY_SLUGS,
  type Policy,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";

const SLUG_LABEL: Record<PolicySlug, string> = {
  terms: "Terms & Conditions",
  refund: "Refund & Returns",
  shipping: "Shipping",
  privacy: "Privacy",
};

const SLUG_HINT: Record<PolicySlug, string> = {
  terms: "Site rules, IP, contact",
  refund: "Eligibility window + how to request",
  shipping: "Lead times, couriers, fees",
  privacy: "What you collect and why",
};

export function PoliciesSection() {
  const { policies, refresh } = usePolicies();
  const [active, setActive] = useState<PolicySlug>("terms");
  const [draft, setDraft] = useState<Policy>(policies.terms);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setDraft(policies[active]);
  }, [active, policies]);

  const dirty =
    draft.title !== policies[active].title ||
    draft.body !== policies[active].body;

  const save = async () => {
    const token = getAdminToken();
    if (!token) return toast.error("Sign in again");
    setSaving(true);
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update",
          slug: active,
          title: draft.title,
          body: draft.body,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      await refresh();
      toast.success(`${SLUG_LABEL[active]} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (
      !window.confirm(
        `Reset "${SLUG_LABEL[active]}" to the default text? Your edits will be lost.`,
      )
    )
      return;
    const token = getAdminToken();
    if (!token) return toast.error("Sign in again");
    setResetting(true);
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "reset", slug: active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Reset failed (${res.status})`);
      }
      await refresh();
      toast.success(`${SLUG_LABEL[active]} reset to default`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl">Policies</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Edit the public Terms, Refund, Shipping, and Privacy pages. Saved
            instantly to all visitors. Markdown supported (`#`, `##`, `-`,
            `**bold**`, `[label](url)`).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refresh()}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
        </Button>
      </header>

      <div className="flex gap-2 flex-wrap">
        {POLICY_SLUGS.map((slug) => (
          <button
            key={slug}
            type="button"
            onClick={() => setActive(slug)}
            className={`px-4 py-2 rounded-md text-sm border transition-colors ${
              active === slug
                ? "bg-foreground text-background border-foreground"
                : "border-border/60 hover:border-border"
            }`}
          >
            <div className="font-medium">{SLUG_LABEL[slug]}</div>
            <div
              className={`text-xs mt-0.5 ${
                active === slug ? "text-background/70" : "text-muted-foreground"
              }`}
            >
              {SLUG_HINT[slug]}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-4 border border-border/60 rounded-xl p-5">
        <div>
          <Label htmlFor="policy-title">Title</Label>
          <Input
            id="policy-title"
            value={draft.title}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={SLUG_LABEL[active]}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Shown as the link label in the footer and page heading.
          </p>
        </div>

        <div>
          <Label htmlFor="policy-body">Body (markdown)</Label>
          <textarea
            id="policy-body"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            maxLength={20000}
            rows={20}
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="# Heading&#10;&#10;Paragraph text…&#10;&#10;## Subheading&#10;- Bullet one&#10;- Bullet two"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              {draft.body.length.toLocaleString()} / 20,000 characters
            </p>
            {policies[active].updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last saved{" "}
                {new Date(
                  policies[active].updatedAt as string,
                ).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            disabled={resetting || saving}
          >
            {resetting ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Undo2 className="w-3.5 h-3.5 mr-2" />
            )}
            Reset to default
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>
    </section>
  );
}
