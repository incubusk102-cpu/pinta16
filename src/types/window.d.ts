// Ambient typings that augment the global `Window` interface. Picked
// up by TypeScript automatically because `tsconfig.json` includes
// every `src/**/*.ts` file.
//
// Keep this file narrowly scoped to vendor-prefixed or runtime-only
// extensions that don't live in `lib.dom`. Anything app-specific
// should stay in its own module under `src/`.

export {};

declare global {
  interface Window {
    // Older WebKit-based browsers (notably Safari < 14 on iOS, plus
    // legacy Chrome on Android) only expose the prefixed
    // `webkitAudioContext` constructor. `ChatWidget` falls back to
    // it for the notification "ding" so the chime still plays on
    // those devices without going through an `as unknown as` cast.
    webkitAudioContext?: typeof AudioContext;
  }
}
