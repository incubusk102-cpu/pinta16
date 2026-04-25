import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Pintaterra" },
      {
        name: "description",
        content: "Sign in to your Pintaterra account.",
      },
    ],
  }),
});

function LoginPage() {
  const { login, loading } = useUserAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    try {
      await login({ email: email.trim(), password });
      toast.success("Welcome back");
      void navigate({ to: "/account" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <Toaster richColors position="top-right" />
      <div className="w-full max-w-md bg-card/40 border border-border/60 rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back to Pintaterra.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="text-center text-xs text-muted-foreground space-y-2">
          <p>
            New here?{" "}
            <Link to="/signup" className="text-foreground hover:underline">
              Create an account
            </Link>
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}
