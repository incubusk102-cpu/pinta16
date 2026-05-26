// Shared setup for component tests under `tests/unit/contexts/` (and
// any future React-component tests). Toggles the act() global flag so
// React 19 stops printing "current testing environment is not
// configured to support act(...)" on every render in vitest.
//
// Loaded automatically per-file via the `vitest.config.ts` setupFiles
// entry. Pure side-effect import — does not export anything.

import type { ReactNode } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Re-exported so per-file imports don't trip the eslint
// "no-unused-vars" rule when the test bundle is otherwise empty.
export type _UnusedSetupSymbol = ReactNode;
