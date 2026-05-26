// Barrel re-export for the query repository.
//
// Every public symbol that used to live in `functions/api/_lib/d1.js`
// is re-exported here from its new domain-specific module. New code
// SHOULD import directly from the domain module
// (`./queries/orders/index.js`, `./queries/coupons/index.js`, …) for
// clearer dependency graphs in code review, but this barrel keeps the
// pre-refactor `import { ... } from "./d1.js"` call sites working — and
// `_lib/d1.js` itself just re-exports from this file.
//
// See `queries/README.md` for the layout and conventions.

export {
  ALLOWED_DEVICES,
  d1All,
  d1Batch,
  d1First,
  d1Run,
  getD1,
  isD1Available,
  sinceFromDays,
} from "./core.js";

export { mirrorOrderToD1, upsertCustomerFromOrder } from "./orders/index.js";

export { syncWishlistToD1 } from "./wishlists/index.js";

export {
  couponAnalytics,
  customerCouponRedemptionCount,
  recordCouponRedemption,
} from "./coupons/index.js";

export {
  listReturnRequests,
  mirrorReturnRequestToD1,
  returnAnalytics,
} from "./returns/index.js";

export { mirrorProductToD1 } from "./products/index.js";

export {
  PAGE_EVENT_KINDS,
  pageEventDaily,
  pageEventDeviceMix,
  pageEventFunnel,
  recordPageEvent,
  topPagePaths,
  topReferrerHosts,
} from "./page-events/index.js";

export {
  recentSearchEvents,
  recordSearchEvent,
  topSearchQueries,
  zeroResultSearchQueries,
} from "./search-events/index.js";

export {
  HERO_SLIDE_EVENT_TYPES,
  heroSlideStats,
  recordHeroSlideEvent,
} from "./hero-slides/index.js";

export {
  NOTIFICATION_CHANNELS,
  notificationLogByKind,
  notificationLogDaily,
  recentNotificationLog,
  recordNotification,
} from "./notifications/index.js";

export {
  recentStockEvents,
  recordStockEvent,
  STOCK_SOURCES,
  STOCK_STATES,
  stockEventsByProduct,
  stockEventsDaily,
} from "./stock-events/index.js";

export {
  NEWUSER_MODAL_EVENT_TYPES,
  NEWUSER_MODAL_VARIANT_RE,
  newUserModalStats,
  recordNewUserModalEvent,
} from "./newuser-modal/index.js";
