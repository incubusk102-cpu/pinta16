import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouterState } from "@tanstack/react-router";

interface ChatMessage {
  at: string;
  from: "customer" | "admin";
  body: string;
}

interface ChatThread {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = "pintaterra_chat_thread_v1";
const POLL_INTERVAL_MS = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

export default function ChatWidget() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAdminRoute = pathname.startsWith("/admin");

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
  const lastSeenIndexRef = useRef<number>(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHandle(readPersistedHandle());
  }, []);

  // Load existing thread when handle is present
  useEffect(() => {
    if (!handle) {
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
  }, [handle]);

  // Poll for new messages while widget is mounted
  useEffect(() => {
    if (!handle) return;
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
  }, [handle]);

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

  const messages = thread?.messages ?? [];
  const canSend = useMemo(
    () => draft.trim().length > 0 && !busy,
    [draft, busy],
  );

  if (isAdminRoute) return null;

  const startThread = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedMessage = draft.trim();
    if (!trimmedName) {
      toast.error("Please enter your name");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start chat");
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

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div className="w-[340px] sm:w-[380px] h-[480px] bg-card border border-border/60 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/60">
            <div>
              <p className="text-sm font-medium">Chat with us</p>
              <p className="text-[10px] text-muted-foreground">
                We usually reply within a few hours.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!handle ? (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Tell us your name and email so we can get back to you.
              </p>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1 flex-1 flex flex-col">
                <label className="text-[11px] text-muted-foreground">
                  Message
                </label>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What can we help with?"
                  className="flex-1 min-h-[100px] resize-none"
                  maxLength={2000}
                />
              </div>
              <Button onClick={startThread} disabled={busy}>
                {busy ? "Starting…" : "Start chat"}
              </Button>
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
              >
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center mt-6">
                    Loading…
                  </p>
                ) : (
                  messages.map((m, idx) => (
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
                        {m.body}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                        {formatTime(m.at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-border/60 px-3 py-2 flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canSend) void sendMessage();
                    }
                  }}
                  placeholder="Type a message…"
                  className="resize-none min-h-[40px] max-h-[120px] text-sm"
                  maxLength={2000}
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
