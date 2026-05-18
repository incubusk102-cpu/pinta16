import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureException } from "@/lib/observability";

// Per-route error boundary for storefront pages. Mirrors
// `AdminErrorBoundary` but tuned for the customer-facing surface:
// friendlier copy, no internal error trace, and a primary "Go home"
// CTA so a shopper who hits a render-time crash on a deep page can
// always navigate back to the gallery. Without this boundary, any
// uncaught render error on a storefront route bubbles to the
// TanStack `defaultErrorComponent`, which presents the full
// "Something went wrong" screen and replaces the entire navigation
// shell.
//
// Usage:
//   <StorefrontErrorBoundary surface="product-page">
//     <ProductDetails ... />
//   </StorefrontErrorBoundary>
//
// `surface` is used purely for telemetry tagging — keep it short and
// route-specific (e.g. "product-page", "collection", "account",
// "track-order"). When `surface` changes between renders the
// boundary resets itself so the new surface gets a clean slate.

interface StorefrontErrorBoundaryProps {
  surface: string;
  children: ReactNode;
}

interface StorefrontErrorBoundaryState {
  error: Error | null;
}

export class StorefrontErrorBoundary extends Component<
  StorefrontErrorBoundaryProps,
  StorefrontErrorBoundaryState
> {
  state: StorefrontErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: Error,
  ): StorefrontErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: StorefrontErrorBoundaryProps) {
    if (prevProps.surface !== this.props.surface && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void captureException(error, {
      source: "storefront-error-boundary",
      surface: this.props.surface,
      componentStack: info.componentStack ?? null,
    });
    if (typeof console !== "undefined") {
      console.error(
        `[storefront:${this.props.surface}] surface crashed:`,
        error,
        info,
      );
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section
        role="alert"
        aria-live="assertive"
        className="mx-auto max-w-xl px-4 sm:px-6 py-16 sm:py-24 text-center"
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border border-border/60 mb-5">
          <AlertTriangle
            className="w-5 h-5 text-foreground/80"
            aria-hidden="true"
          />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl text-foreground mb-3">
          This page didn&apos;t quite load
        </h1>
        <p className="font-body text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Something went wrong while showing this page. Your cart and
          account are safe — try refreshing or head back to the home
          page and we&apos;ll get you to the right spot.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" onClick={this.reset}>
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild type="button">
            <Link to="/">
              <Home className="w-4 h-4 mr-2" aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </div>
      </section>
    );
  }
}

export default StorefrontErrorBoundary;
