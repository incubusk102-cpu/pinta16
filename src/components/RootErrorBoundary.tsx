import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "@/lib/observability";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary that wraps the entire provider chain in
 * `__root.tsx`. Catches render-time crashes that would otherwise
 * white-screen the app before any route-level boundary can act.
 *
 * Renders a minimal branded fallback with a "Reload" button and
 * reports the error to Sentry via `captureException`.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void captureException(error, {
      source: "root-error-boundary",
      componentStack: info.componentStack ?? null,
    });
    if (typeof console !== "undefined") {
      console.error("[root] uncaught render error:", error, info);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Canvas Hub — Something went wrong</title>
        </head>
        <body
          style={{
            margin: 0,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            backgroundColor: "#f5f3ee",
            color: "#1c1c1c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#666",
                maxWidth: "28rem",
                margin: "0 auto 1.5rem",
                lineHeight: 1.6,
              }}
            >
              An unexpected error occurred. Your cart and account are safe
              &mdash; try reloading the page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "0.75rem 2rem",
                fontSize: "0.75rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                border: "1px solid #1c1c1c",
                borderRadius: "2px",
                background: "#1c1c1c",
                color: "#f5f3ee",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </body>
      </html>
    );
  }
}

export default RootErrorBoundary;
