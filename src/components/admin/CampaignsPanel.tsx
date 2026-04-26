import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";

type AudienceKind =
  | "all-customers"
  | "recent-customers"
  | "newsletter"
  | "all"
  | "custom";

interface Audience {
  kind: AudienceKind;
  days?: number;
  emails?: string[];
}

interface SentCampaign {
  id: string;
  subject: string;
  html: string;
  audienceSummary: string;
  totalRecipients: number;
  delivered: number;
  failed: number;
  errors: { email: string; reason: string }[];
  startedAt: string;
  finishedAt: string;
}

const AUDIENCE_OPTIONS: { value: AudienceKind; label: string }[] = [
  { value: "all-customers", label: "All past customers" },
  { value: "recent-customers", label: "Customers in the last N days" },
  { value: "newsletter", label: "Newsletter subscribers" },
  { value: "all", label: "Everyone (customers + newsletter)" },
  { value: "custom", label: "Custom email list" },
];

const DEFAULT_HTML = `<p>Hi {name},</p>
<p>Just a quick note from Pintaterra — write your campaign here.</p>
<p>— The Pintaterra team</p>`;

const formatDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export function CampaignsPanel() {
  const { token } = useAdminAuth();
  const [history, setHistory] = useState<SentCampaign[]>([]);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [audienceKind, setAudienceKind] =
    useState<AudienceKind>("all-customers");
  const [audienceDays, setAudienceDays] = useState("30");
  const [customEmails, setCustomEmails] = useState("");

  const audience: Audience = useMemo(() => {
    if (audienceKind === "recent-customers") {
      return { kind: audienceKind, days: Number(audienceDays) || 30 };
    }
    if (audienceKind === "custom") {
      return {
        kind: audienceKind,
        emails: customEmails
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
    return { kind: audienceKind };
  }, [audienceKind, audienceDays, customEmails]);

  const authHeaders: Record<string, string> = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  );

  const refreshHistory = async () => {
    try {
      const res = await fetch("/api/campaigns", { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(Array.isArray(data?.campaigns) ? data.campaigns : []);
      setEmailConfigured(Boolean(data?.emailConfigured));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load campaigns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset preview count any time audience changes.
  useEffect(() => {
    setPreviewCount(null);
  }, [audienceKind, audienceDays, customEmails]);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "preview", audience }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPreviewCount(data.count);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim()) return toast.error("Subject is required");
    if (!html.trim()) return toast.error("Email body is required");
    if (
      previewCount === null ||
      !window.confirm(
        previewCount === null
          ? "Send this campaign to the chosen audience?"
          : `Send to ${previewCount} recipient${previewCount === 1 ? "" : "s"}?`,
      )
    ) {
      // window.confirm returns false → bail; if previewCount null and the
      // confirm was accepted, we still proceed.
      if (previewCount !== null) return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "send", subject, html, audience }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const c: SentCampaign = data.campaign;
      if (c.failed === 0) {
        toast.success(
          `Sent to ${c.delivered} recipient${c.delivered === 1 ? "" : "s"}`,
        );
      } else {
        toast.message(
          `Delivered ${c.delivered}, failed ${c.failed} of ${c.totalRecipients}`,
        );
      }
      void refreshHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 border border-border/50 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <div>
            <h3 className="font-display text-base">Email campaigns</h3>
            <p className="text-xs text-muted-foreground">
              Broadcast announcements, promo codes, or follow-ups to past
              customers and newsletter subscribers.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void refreshHistory()}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {emailConfigured === false && (
        <div className="text-xs rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
          Email provider is not configured. Set <code>RESEND_API_KEY</code> or{" "}
          <code>BREVO_API_KEY</code> (plus <code>EMAIL_FROM</code>) in your
          Netlify env to enable sending.
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label htmlFor="campaign-subject">Subject</Label>
          <Input
            id="campaign-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="A note from Pintaterra…"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Use <code>{"{name}"}</code> to personalise (falls back to "there").
          </p>
        </div>

        <div>
          <Label htmlFor="campaign-html">Body (HTML allowed)</Label>
          <Textarea
            id="campaign-html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={8}
            placeholder="Write your campaign body. <p>, <a>, <strong> etc. are fine."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="campaign-audience">Audience</Label>
            <Select
              value={audienceKind}
              onValueChange={(v) => setAudienceKind(v as AudienceKind)}
            >
              <SelectTrigger id="campaign-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {audienceKind === "recent-customers" && (
            <div>
              <Label htmlFor="campaign-days">Days</Label>
              <Input
                id="campaign-days"
                type="number"
                min="1"
                max="3650"
                value={audienceDays}
                onChange={(e) => setAudienceDays(e.target.value)}
              />
            </div>
          )}
        </div>

        {audienceKind === "custom" && (
          <div>
            <Label htmlFor="campaign-emails">
              Email addresses (commas, spaces, or newlines OK)
            </Label>
            <Textarea
              id="campaign-emails"
              value={customEmails}
              onChange={(e) => setCustomEmails(e.target.value)}
              rows={4}
              placeholder="alice@example.com, bob@example.com"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/30">
          <div className="text-xs text-muted-foreground">
            {previewCount === null
              ? "Click Preview to count the audience before sending."
              : `Will send to ${previewCount} recipient${previewCount === 1 ? "" : "s"}.`}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePreview()}
              disabled={previewing}
            >
              {previewing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Preview audience
            </Button>
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || emailConfigured === false}
            >
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              Send now
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-3 border-t border-border/30">
        <h4 className="font-medium text-sm">Recent sends</h4>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No campaigns sent yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.slice(0, 8).map((c) => (
              <li
                key={c.id}
                className="bg-muted/30 rounded-md px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {c.subject || "(no subject)"}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(c.finishedAt)}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {c.audienceSummary} · delivered {c.delivered} ·{" "}
                  {c.failed > 0 ? (
                    <span className="text-destructive">failed {c.failed}</span>
                  ) : (
                    <span>failed 0</span>
                  )}
                </div>
                {c.errors.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground">
                      Show {c.errors.length} delivery error
                      {c.errors.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {c.errors.map((err, i) => (
                        <li
                          key={i}
                          className="text-[11px] text-muted-foreground"
                        >
                          {err.email}: {err.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
