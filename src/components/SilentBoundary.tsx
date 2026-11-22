import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "@/lib/observability";

// A render-only error boundary for purely *decorative* children — ambient
// backdrops, particle scenes, motion wrappers — where the worst outcome
// of an error must never be a broken page. If the child throws (e.g. its
// dynamically-imported chunk failed to load after a deploy, or WebGL
// init errored on a quirky browser), we render `null` and the rest of
// the page continues to work normally.
//
// Distinct from `AdminErrorBoundary` (which surfaces a visible "this
// section crashed" panel) — this one is meant for things the visitor
// would not notice are missing.

interface SilentBoundaryProps {
  children: ReactNode;
  /** Identifier for telemetry (e.g. "landing-backdrop-3d"). */
  label: string;
}

interface SilentBoundaryState {
  failed: boolean;
}

export class SilentBoundary extends Component<
  SilentBoundaryProps,
  SilentBoundaryState
> {
  state: SilentBoundaryState = { failed: false };

  static getDerivedStateFromError(): SilentBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void captureException(error, {
      source: "silent-boundary",
      label: this.props.label,
      componentStack: info.componentStack ?? null,
    });
    if (typeof console !== "undefined") {
      console.warn(
        `[silent-boundary:${this.props.label}] swallowed render error:`,
        error,
      );
    }
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default SilentBoundary;
