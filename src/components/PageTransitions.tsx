import { type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";

// Cinematic page transitions. On every storefront route change the
// new page fades + rises a few pixels into place. We deliberately
// skip the "exit" animation: TanStack Router swaps `<Outlet />`'s
// content the instant the route changes, so trying to animate the
// outgoing tree would just paint the new content fading away on top
// of itself. The enter-only fade is the safe pattern that still
// reads as a transition.
//
// Admin pages are excluded — the admin app is a data-dense tool and
// a quarter-second fade between tabs would just slow down the
// operator. Reduced-motion visitors get an instant swap with no
// animation at all.

interface PageTransitionsProps {
  children: ReactNode;
}

const PageTransitions = ({ children }: PageTransitionsProps) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const reduce = useReducedMotion();

  if (reduce || pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransitions;
