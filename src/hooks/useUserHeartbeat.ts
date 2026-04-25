import { useEffect } from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";

const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes while the tab is active

export function useUserHeartbeat() {
  const { token } = useUserAuth();

  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined") return;

    const ping = async () => {
      try {
        await fetch("/api/users?action=heartbeat", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* network blip — ignore, next tick will retry */
      }
    };

    void ping();
    const interval = window.setInterval(ping, INTERVAL_MS);
    const onFocus = () => void ping();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [token]);
}
