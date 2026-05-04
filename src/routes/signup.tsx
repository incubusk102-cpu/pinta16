import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

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
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}
