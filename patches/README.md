# @vitest/mocker 3.2.6

The browser transform wraps SvelteKit SSR hook imports and nested dynamic imports with a browser-only `wrapDynamicImport` helper.
The helper is absent on the server, so those imports fail with a TypeError.
`vitest` and `@vitest/browser` stay pinned to 3.2.6; `bun.lock` resolves `@vitest/mocker` to 3.2.6.
Bun matches patches by exact package version. Update the dependencies and patch together until upstream includes the fix.

1. `dist/node.js` — `dynamicImportPlugin` transforms SSR imports as browser imports.
   Fix: accept the transform options and return early when `transformOptions?.ssr` is true.
   Browser imports still receive the transform, so browser dynamic-import mocking stays unchanged.

The regression tests for this patch live in tia-trading-strategies.

`package.json` registers `patches/@vitest%2Fmocker@3.2.6.patch` under `patchedDependencies`.
Bun applies the patch during installation; no separate patch script is required.

Remove this patch and its registration once the installed upstream version includes the equivalent SSR guard.

# Bits UI 2.19.2

Two lifecycle defects produce `derived_inert` warnings after component removal.
The dependency stays at this exact version because Bun matches patches by version.
Update the dependency and patch together until upstream fixes both defects.

1. `dist/bits/pin-input/pin-input.svelte.js` — the `watch` that schedules
   `syncTimeouts` never returned a cleanup. On unmount the three timers
   still fired, read `opts.inputRef.current`, and touched state behind a
   destroyed effect. Fix: capture the owning window before scheduling,
   return a cleanup that clears all three timeout IDs.

2. `dist/internal/animations-complete.js` — `#executeCallback` scheduled
   `fn` with `afterTick` but did not check `#runId` inside the deferred
   `execute`. A newer `run()` or a destroy landing between scheduling and
   the tick still executed the stale callback, which read
   `PresenceManager` state behind a destroyed effect. Fix: capture the
   run ID before scheduling, bail inside `execute` if it no longer
   matches.

The InputOTP regression test in tia-trading-strategies covers timer cleanup.
Three attempts did not produce a deterministic public-component test for the animation callback's microtask timing.

Remove this patch once the installed Bits UI release includes both fixes.
