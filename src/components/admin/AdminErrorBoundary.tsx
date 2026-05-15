import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureException } from "@/lib/observability";

// Per-section error boundary for the admin shell. If one of the 30+
// admin sections throws a render-time error (e.g. an upstream API
// returned an unexpected shape and a `.map()` blew up), we want the
// rest of the admin — the sidebar, the other sections, the auth
// state — to keep working. Before this boundary existed, any crash
// in one section took down the whole `/admin` route via TanStack
// Router's `defaultErrorComponent`.
//
// Usage:
//   <AdminErrorBoundary section="orders">
//     <OrdersSection />
//   </AdminErrorBoundary>
//
// The `section` prop is used as a `key`-equivalent: when it changes
// (i.e. the operator navigated to a different section) the boundary
// resets itself so the new section gets a clean slate instead of
// inheriting the previous section's error state.

interface AdminErrorBoundaryProps {
  section: string;
  children: ReactNode;
}

interface AdminErrorBoundaryState {
  error: Error | null;
}

export class AdminErrorBoundary extends Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  state: AdminErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AdminErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: AdminErrorBoundaryProps) {
    // Clear the error when the operator navigates to a different
    // section — the new section deserves its own chance to render.
    if (prevProps.section !== this.props.section && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void captureException(error, {
      source: "admin-section-error-boundary",
      section: this.props.section,
      componentStack: info.componentStack ?? null,
    });
    if (typeof console !== "undefined") {
      console.error(
        `[admin:${this.props.section}] section crashed:`,
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
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              This section couldn&apos;t load
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The <span className="font-medium">{this.props.section}</span>{" "}
              section crashed while rendering. The rest of the admin is still
              available — pick another section from the sidebar, or try
              reloading this one.
            </p>
            {error.message && (
              <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-background/60 p-2 text-left font-mono text-xs text-destructive whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={this.reset}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try again
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.location.reload();
                  }
                }}
              >
                Reload page
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
