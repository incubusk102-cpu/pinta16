// D1 (SQLite) helpers for the hybrid KV+D1 architecture.
//
// This file used to hold every domain helper inline (~1,500 lines).
// As part of the "Database Query Organization" roadmap in
// `improvement.md` (items B1 / B4 / B7), the helpers were extracted
// into `functions/api/_lib/queries/<domain>/index.js` modules.
//
// This file is now a thin barrel re-export so every existing
// `import { ... } from "./d1.js"` call site keeps working without
// modification. New code SHOULD import the domain module directly:
//
//   import { syncWishlistToD1 } from "./queries/wishlists/index.js";
//
// See `queries/README.md` for the layout and conventions, and
// `improvement.md` for the remaining follow-ups (extracting SQL into
// `.sql` files, type definitions, schema generation, analytics
// consolidation, …).

export * from "./queries/index.js";
