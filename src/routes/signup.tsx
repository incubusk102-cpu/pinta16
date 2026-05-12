import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSEO } from "@/hooks/useSEO";

export const Route = createFileRoute("/signup")({
  component: SignupRedirect,
  head: () => ({
    meta: [{ title: "Sign up — Canvas Hub" }],
  }),
});

// Sign-up has no dedicated page; it happens inline through Google. Send
// visitors to the homepage where the hamburger drawer surfaces the
// "Continue with Google" button.
function SignupRedirect() {
  useSEO({
    title: "Sign up — Canvas Hub",
    description:
      "Create a Canvas Hub account to save favourite paintings, track orders, and unlock member perks.",
    canonicalPath: "/signup",
    noindex: true,
  });
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}
