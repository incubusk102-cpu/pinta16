import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mail,
  MousePointerClick,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import ScrollableTable from "./ScrollableTable";

type Audience =
  | "all"
  | "subscribers"
  | "customers"
  | "customers:vip"
  | "customers:repeat"
  | "customers:one_time"
  | "customers:at_risk"
  | "customers:lead";

const AUDIENCE_OPTIONS: { value: Audience; label: string; hint: string }[] = [
  {
    value: "subscribers",
    label: "Newsletter subscribers",
    hint: "Everyone who opted in via the storefront signup",
  },
  {
    value: "customers",
    label: "All customers",
    hint: "Anyone who placed at least one order",
  },
  {
    value: "all",
    label: "Subscribers + customers",
    hint: "Combined audience, deduped by email",
  },
  {
    value: "customers:vip",
    label: "VIP customers",
    hint: "Net spend ≥ ₱10,000 lifetime",
  },
  {
    value: "customers:repeat",
    label: "Repeat customers",
    hint: "2+ orders, not VIP",
  },
  {
    value: "customers:one_time",
    label: "One-time buyers",
    hint: "Exactly 1 order so far",
  },
  {
    value: "customers:at_risk",
    label: "At-risk (lapsed)",
    hint: "Hasn't ordered in 60+ days",
  },
  {
    value: "customers:lead",
    label: "Leads (registered, no orders)",
    hint: "Account created but never purchased",
  },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sending: "Sending…",
  sent: "Sent",
};

const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

interface BroadcastIndexEntry {
  id: string;
  subject: string;
  audience: Audience;
  status: string;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

interface BroadcastDoc {
  id: string;
  subject: string;
  heading: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  audience: Audience;
  status: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

interface BroadcastStats {
  openTotal: number;
  clickTotal: number;
  uniqueOpens: number;
  uniqueClicks: number;
}

interface ListResponse {
  items: BroadcastIndexEntry[];
  emailConfigured: boolean;
  fromAddress: string;
}

interface AudienceCountsResponse {
  counts: Record<string, number>;
  maxPerSend: number;
}

const EMPTY_DRAFT: BroadcastDoc = {
  id: "",
  subject: "",
  heading: "",
  bodyText: "",
  ctaLabel: "",
  ctaUrl: "",
  audience: "subscribers",
  status: "draft",
  createdAt: "",
  updatedAt: "",
  sentAt: null,
  recipientCount: 0,
  sentCount: 0,
  failedCount: 0,
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
};

const audienceLabel = (a: string) =>
  AUDIENCE_OPTIONS.find((o) => o.value === a)?.label || a;

async function api<T>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, {
    method: init?.method || (init?.json !== undefined ? "POST" : "GET"),
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message =
      (data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function BroadcastsSection() {
  const [items, setItems] = useState<BroadcastIndexEntry[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [fromAddress, setFromAddress] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [maxPerSend, setMaxPerSend] = useState(300);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [draft, setDraft] = useState<BroadcastDoc>(EMPTY_DRAFT);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStats, setSelectedStats] = useState<BroadcastStats | null>(
    null,
  );
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const updateDraft = (patch: Partial<BroadcastDoc>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDraftDirty(true);
  };

  const loadList = useCallback(async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [list, audCounts] = await Promise.all([
        api<ListResponse>("/api/admin/broadcasts?action=list"),
        api<AudienceCountsResponse>(
          "/api/admin/broadcasts?action=audience-counts",
        ).catch(() => ({ counts: {}, maxPerSend: 300 })),
      ]);
      setItems(list.items || []);
      setEmailConfigured(!!list.emailConfigured);
      setFromAddress(list.fromAddress || "");
      setCounts(audCounts.counts || {});
      setMaxPerSend(audCounts.maxPerSend || 300);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load broadcasts",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(false);
  }, [loadList]);

  const loadDraft = async (id: string) => {
    try {
      const data = await api<{
        broadcast: BroadcastDoc;
        stats: BroadcastStats;
      }>(`/api/admin/broadcasts?action=get&id=${encodeURIComponent(id)}`);
      setDraft(data.broadcast);
      setSelectedId(data.broadcast.id);
      setSelectedStats(data.stats);
      setDraftDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load");
    }
  };

  const startNew = () => {
    setDraft(EMPTY_DRAFT);
    setSelectedId(null);
    setSelectedStats(null);
    setDraftDirty(false);
  };

  const handleSave = async (): Promise<BroadcastDoc | null> => {
    if (!draft.subject.trim()) {
      toast.error("Subject is required");
      return null;
    }
    if (!draft.bodyText.trim()) {
      toast.error("Body is required");
      return null;
    }
    setSaving(true);
    try {
      const res = await api<{ broadcast: BroadcastDoc }>(
        "/api/admin/broadcasts?action=save",
        { json: { ...draft } },
      );
      setDraft(res.broadcast);
      setSelectedId(res.broadcast.id);
      setDraftDirty(false);
      toast.success("Broadcast saved");
      await loadList(false);
      return res.broadcast;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter a test recipient email");
      return;
    }
    setSendingTest(true);
    try {
      // Save first so the test reflects the latest draft (and we get a
      // stable id for the tracking links).
      let saved: BroadcastDoc | null = null;
      if (draftDirty || !selectedId) {
        saved = await handleSave();
        if (!saved) return;
      } else {
        saved = draft;
      }
      const res = await api<{
        delivered: boolean;
        result: { reason?: string };
      }>("/api/admin/broadcasts?action=send-test", {
        json: { id: saved.id, to: testEmail.trim() },
      });
      if (res.delivered) {
        toast.success(`Test sent to ${testEmail.trim()}`);
      } else {
        toast.error(
          `Test not delivered${res.result?.reason ? `: ${res.result.reason}` : ""}`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      let target = draft;
      if (draftDirty || !selectedId) {
        const saved = await handleSave();
        if (!saved) {
          setSending(false);
          return;
        }
        target = saved;
      }
      const res = await api<{
        broadcast: BroadcastDoc;
        sent: number;
        failed: number;
        recipients: number;
      }>("/api/admin/broadcasts?action=send-now", {
        json: { id: target.id },
      });
      toast.success(
        `Sent to ${res.sent} of ${res.recipients} recipient${
          res.recipients === 1 ? "" : "s"
        }${res.failed ? ` (${res.failed} failed)` : ""}`,
      );
      setDraft(res.broadcast);
      setSelectedId(res.broadcast.id);
      setSelectedStats({
        openTotal: 0,
        clickTotal: 0,
        uniqueOpens: 0,
        uniqueClicks: 0,
      });
      await loadList(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api("/api/admin/broadcasts?action=delete", {
        json: { id },
      });
      toast.success("Broadcast deleted");
      if (selectedId === id) startNew();
      await loadList(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setConfirmDelete(null);
    }
  };

  const audienceCount = useMemo(
    () => counts[draft.audience] ?? null,
    [counts, draft.audience],
  );

  const isSent = draft.status === "sent";

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading broadcasts…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Newsletter broadcasts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Send a one-off email to subscribers or customer segments. Opens and
            clicks are tracked per broadcast.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadList()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
            )}
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={startNew}>
            <Plus className="w-3.5 h-3.5 mr-2" />
            New broadcast
          </Button>
        </div>
      </header>

      {!emailConfigured ? (
        <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 rounded-md p-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Email provider not configured</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Set <code>RESEND_API_KEY</code> or <code>BREVO_API_KEY</code> plus{" "}
              <code>EMAIL_FROM</code> in Cloudflare Pages → Environment
              variables. Until then, send is disabled.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Composer */}
        <section className="space-y-4 border border-border/60 rounded-lg p-5 bg-card/40">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-display text-lg">
              {selectedId ? "Edit broadcast" : "Compose"}
            </h3>
            {draft.status ? (
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_CLS[draft.status] || ""}`}
              >
                {STATUS_LABEL[draft.status] || draft.status}
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bcast-subject">Subject</Label>
            <Input
              id="bcast-subject"
              value={draft.subject}
              onChange={(e) => updateDraft({ subject: e.target.value })}
              placeholder='e.g. "New collection drops Friday"'
              disabled={isSent}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bcast-heading">
              Heading{" "}
              <span className="text-xs text-muted-foreground">
                (optional — defaults to subject)
              </span>
            </Label>
            <Input
              id="bcast-heading"
              value={draft.heading}
              onChange={(e) => updateDraft({ heading: e.target.value })}
              placeholder="Big-letter heading at the top of the email"
              disabled={isSent}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bcast-body">Body</Label>
            <Textarea
              id="bcast-body"
              value={draft.bodyText}
              onChange={(e) => updateDraft({ bodyText: e.target.value })}
              placeholder={
                "Tell your story — what's new, what's restocked, why it matters. Double-line breaks make new paragraphs."
              }
              rows={10}
              disabled={isSent}
            />
            <p className="text-[11px] text-muted-foreground">
              Plain text; double newline = new paragraph. HTML in the body is
              escaped to keep emails safe.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bcast-cta-label">CTA button label</Label>
              <Input
                id="bcast-cta-label"
                value={draft.ctaLabel}
                onChange={(e) => updateDraft({ ctaLabel: e.target.value })}
                placeholder='e.g. "Browse the collection"'
                disabled={isSent}
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bcast-cta-url">CTA URL</Label>
              <Input
                id="bcast-cta-url"
                value={draft.ctaUrl}
                onChange={(e) => updateDraft({ ctaUrl: e.target.value })}
                placeholder="https://canvhub.com/gallery"
                disabled={isSent}
                maxLength={2048}
                type="url"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bcast-audience">Audience</Label>
            <Select
              value={draft.audience}
              onValueChange={(v) => updateDraft({ audience: v as Audience })}
              disabled={isSent}
            >
              <SelectTrigger id="bcast-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        {opt.label}
                        {counts[opt.value] !== undefined
                          ? ` · ${counts[opt.value].toLocaleString()}`
                          : ""}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {AUDIENCE_OPTIONS.find((o) => o.value === draft.audience)?.hint}
              {audienceCount !== null
                ? ` · ${audienceCount.toLocaleString()} recipient${
                    audienceCount === 1 ? "" : "s"
                  }.`
                : ""}
            </p>
            {audienceCount !== null && audienceCount > maxPerSend ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This audience exceeds the {maxPerSend}-per-send limit. Pick a
                narrower segment for now (scheduled / batched sends are coming
                in a follow-up).
              </p>
            ) : null}
          </div>

          {!isSent ? (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border/40">
              <div className="space-y-1.5 grow">
                <Label htmlFor="bcast-test-email" className="text-xs">
                  Send test to
                </Label>
                <Input
                  id="bcast-test-email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSendTest()}
                disabled={sendingTest || sending || saving || !emailConfigured}
              >
                {sendingTest ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5 mr-2" />
                )}
                Send test
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || sending}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-2" />
                )}
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmSend(true)}
                disabled={
                  sending ||
                  saving ||
                  !emailConfigured ||
                  !draft.subject.trim() ||
                  !draft.bodyText.trim() ||
                  audienceCount === 0 ||
                  (audienceCount !== null && audienceCount > maxPerSend)
                }
              >
                <Send className="w-3.5 h-3.5 mr-2" />
                Send now
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/40 text-sm text-muted-foreground">
              Sent {formatDate(draft.sentAt)} — {draft.sentCount} of{" "}
              {draft.recipientCount} delivered
              {draft.failedCount ? `, ${draft.failedCount} failed` : ""}.
            </div>
          )}

          {isSent && selectedStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Opens"
                value={selectedStats.openTotal.toLocaleString()}
                hint={`${selectedStats.uniqueOpens} unique`}
                icon={<Mail className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Clicks"
                value={selectedStats.clickTotal.toLocaleString()}
                hint={`${selectedStats.uniqueClicks} unique`}
                icon={<MousePointerClick className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Open rate"
                value={
                  draft.sentCount > 0
                    ? `${Math.round(
                        (selectedStats.uniqueOpens / draft.sentCount) * 100,
                      )}%`
                    : "—"
                }
              />
              <Stat
                label="Click rate"
                value={
                  draft.sentCount > 0
                    ? `${Math.round(
                        (selectedStats.uniqueClicks / draft.sentCount) * 100,
                      )}%`
                    : "—"
                }
              />
            </div>
          ) : null}
        </section>

        {/* History */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg">History</h3>
            <span className="text-xs text-muted-foreground">
              {items.length} total
            </span>
          </div>
          {fromAddress ? (
            <p className="text-[11px] text-muted-foreground">
              Sent from: <code>{fromAddress}</code>
            </p>
          ) : null}
          {items.length === 0 ? (
            <div className="border border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground">
              No broadcasts yet. Compose your first one on the left.
            </div>
          ) : (
            <ScrollableTable>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="text-left font-medium py-1.5 pr-2">
                      Subject
                    </th>
                    <th className="text-right font-medium py-1.5 px-2">Sent</th>
                    <th className="text-right font-medium py-1.5 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className={`border-b border-border/30 hover:bg-muted/30 cursor-pointer ${
                        selectedId === it.id ? "bg-muted/40" : ""
                      }`}
                      onClick={() => void loadDraft(it.id)}
                    >
                      <td className="py-2 pr-2 align-top">
                        <div className="font-medium truncate max-w-[18ch]">
                          {it.subject || "(no subject)"}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span
                            className={`uppercase tracking-wider px-1 py-px rounded ${
                              STATUS_CLS[it.status] || ""
                            }`}
                          >
                            {STATUS_LABEL[it.status] || it.status}
                          </span>
                          <span>{audienceLabel(it.audience)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 align-top text-right text-xs">
                        {it.status === "sent" ? (
                          <>
                            <div>{it.sentCount.toLocaleString()}</div>
                            <div className="text-muted-foreground">
                              {formatDate(it.sentAt)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pl-2 align-top text-right">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                          aria-label={`Delete ${it.subject}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(it.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </aside>
      </div>

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              {audienceCount !== null
                ? `This will email ${audienceCount.toLocaleString()} ${audienceLabel(
                    draft.audience,
                  ).toLowerCase()} from ${fromAddress || "the configured sender"}. Once sent the broadcast cannot be edited.`
                : "This will send the broadcast to the resolved audience."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>
              Keep as draft
            </AlertDialogCancel>
            <AlertDialogAction
              className="border border-emerald-500/30 bg-emerald-600 text-white shadow-md hover:bg-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
              onClick={() => void handleSendNow()}
              disabled={sending}
            >
              {sending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send now"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the draft and any tracking stats. Sent emails already
              in inboxes are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep broadcast</AlertDialogCancel>
            <AlertDialogAction
              className="border border-destructive/30 bg-destructive/10 text-destructive shadow-sm hover:bg-destructive hover:text-destructive-foreground hover:shadow-md"
              onClick={() =>
                confirmDelete ? void handleDelete(confirmDelete) : undefined
              }
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete broadcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-border/40 rounded-md p-3 bg-card/40">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-display text-xl mt-1">{value}</div>
      {hint ? (
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
