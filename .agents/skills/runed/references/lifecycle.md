# Lifecycle, SSR and toolchain

Where a Runed utility may be called, what it does on the server, and what the build has to do to it. Read this before debugging anything that throws at construction.

## The effect context

Svelte's `$effect` needs an **owner** — a component being initialised, or an `$effect.root`. Without one it throws `effect_orphan` (`https://svelte.dev/e/effect_orphan`). Runed inherits that rule wholesale, because most utilities open an `$effect` in their constructor.

Two internal styles decide which side of the line a utility falls on:

- **`$effect`-based** — the effect opens at construction, so the call site must already have an owner. This is the majority.
- **`createSubscriber`-based** — `svelte/reactivity`'s lazy subscription. Construction registers nothing; the listener attaches the first time the value is read *from inside a reactive context* and detaches when that context is destroyed. Only `activeElement`, `ElementSize`, `PersistedState` and `PressedKeys` work this way.

### Utilities that require an owner

Calling any of these outside component initialisation or `$effect.root` throws `effect_orphan`:

`AnimationFrames` · `Debounced` · `ElementRect` · `IsDocumentVisible` · `IsIdle` · `IsInViewport` · `IsMounted` · `onCleanup` · `onClickOutside` · `resource` · `ScrollState` · `StateHistory` · `TextareaAutosize` · `Throttled` · `useEventListener` · `useGeolocation` · `useInterval` · `useIntersectionObserver` · `useMutationObserver` · `useResizeObserver` · `watch` (with `watch.pre`) · `watchOnce` (with `watchOnce.pre`)

Several are indirect: `Debounced`, `Throttled`, `StateHistory` and `resource` compose `watch`, and `ScrollState` composes `useEventListener`, so they inherit the requirement without naming `$effect` themselves.

`useSearchParams` from `runed/kit` belongs on this list too — its source opens an `$effect` and composes `IsMounted`. That one is read from the source rather than measured, since it only resolves inside a SvelteKit app.

### Utilities safe to call anywhere

`activeElement` · `ActiveElement` · `boolAttr` · `Context` · `ElementSize` · `extract` · `FiniteStateMachine` · `IsFocusWithin` · `PersistedState` · `PressedKeys` · `Previous` · `useDebounce` · `useThrottle`

"Safe to call" means construction does not throw — it does not promise a live subscription. The four `createSubscriber` utilities only listen while something reads them from a reactive context, so reading `pressedKeys.all` once inside a plain function gives you a snapshot with no listener behind it. Read them in a template, a `$derived`, or a `$effect` to get updates.

`extract` and `boolAttr` are plain functions with no reactivity of their own, and `Context` only wraps a context key. The rest hold `$state`/`$derived`, which needs no owner.

### Where "during initialisation" ends

The owner is the *synchronous* body of the component's `<script>`, or the synchronous body of an `$effect.root` callback. It ends at the first `await`. These all throw:

```svelte
<script>
  // ✅ synchronous top level — has an owner
  const debounced = new Debounced(() => search, 300);

  // ❌ event handler — no owner
  function onclick() {
    watch(() => count, () => {});
  }

  // ❌ after an await — the owner is gone
  const data = await load();
  const r = resource(() => id, fetcher);

  // ❌ inside setTimeout / promise callback
  setTimeout(() => new IsMounted(), 0);
</script>
```

To own utilities outside a component — in a `.svelte.ts` module, a class, or a store — open a root and keep its disposer:

```ts
// counter.svelte.ts
export function createSearch() {
  let query = $state("");
  const dispose = $effect.root(() => {
    watch(() => query, (q) => console.log(q));
  });
  return {
    get query() { return query; },
    set query(v) { query = v; },
    dispose,
  };
}
```

An `$effect.root` that is never disposed leaks its effects and listeners for the process lifetime. Call the returned disposer, or create the class inside a component so its own root tears down with it.

A class instantiated *by* a component during initialisation inherits that component's owner, which is why the `ClickLogger`-style pattern works with no root of its own:

```ts
// click-logger.svelte.ts
export class ClickLogger {
  #clicks = $state(0);
  constructor() {
    useEventListener(() => document.body, "click", () => this.#clicks++);
  }
  get clicks() { return this.#clicks; }
}
```

```svelte
<script>
  const logger = new ClickLogger(); // ✅ owner comes from this component
</script>
```

## Cleanup

Everything that attaches a listener, observer, timer or frame loop tears down with its owner — the component unmounting, or the `$effect.root` disposer running. There is nothing to unregister by hand.

Utilities that also expose manual control return it as methods, not as a teardown function you are obliged to call: `stop()`/`start()` on `onClickOutside`, `stop()`/`pause()`/`resume()` on the observers, `pause()`/`resume()` on `useInterval` and `useGeolocation`, `cancel()` on the debounce and throttle family.

`onCleanup(fn)` is shorthand for `$effect(() => () => fn())` and is the Svelte 5 replacement for a bare `onDestroy`. Like `$effect`, it needs an owner.

## SSR

**Every one of the thirty-four utilities constructs without throwing during server rendering.** Verified by rendering all of them through `svelte/server`. No `browser` guard, no `typeof window` check and no dynamic import is needed around a Runed import — that code is dead.

What the server actually produces:

| Utility | Server value |
|---|---|
| `activeElement.current` | `null` |
| `Previous.current` | `undefined` |
| `Debounced.current` / `Throttled.current` | the source's current value, undelayed |
| `IsMounted.current` | `false` |
| `IsDocumentVisible.current` | `false` |
| `IsIdle.current` | `false` |
| `PressedKeys.all` | `[]` |
| `ElementSize` / `ElementRect` dimensions | `0` |
| `IsInViewport.current` / `IsFocusWithin.current` | `false` |
| `resource.loading` | `true` |
| `PersistedState.current` | the initial value — storage is never read |
| `FiniteStateMachine.current` | the initial state |

The dangerous part is the asymmetry, not the values. **Effects do not run on the server, so `effect_orphan` never fires there.** A `watch` in an event handler renders perfectly, passes any SSR smoke test, and throws the moment the browser hydrates. Trust the client for that class of bug.

`PersistedState` returns its initial value on the server and reads storage on the client, so a value differing from the seed produces a hydration flash. Gate the render on `IsMounted` if the flash matters.

## Toolchain

Runed's `dist` is **not pre-compiled**. Thirty-three `.svelte.js` files ship with raw `$state`, `$derived` and `$effect` in them, and `package.json` points the `svelte` export condition at that source. The consumer's Svelte plugin compiles them.

Consequences:

- **Vite plus `@sveltejs/vite-plugin-svelte` needs no configuration.** The plugin reads the `svelte` field and marks the package `noExternal` itself; an explicit `ssr.noExternal: ["runed"]` is redundant. Verified both ways.
- **Plain Node cannot import Runed.** `node -e 'import("runed")'` fails with `ReferenceError: $state is not defined`. Any script, seed task, or test runner reaching the package without the Svelte plugin hits this.
- **Test runners need the Svelte plugin and the `svelte` resolve condition.** Vitest configured through the SvelteKit or svelte Vite config already has both. A bare `node`/`tsx` runner does not.
- `svelte ^5.7.0` is the only required peer. `@sveltejs/kit ^2.21.0` and `zod ^4.1.0` are declared optional — needed for `runed/kit` and for Zod schemas respectively. Runtime dependencies are `dequal`, `esm-env` and `lz-string`.

`node_modules/runed/dist/utilities/resource/msw-handlers.js` imports `msw`, which is not a dependency — a test fixture published by accident. It is unreachable from any barrel, so `tsc` passes even with `skipLibCheck: false`; only a deep import into that file would break.
