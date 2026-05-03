import { useCallback, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useUserAuth } from "@/contexts/UserAuthContext";

interface NotifyMeButtonProps {
  productId: string;
}

export function NotifyMeButton({ productId }: NotifyMeButtonProps) {
  const { user } = useUserAuth();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [showInput, setShowInput] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/marketing-triggers/notify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, productId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSubmitted(true);
      toast.success("We\u2019ll email you when this is back in stock");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [email, productId]);

  if (submitted) {
    return (
      <div className="inline-flex items-center gap-2 px-6 py-3 border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 font-body text-xs tracking-[0.2em] uppercase rounded-sm">
        <Bell className="w-4 h-4" />
        Notification set
      </div>
    );
  }

  if (!showInput && user?.email) {
    return (
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={loading}
        className="inline-flex items-center gap-2 px-6 py-3 border border-primary/30 bg-primary/5 text-primary font-body text-xs tracking-[0.2em] uppercase rounded-sm hover:bg-primary/10 transition-colors disabled:opacity-60"
      >
        <Bell className="w-4 h-4" />
        {loading ? "Registering\u2026" : "Notify me when available"}
      </button>
    );
  }

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setShowInput(true)}
        className="inline-flex items-center gap-2 px-6 py-3 border border-primary/30 bg-primary/5 text-primary font-body text-xs tracking-[0.2em] uppercase rounded-sm hover:bg-primary/10 transition-colors"
      >
        <Bell className="w-4 h-4" />
        Notify me when available
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSubmit();
        }}
        className="px-3 py-2.5 border border-border rounded-sm text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 w-52"
      />
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-foreground text-background font-body text-xs tracking-[0.15em] uppercase rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-60"
      >
        <Bell className="w-3.5 h-3.5" />
        {loading ? "…" : "Notify me"}
      </button>
    </div>
  );
}
