import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/signup")({
  component: SignupRedirect,
  head: () => ({
    meta: [{ title: "Sign up — Pintaterra" }],
  }),
});

function SignupRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/login", replace: true });
  }, [navigate]);
  return null;
}
