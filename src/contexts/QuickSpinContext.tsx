import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

// Lazy 3D modal — the three.js / r3f / drei runtime is already
// chunk-split for the product page's "View in 3D" button, so opening
// quick-spin on a gallery card pulls the same chunk.
const PaintingViewer3D = lazy(() => import("@/components/PaintingViewer3D"));

interface QuickSpinTarget {
  imageUrl: string;
  title: string;
}

interface QuickSpinContextValue {
  open: (target: QuickSpinTarget) => void;
  close: () => void;
}

const QuickSpinContext = createContext<QuickSpinContextValue | null>(null);

interface QuickSpinProviderProps {
  children: ReactNode;
}

/**
 * Mounts a single `PaintingViewer3D` modal at the root of the tree.
 * Any gallery card (or other surface) can ask the provider to spin a
 * particular painting via `useQuickSpin().open({ imageUrl, title })`
 * — the heavy 3D scene is shared, so we don't pay for a new Canvas
 * per card.
 */
export function QuickSpinProvider({ children }: QuickSpinProviderProps) {
  const [target, setTarget] = useState<QuickSpinTarget | null>(null);

  const open = useCallback((next: QuickSpinTarget) => {
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <QuickSpinContext.Provider value={value}>
      {children}
      {target && (
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              className="fixed inset-0 z-[1100] bg-background/95 backdrop-blur-xl flex items-center justify-center"
            >
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <PaintingViewer3D
            imageUrl={target.imageUrl}
            title={target.title}
            onClose={close}
          />
        </Suspense>
      )}
    </QuickSpinContext.Provider>
  );
}

export function useQuickSpin(): QuickSpinContextValue {
  const ctx = useContext(QuickSpinContext);
  if (!ctx) {
    throw new Error("useQuickSpin must be used within a QuickSpinProvider");
  }
  return ctx;
}
