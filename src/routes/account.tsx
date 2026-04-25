import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft, LogOut, Mail, UserCircle } from "lucide-react";

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "My account — Pintaterra" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

function AccountPage() {
  const { user, token, logout } = useUserAuth();
  const navigate = useNavigate();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!token && !loggingOutRef.current) {
      void navigate({ to: "/login" });
    }
  }, [token, navigate]);

  if (!user || !token) return null;

  const handleLogout = () => {
    loggingOutRef.current = true;
    logout();
    toast.success("Signed out");
    void navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b border-border/50 bg-card/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to site
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-3 h-3 mr-1" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div>
          <h1 className="font-display text-3xl">My account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back{user.name ? `, ${user.name}` : ""}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-card/40 border border-border/60 rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
              <UserCircle className="w-4 h-4" /> Profile
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Name:</span>{" "}
                {user.name || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                {user.email}
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Joined {formatDate(user.createdAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                Last seen {formatDate(user.lastSeenAt)}
              </p>
            </div>
          </div>
          <div className="bg-card/40 border border-border/60 rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
              <Mail className="w-4 h-4" /> Inactivity
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Pintaterra removes accounts that have been inactive for{" "}
              <strong className="text-foreground">30 days</strong> and emails
              you when this happens. Just sign in any time to keep yours active.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
