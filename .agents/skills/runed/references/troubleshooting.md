# Troubleshooting

Symptom first. Most Runed bugs are one of four things: no effect owner, a snapshot where a getter belonged, a bare value where a getter belonged, or a toolchain that never compiled the package.

## `effect_orphan` at runtime

> `Error: https://svelte.dev/e/effect_orphan`

A utility that opens an `$effect` was constructed with no owner. The owner is the synchronous body of a component's `<script>`, or of an `$effect.root` callback — and it ends at the first `await`.

Check the call site against these, all of which throw:

- inside an event handler, `setTimeout`, or a promise callback
- after an `await` in the component script
- at the top level of a `.svelte.ts` module with no `$effect.root`
- in a plain `.ts` file (no rune compilation at all — see below)

Fix by moving the call into component initialisation, or by wrapping it in `$effect.root` and disposing the root when done. [lifecycle.md](lifecycle.md) lists which utilities need an owner and shows both patterns.

Note the asymmetry: **this never fires during SSR**, because effects do not run on the server. An SSR smoke test passes and hydration throws.

## `$state is not defined`

> `ReferenceError: $state is not defined`

Runed shipped uncompiled runes and nothing compiled them. The package's `dist` contains 33 `.svelte.js` files with raw `$state`/`$effect`/`$derived`, and the Svelte plugin is what turns them into runtime calls.

Usual causes:

- a plain `node` or `tsx` script importing `runed`
- a test runner without the Svelte plugin, or without the `svelte` resolve condition
- a build pipeline that externalised the package before compiling it

Vite plus `@sveltejs/vite-plugin-svelte` handles this with no configuration — the plugin marks the package `noExternal` itself. Configure the test runner through the same Vite config rather than adding `ssr.noExternal` by hand.

## A value renders once and never updates

The reactive read got snapshotted. Every Runed output is a **getter**, so lifting one into a variable copies the value at that instant:

```ts
const w = size.width;                 // ❌ frozen number
const { current } = activeElement;    // ❌ frozen
const w2 = $derived(size.width);      // ✅
```

Reading in markup — `{size.width}` — is already reactive. Methods are safe to destructure; getters are not. When unsure, keep the instance and read through it at the point of use.

For the four `createSubscriber`-based utilities (`activeElement`, `ElementSize`, `PersistedState`, `PressedKeys`) there is a second version of this: they subscribe **only while read from a reactive context**. Reading `keys.all` once inside a plain function returns a snapshot and attaches no listener. Read them in a template, `$derived` or `$effect`.

## A utility ignores its input entirely

A bare value was passed where a getter belongs, so it was read once at construction.

```ts
new Previous(count)        // ❌ frozen at the construction-time value
new Previous(() => count)  // ✅
```

Sources typed `Getter<T>` (`Debounced`, `Throttled`, `Previous`, `resource`) reject this at compile time. Sources and options typed `MaybeGetter<T>` accept it silently — `StateHistory`'s value, every element reference, and options like `wait`, `timeout`, `delay` and `fpsLimit`. That silent group is where this bug actually lives.

Element references are the most common instance: the class is constructed before `bind:this` assigns anything, so `new ElementRect(el)` captures `undefined` permanently while `new ElementRect(() => el)` resolves later.

If you wrote the utility yourself, `extract(input, fallback)` must sit inside a `$derived` to track — bare `extract` resolves once.

## The URL never updates

`useSearchParams` is top-level reactive only. `params.config.theme = "dark"` and `params.items.push(x)` change nothing; reassign the whole value instead. See [sveltekit.md](sveltekit.md).

If the *server* disagrees with the client, check that `validateSearchParams` was given the same `compressedParamName` and `dateFormats` as `useSearchParams`.

## Cannot import `useSearchParams`

It lives in `runed/kit`, not `runed`, and resolves only inside SvelteKit — it imports `$app/state`, `$app/navigation` and `$app/environment`. `@sveltejs/kit` is an optional peer, so a missing install fails at build rather than at install.

## Hydration mismatch or a flash of the wrong value

`PersistedState` returns its initial value on the server and reads storage on the client, so any stored value differing from the seed flashes. Gate the render on `IsMounted` if that matters.

`Previous.current` is `undefined` during SSR and until the first change — render the empty case rather than assuming a value.

## A type error on an option that the docs describe

The published `.d.ts` is the authority; some doc comments are stale. `ElementSize`'s doc comment advertises an `initialSize` option that `ElementSizeOptions` does not declare — `ElementRect` has `initialRect`, `ElementSize` does not.

Check `node_modules/runed/dist/utilities/<name>/` for the real signature, and remember `runed.dev/docs` tracks `main`, which can be ahead of the published version.

## An API in the docs or training data does not exist

Runed is pre-1.0 and breaks in minors:

- **`new Interval(...)`** — removed in `0.35.0`; use `useInterval(delay, { callback })`.
- **`validateSearchParams` returning a bare `URLSearchParams`** — since `0.33.0` it returns `{ searchParams, data }`.
- **`throttled.pending` / `throttled.updateImmediately()`** — only `Debounced` has those.
- **`watch(..., { immediate: true })`** — the option is `lazy`, and `lazy: false` is already the default.
- **`IsInViewport.observer` and the `once` option** — added in `0.37.1`; absent before.
- **`PersistedState.connect()` / `.disconnect()`** — added in `0.37.0`.

Confirm against `node_modules/runed/package.json` and the changelog at `github.com/svecosystem/runed/blob/main/packages/runed/CHANGELOG.md`.

## An FSM event does nothing

An action that returns nothing cancels the transition — that is the documented way to reject an event, so a forgotten `return` looks exactly like a deliberate refusal. Check that every branch meant to transition returns a state, and add a `"*"` wildcard state if the event should be handled from anywhere.
