import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  HelpCircle,
  MessageSquare,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouterState } from "@tanstack/react-router";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import type { ChatFaqItem } from "@/lib/chat-faqs";
import { formatRelativeTime, linkifyMessage } from "@/lib/chat-format";

interface ChatMessage {
  at: string;
  from: "customer" | "admin" | "system";
  body: string;
}

interface ChatThread {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  messages: ChatMessage[];
  closedAt?: string;
  closedBy?: string;
  adminTypingAt?: string;
}

const STORAGE_KEY = "canvhub_chat_thread_v1";
const SOUND_PREF_KEY = "canvhub_chat_sound_v1";
const POLL_INTERVAL_MS = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_MAX = 2000;

interface PersistedHandle {
  id: string;
  name: string;
  email: string;
}

const readPersistedHandle = (): PersistedHandle | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
};

const writePersistedHandle = (handle: PersistedHandle | null) => {
  if (typeof window === "undefined") return;
  try {
    if (!handle) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(handle));
    }
  } catch {
    // ignore
  }
};

const readSoundPref = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) === "1";
  } catch {
    return false;
  }
};

const writeSoundPref = (on: boolean) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
};

// Short, polite "ding" encoded as a WebAudio oscillator so we don't need to
// ship a binary asset just for a 200ms sound.
const playNotificationDing = () => {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close().catch(() => {});
  } catch {
    // ignore
  }
};

type UnstartedView = "faq-list" | "faq-answer" | "agent-form";

export default function ChatWidget() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAdminRoute = pathname.startsWith("/admin");
  const { config } = useStorefrontConfig();
  const chatConfig = config.chat;

  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState<PersistedHandle | null>(() =>
    readPersistedHandle(),
  );
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [view, setView] = useState<UnstartedView>("faq-list");
  const [activeFaqId, setActiveFaqId] = useState<string | null>(null);
  const [faqPanelOpen, setFaqPanelOpen] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => readSoundPref());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const lastSeenIndexRef = useRef<number>(-1);
  const lastAdminAtRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHandle(readPersistedHandle());
  }, []);

  // Load existing thread when handle is present
  useEffect(() => {
    if (!handle || !chatConfig.enabled) {
      setThread(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/chat?action=thread&id=${encodeURIComponent(handle.id)}`,
        );
        if (!res.ok) {
          if (res.status === 404) {
            // Thread no longer exists (e.g. wiped) — reset.
            writePersistedHandle(null);
            if (!cancelled) setHandle(null);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled && data.thread) setThread(data.thread);
      } catch {
        // network error; widget stays usable, polling will retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, chatConfig.enabled]);

  // Poll for new messages while widget is mounted
  useEffect(() => {
    if (!handle || !chatConfig.enabled) return;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/chat?action=thread&id=${encodeURIComponent(handle.id)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.thread) setThread(data.thread);
      } catch {
        // ignore
      }
    };
    const id = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [handle, chatConfig.enabled]);

  // Track unread (admin) messages while widget is closed
  useEffect(() => {
    if (!thread) {
      setUnreadCount(0);
      return;
    }
    if (open) {
      lastSeenIndexRef.current = thread.messages.length - 1;
      setUnreadCount(0);
      return;
    }
    let count = 0;
    for (
      let i = lastSeenIndexRef.current + 1;
      i < thread.messages.length;
      i++
    ) {
      if (thread.messages[i].from === "admin") count++;
    }
    setUnreadCount(count);
  }, [thread, open]);

  // Auto-scroll on new message when open
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, thread?.messages.length]);

  // Ding on a brand-new admin reply. We track the timestamp of the latest
  // admin message in a ref; if it advances and sound is on, play a chime.
  // We also skip the first render's sound so a returning visitor doesn't get
  // startled by a ding for a reply they already saw.
  useEffect(() => {
    if (!thread) {
      lastAdminAtRef.current = "";
      return;
    }
    let latestAdminAt = "";
    for (const m of thread.messages) {
      if (m.from === "admin" && m.at > latestAdminAt) latestAdminAt = m.at;
    }
    const prior = lastAdminAtRef.current;
    lastAdminAtRef.current = latestAdminAt;
    if (!prior) return; // first load — don't ding for history
    if (latestAdminAt && latestAdminAt > prior && soundOn) {
      playNotificationDing();
    }
  }, [thread, soundOn]);

  // Refresh relative timestamps every 30 seconds while the widget is open.
  // Prime `nowTick` immediately on open so a widget that's been closed for
  // hours doesn't render timestamps against a stale mount-time value while
  // waiting for the first interval tick.
  useEffect(() => {
    if (!open) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev;
      writeSoundPref(next);
      if (next) {
        // Briefly play so the user can hear what they just enabled.
        playNotificationDing();
      }
      return next;
    });
  };

  const endConversation = () => {
    writePersistedHandle(null);
    setHandle(null);
    setThread(null);
    setView("faq-list");
    setActiveFaqId(null);
    setDraft("");
    setName("");
    setEmail("");
    lastAdminAtRef.current = "";
    toast.success("Conversation ended. Start a new one anytime.");
  };

  const messages = thread?.messages ?? [];
  const isClosed = Boolean(thread?.closedAt);
  const canSend = useMemo(
    () => draft.trim().length > 0 && !busy && !isClosed,
    [draft, busy, isClosed],
  );

  // Inline email validation on the live-agent form. We only show the error
  // once the user has typed something and stopped — nagging on every
  // keystroke before they've finished typing the address would be annoying.
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const showEmailError = trimmedEmail.length > 0 && !emailValid;
  const canSubmitAgentForm =
    !busy && trimmedName.length > 0 && emailValid && draft.trim().length > 0;

  // Admin "typing…" indicator: show whenever the server-reported
  // adminTypingAt is fresher than 6s and we don't yet have a newer admin
  // message in the transcript. The widget polls every 5s so the indicator
  // appears within a tick of the admin starting to type.
  const showAdminTyping = useMemo(() => {
    if (!thread || isClosed) return false;
    if (!thread.adminTypingAt) return false;
    const t = Date.parse(thread.adminTypingAt);
    if (Number.isNaN(t)) return false;
    if (nowTick - t > 6000) return false;
    // If there's already an admin message at-or-after the typing ping, the
    // admin already sent — don't keep showing the indicator.
    for (const m of thread.messages) {
      if (m.from === "admin" && Date.parse(m.at) >= t) return false;
    }
    return true;
  }, [thread, isClosed, nowTick]);

  const faqs: ChatFaqItem[] = chatConfig.faqs;
  const activeFaq = useMemo(
    () => faqs.find((f) => f.id === activeFaqId) ?? null,
    [faqs, activeFaqId],
  );

  if (isAdminRoute) return null;
  if (!chatConfig.enabled) return null;

  const openFaq = (id: string) => {
    setActiveFaqId(id);
    setView("faq-answer");
  };

  const backToFaqs = () => {
    setActiveFaqId(null);
    setView("faq-list");
  };

  const openAgentForm = (prefill?: string) => {
    if (prefill) setDraft((prev) => (prev ? prev : prefill));
    setView("agent-form");
  };

  const startThread = async () => {
    const trimmedMessage = draft.trim();
    if (!trimmedName) {
      toast.error("Please enter your name");
      return;
    }
    if (!emailValid) {
      toast.error("Please enter a valid email");
      return;
    }
    if (!trimmedMessage) {
      toast.error("Please enter a message");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          name: trimmedName,
          email: trimmedEmail,
          message: trimmedMessage,
        }),
      });
      const data: { thread?: ChatThread; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.thread)
        throw new Error(data.error || "Could not start chat");
      const persisted: PersistedHandle = {
        id: data.thread.id,
        name: data.thread.name,
        email: data.thread.email,
      };
      writePersistedHandle(persisted);
      setHandle(persisted);
      setThread(data.thread);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start chat");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!handle) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          id: handle.id,
          message: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send");
      if (data.thread) setThread(data.thread);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const showAgentHandoff = chatConfig.agentHandoff;

  const renderFaqList = () => (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {chatConfig.welcome}
      </p>
      {faqs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No quick topics set up yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {faqs.map((faq) => (
            <button
              key={faq.id}
              type="button"
              onClick={() => openFaq(faq.id)}
              className="text-left text-sm px-3 py-2 rounded-lg border border-border/60 hover:bg-accent/60 transition flex items-center gap-2"
            >
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1">{faq.question}</span>
            </button>
          ))}
        </div>
      )}
      {showAgentHandoff && (
        <div className="mt-auto pt-3 border-t border-border/60">
          <Button
            onClick={() => openAgentForm()}
            className="w-full gap-2"
            variant="default"
          >
            <User className="h-4 w-4" />
            Talk to a live agent
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            A real person will reply — usually within a few hours.
          </p>
        </div>
      )}
    </div>
  );

  const renderFaqAnswer = () => {
    if (!activeFaq) {
      return (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          Topic not available.
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
        <button
          type="button"
          onClick={backToFaqs}
          className="self-start inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to topics
        </button>
        <p className="text-sm font-medium">{activeFaq.question}</p>
        <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
          {activeFaq.answer}
        </div>
        {showAgentHandoff && (
          <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Still need help?
            </p>
            <Button
              onClick={() =>
                openAgentForm(
                  `Hi! I have a question about ${activeFaq.question.toLowerCase()}.`,
                )
              }
              className="w-full gap-2"
              variant="default"
            >
              <User className="h-4 w-4" />
              Talk to a live agent
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderAgentForm = () => (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <button
        type="button"
        onClick={backToFaqs}
        className="self-start inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to topics
      </button>
      <p className="text-xs text-muted-foreground">
        Tell us your name and email so we can get back to you.
      </p>
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={80}
        />
      </div>
      <div className="space-y-1">
        <label
          className="text-[11px] text-muted-foreground"
          htmlFor="chat-email"
        >
          Email
        </label>
        <Input
          id="chat-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          maxLength={200}
          aria-invalid={showEmailError || undefined}
          aria-describedby={showEmailError ? "chat-email-error" : undefined}
          className={
            showEmailError
              ? "border-destructive focus-visible:ring-destructive"
              : ""
          }
        />
        {showEmailError && (
          <p id="chat-email-error" className="text-[11px] text-destructive">
            Please enter a valid email so we can reply.
          </p>
        )}
      </div>
      <div className="space-y-1 flex-1 flex flex-col">
        <label className="text-[11px] text-muted-foreground">Message</label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What can we help with?"
          className="flex-1 min-h-[100px] resize-none"
          maxLength={2000}
        />
      </div>
      <Button onClick={startThread} disabled={!canSubmitAgentForm}>
        {busy ? "Starting…" : "Start chat"}
      </Button>
    </div>
  );

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-4 sm:right-4 z-50 print:hidden flex sm:block justify-end">
      {open ? (
        // Mobile: pin to the bottom and fill the viewport width minus a
        // small gutter so the chat panel never overflows narrow phones
        // (was hard-coded 340px which clipped on 320px viewports). Tab
        // and up gets the original fixed-width card.
        // Height caps at 75svh on mobile so it never covers more than ~3/4
        // of the screen — leaves room for the URL bar / nav. svh respects
        // dynamic viewport on iOS Safari.
        <div className="w-full sm:w-[380px] max-w-[420px] h-[min(520px,75svh)] bg-card border border-border/60 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/60">
            <div>
              <p className="text-sm font-medium">Chat with us</p>
              <p className="text-[10px] text-muted-foreground">
                {handle
                  ? "We usually reply within a few hours."
                  : showAgentHandoff
                    ? "Pick a topic or talk to a live agent."
                    : "Pick a topic below."}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {handle && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSound}
                  aria-label={
                    soundOn ? "Mute reply sound" : "Unmute reply sound"
                  }
                  title={
                    soundOn
                      ? "Reply sound is on — click to mute"
                      : "Reply sound is off — click to enable"
                  }
                  className={soundOn ? "" : "text-muted-foreground"}
                >
                  {soundOn ? (
                    <Bell className="h-4 w-4" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </Button>
              )}
              {handle && faqs.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFaqPanelOpen((v) => !v)}
                  aria-label="Show quick topics"
                  title="Quick topics"
                  className={faqPanelOpen ? "bg-accent" : ""}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!handle ? (
            <>
              {view === "faq-list" && renderFaqList()}
              {view === "faq-answer" && renderFaqAnswer()}
              {view === "agent-form" && renderAgentForm()}
            </>
          ) : (
            <>
              {faqPanelOpen && faqs.length > 0 && (
                <div className="border-b border-border/60 bg-muted/20 px-3 py-2 max-h-[180px] overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Quick topics
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {faqs.map((faq) => (
                      <button
                        key={faq.id}
                        type="button"
                        onClick={() => {
                          setDraft(faq.answer);
                          setFaqPanelOpen(false);
                        }}
                        className="text-[11px] px-2 py-1 rounded-full border border-border/60 hover:bg-accent transition"
                        title="Insert this answer into your reply"
                      >
                        {faq.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
              >
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center mt-6">
                    Loading…
                  </p>
                ) : (
                  messages.map((m, idx) => {
                    if (m.from === "system") {
                      return (
                        <div
                          key={`${m.at}-${idx}`}
                          className="flex flex-col items-center my-1"
                          role="status"
                        >
                          <p
                            className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 rounded-full px-2.5 py-1"
                            title={new Date(m.at).toLocaleString()}
                          >
                            {m.body}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`${m.at}-${idx}`}
                        className={`flex flex-col ${
                          m.from === "customer" ? "items-end" : "items-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                            m.from === "customer"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {linkifyMessage(m.body)}
                        </div>
                        <p
                          className="text-[10px] text-muted-foreground mt-0.5 px-1"
                          title={new Date(m.at).toLocaleString()}
                        >
                          {formatRelativeTime(m.at, nowTick)}
                        </p>
                      </div>
                    );
                  })
                )}
                {showAdminTyping && (
                  <div
                    className="flex items-start"
                    aria-live="polite"
                    aria-label="Support is typing"
                  >
                    <div className="bg-muted text-foreground rounded-2xl px-3 py-2 flex items-center gap-1">
                      <span className="sr-only">Support is typing</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce" />
                    </div>
                  </div>
                )}
              </div>
              {isClosed ? (
                <div className="border-t border-border/60 px-4 py-3 space-y-2 bg-muted/20">
                  <p className="text-xs text-muted-foreground text-center">
                    This conversation has been closed by support.
                  </p>
                  <Button
                    onClick={endConversation}
                    className="w-full"
                    variant="default"
                    size="sm"
                  >
                    Start a new conversation
                  </Button>
                </div>
              ) : (
                <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (canSend) void sendMessage();
                        }
                      }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                      className="resize-none min-h-[40px] max-h-[120px] text-sm"
                      maxLength={MSG_MAX}
                    />
                    <Button
                      size="icon"
                      onClick={() => void sendMessage()}
                      disabled={!canSend}
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <button
                      type="button"
                      onClick={endConversation}
                      className="text-[10px] text-muted-foreground hover:text-destructive hover:underline"
                      title="End this conversation and start a fresh one"
                    >
                      End conversation
                    </button>
                    {draft.length > MSG_MAX - 200 && (
                      <span
                        className={`text-[10px] tabular-nums ${
                          draft.length >= MSG_MAX
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {draft.length} / {MSG_MAX}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition"
          aria-label="Open chat"
        >
          <MessageSquare className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
