---
name: runed
description: Runed 0.37 — Svelte 5 utilities for reactive state, elements, sensors and URL search params. Use when writing or reviewing code that imports runed or runed/kit, reaching for a reactive utility (debounce, persisted state, element size, click-outside, async resource), or deciding between a Runed utility and a plain rune.
version: 1.0.0
scope: integration
distribution: author-only
---

# Runed

Runed wraps browser APIs and reactive patterns as Svelte 5 utilities. Thirty-four of them, one calling convention: **getter in, `.current` out**.

It is **pre-1.0** — `0.37.1` is npm `latest`, published 20 December 2025, and minor bumps carry breaking changes without a major. `0.35.0` deleted the `Interval` class; `0.33.0` changed what `validateSearchParams` returns. Read the changelog before moving a minor, and check the installed version before trusting any signature.

Two structural facts drive most of the surprises below. Runed's `dist` ships **33 uncompiled `.svelte.js` files containing raw `$state` / `$effect` / `$derived`** — the consumer's toolchain compiles them, so anything outside the Svelte plugin's reach cannot import Runed at all. And two-thirds of the roster calls `$effect` internally, so it inherits Svelte's **effect context** rule.

Everything here was verified against **runed 0.37.1** on Svelte 5.56.9 / Vite 8 by SSR-rendering and client-running every exported utility, not read off the docs.

## Where to look

| File | Read it for |
|---|---|
| [lifecycle.md](references/lifecycle.md) | **effect context**, the per-utility table of what needs one, SSR facts, cleanup, testing and toolchain |
| [reactivity.md](references/reactivity.md) | the getter convention and `extract`, `watch` / `watchOnce`, `resource` |
| [state.md](references/state.md) | `Context`, `PersistedState`, `Debounced` / `Throttled`, `Previous`, `StateHistory`, `FiniteStateMachine`, intervals |
| [elements.md](references/elements.md) | the element and sensor roster — rects, sizes, observers, click-outside, keys, idle, geolocation, frames |
| [sveltekit.md](references/sveltekit.md) | `runed/kit`: `useSearchParams`, `validateSearchParams`, schema choice, load functions |
| [troubleshooting.md](references/troubleshooting.md) | symptom-first: `effect_orphan`, `$state is not defined`, a value that never updates, a URL that never updates |

## Working rules

**Getter in, `.current` out.** Reactive input crosses into a utility as a function — `new Previous(() => count)`, never `new Previous(count)` — because a bare value is read once and frozen at construction. Results come back as **getters**, so read `.current` at the point of use. `const { current } = size` and `const w = rect.width` both snapshot a number and never update again; keep the instance and read through it, or wrap in `$derived`.

**Assume a utility needs an effect context until you check.** Twenty-two of the thirty-four throw `effect_orphan` unless they are called during component initialisation or inside `$effect.root` — including `watch`, `resource`, `onCleanup`, `useEventListener`, `Debounced` and every observer. Constructing one lazily in an event handler, a `setTimeout`, or after an `await` is the single most common way to break Runed. [lifecycle.md](references/lifecycle.md) has the full table and the `$effect.root` escape hatch.

**Skip the `browser` guards — Runed is SSR-safe.** All thirty-four utilities were rendered through `svelte/server` and none threw. `if (browser)`, `typeof window !== "undefined"` and dynamic `import()` around a Runed import are dead code. The catch is asymmetry: effects are inert on the server, so `effect_orphan` never fires there and a misplaced call passes SSR and throws in the browser.

**Reach for a rune first.** `$derived` covers "value computed from other values" and `$effect` covers "run this when things change" — most of what people install Runed for. A utility earns its place when it wraps a browser API (`ScrollState`, `useGeolocation`), adds timing (`Debounced`, `resource`), or holds state a rune has no shape for (`StateHistory`, `FiniteStateMachine`). Wrapping a one-line `$derived` in a Runed class buys nothing and costs an effect context.

**`watch` when the dependencies must be explicit.** `$effect` tracks whatever it happens to read, which makes a re-run triggered by an incidental read hard to see. `watch(() => id, cb)` pins the trigger to exactly one source and hands the callback `(value, previousValue)`. Its option is `lazy` — `false` by default, so it fires once on setup like `$effect`.

**`useSearchParams` lives in `runed/kit`, and only inside SvelteKit.** It imports `$app/state`, `$app/navigation` and `$app/environment`, so it resolves only where the SvelteKit Vite plugin supplies those virtual modules. `@sveltejs/kit` and `zod` are *optional* peer dependencies; `svelte ^5.7.0` is the one hard peer.

**For anything beyond these files, read the installed package.** Runed ships full `.d.ts` files with doc comments next to unminified source under `node_modules/runed/dist/utilities/<name>/`, and that copy matches the version you are actually running. Upstream ships **no agent documentation and no `llms.txt`** — `runed.dev/docs` and the docs markdown in `svecosystem/runed` under `sites/docs/src/content/` are the prose, and they describe `main`, which can be ahead of `latest`.

## Corrections to common assumptions

Ordered by how often each one produces broken code:

- **A bare value passed where a getter belongs compiles fine and never updates.** `new Debounced(search, 500)` type-errors because the source is typed `Getter<T>`, but the many utilities typed `MaybeGetter<T>` accept the static value happily and silently freeze it. Pass `() => search`.
- **Destructuring any Runed result kills its reactivity.** `.current`, `.width`, `.isActive`, `.pending` are getters. This bites hardest on the function-shaped returns — `const { stop } = useResizeObserver(...)` is fine because `stop` is a method, while `const { isActive } = observer` is dead on arrival.
- **`Debounced` and `useDebounce` are different tools.** `Debounced` is a class wrapping *state* (`debounced.current` trails the source). `useDebounce` wraps a *callback* and returns a debounced function carrying `cancel`, `runScheduledNow` and `pending`. Same split for `Throttled` / `useThrottle`.
- **`Throttled` is not `Debounced` with a different timer.** `Debounced` has `pending`, `cancel()`, `setImmediately()` and `updateImmediately()`; `Throttled` has only `cancel()` and `setImmediately()`. There is no `throttled.pending`.
- **The `Interval` class was removed in `0.35.0`.** Use `useInterval(delay, { callback })`, whose delay is reactive. `new Interval(...)` is from training data, not from any current version.
- **`validateSearchParams` returns `{ searchParams, data }`, not a `URLSearchParams`.** Changed in `0.33.0`. Destructure the half you need.
- **`watch`'s option is `lazy`, not `immediate`.** Vue's `immediate: true` inverts to Runed's `lazy: false`, which is already the default — passing `immediate` does nothing at all.
- **`Previous.current` starts `undefined`,** typed `T | undefined`, and stays `undefined` through SSR. Render it defensively rather than assuming the first value is there.
- **`PersistedState` is deeply reactive only for plain objects and arrays.** Mutating a class instance's property persists nothing; reassign the whole value. Dates and other non-JSON types need a `serializer`.
- **`useSearchParams` is top-level reactive only.** `params.page = 2` updates the URL; `params.config.theme = "dark"` and `params.items.push(x)` do not. Reassign the whole value.
- **`Context` is a typed key, not a store.** It wraps Svelte's `getContext`/`setContext` for type safety and error messages — the value is not reactive unless you put `$state` inside it, and `set()` must run during component initialisation.
- **`activeElement` is an exported singleton, not a class.** Use `activeElement.current`; construct `new ActiveElement({ document })` only to scope to a shadow root.
- **`boolAttr` exists because `data-x={false}` still renders the attribute.** Svelte stringifies the boolean, so the selector `[data-x]` matches in both states; `boolAttr(v)` returns `""` or `undefined`.
- **Runed has no auto-imports and no Nuxt-style module.** It resembles VueUse in scope, not in setup — every utility is an explicit named import from `runed` (or `runed/kit`).
- **An FSM action that returns nothing cancels the transition.** Falling off the end of an action function is the documented way to reject an event, so a missing `return` reads as intent.

## Related skills

- **svelte-sveltekit** — the runes themselves, `$effect.root`, `{@attach}`, and the `$app/*` modules `runed/kit` depends on
- **typescript** — `MaybeGetter`/`Getter` inference, and why `noUncheckedIndexedAccess` interacts with `resource`'s optional `current`
- **bits-ui** — headless primitives that solve overlapping problems (focus, dismiss, scroll lock) with their own state
