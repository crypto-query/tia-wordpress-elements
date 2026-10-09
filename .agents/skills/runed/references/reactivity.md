# Reactivity

The calling convention every utility shares, and the three utilities that exist to shape reactivity itself: `extract`, `watch` and `resource`.

## Getter in, `.current` out

Runed cannot receive live state as a plain argument — Svelte's reactivity is compile-time, and a value read at the call site is already a snapshot by the time the callee sees it. Every utility therefore takes reactive input as a **getter** and returns reactive output behind a **getter property**.

```ts
let count = $state(0);

const prev = new Previous(() => count);  // ✅ re-reads on every change
const bad = new Previous(count);         // ❌ frozen at 0 forever
```

Two input types appear in the signatures:

- **`Getter<T>`** — a function is mandatory. `Debounced`, `Throttled`, `StateHistory`, `Previous` and `resource` type their *source* this way, so passing a bare value is a type error you will see.
- **`MaybeGetter<T>`** — a function *or* a static value. Used for options like `wait`, `timeout`, `delay` and for element references. Here a bare value compiles cleanly and silently stops updating, which is where the mistake actually lands.

On the way out, `.current`, `.width`, `.pending`, `.isActive` and friends are getters on the instance. Reading one into a variable copies the value at that instant:

```ts
const size = new ElementSize(() => el);

const w = size.width;                 // ❌ a number, fixed forever
const { current } = activeElement;    // ❌ same
const w2 = $derived(size.width);      // ✅ tracks
```

In markup, `{size.width}` is already reactive — the template re-reads the getter. The mistake only appears when a value is lifted into a `const`, destructured, or handed to a function that will be called later.

Methods are safe to destructure, since they are bound functions rather than getters: `const { stop } = useResizeObserver(...)` works.

## extract

`extract(input, fallback?)` collapses `MaybeGetter<T>` down to `T`. It exists so utilities can accept either form without repeating `typeof x === "function" ? x() : x` at every use.

| Input | Result |
|---|---|
| a value | the value |
| `undefined` | the fallback |
| a function returning a value | the function's result |
| a function returning `undefined` | the fallback |

```ts
function useConfetti(intervalProp?: MaybeGetter<number | undefined>) {
  const interval = $derived(extract(intervalProp, 100));
  // ...
}
```

`extract` is a plain function with no reactivity of its own — **it resolves once, where you call it.** Wrapping it in `$derived` is what makes the resolved value track its source, and omitting that wrapper is the usual reason a "reactive option" stops responding. Signature: `extract<T>(input: MaybeGetter<T | undefined>, fallback: T): T`, or without a fallback, returning `T | undefined`.

Reach for it when writing your own utilities that accept reactive options. Application code rarely needs it.

## watch

`$effect` tracks whatever it happens to read, which is usually what you want and occasionally a trap — an incidental read of unrelated state re-runs the whole effect, and nothing at the call site says so. `watch` makes the dependency list explicit and hands the callback the previous value, which `$effect` cannot do.

```ts
let count = $state(0);

watch(() => count, (curr, prev) => {
  console.log(`count is ${curr}, was ${prev}`);
});
```

Multiple sources take an array of getters and give the callback arrays:

```ts
watch([() => age, () => name], ([age, name], [prevAge, prevName]) => { /* ... */ });
```

Deep watching is opt-in through the getter, not an option:

```ts
watch(() => user.age, cb);                   // one property
watch(() => $state.snapshot(user), cb);      // the whole object, deeply
```

Variants and options:

- **`lazy`** — `false` by default, so the callback fires once immediately, like `$effect`. Set `lazy: true` to wait for the first *change*. (Vue's `immediate: true` is this default, not an option to pass.)
- **`watch.pre`** — the same thing on `$effect.pre`, running before the DOM updates.
- **`watchOnce`** and **`watchOnce.pre`** — run the callback exactly once, then stop. They take no options object.

The callback may return a teardown function, which runs before the next invocation and on destroy, exactly like `$effect`. `watch` itself returns `void` — there is no handle to stop it; it lives and dies with its owner.

Choose `$effect` when the dependencies are obvious and you want them tracked automatically. Choose `watch` when you need the previous value, an explicit trigger, or `lazy`.

## resource

`resource(source, fetcher, options?)` is reactive async fetching: a `watch` over the source, an `AbortSignal` wired to cancellation, and loading/error state. It runs after render; `resource.pre()` runs before.

```svelte
<script lang="ts">
  let id = $state(1);

  const post = resource(
    () => id,
    async (id, prevId, { data, refetching, onCleanup, signal }) => {
      const res = await fetch(`/api/posts?id=${id}`, { signal });
      return res.json();
    },
    { debounce: 300 }
  );
</script>

{#if post.loading}
  <p>Loading…</p>
{:else if post.error}
  <p>{post.error.message}</p>
{:else}
  <p>{post.current?.title}</p>
{/if}
```

The fetcher's third argument carries the useful parts: `data` (the previous result), `refetching` (`false`, `true`, or whatever value was passed to `refetch(info)`), `onCleanup(fn)` for teardown that must run before the next fetch, and `signal`.

Returned state: `current`, `loading`, `error`, plus `mutate(value)` for optimistic updates and `refetch(info?)`.

Options: `lazy` (skip the initial fetch), `once` (never refetch on change), `initialValue`, `debounce`, `throttle`. **Set one of `debounce`/`throttle`, not both** — `debounce` wins silently if both are present.

`initialValue` changes the *type*: `current` is `Data` when it is supplied and `Data | undefined` when it is not, via a `HasInitialValue` generic on `ResourceReturn`. Supplying it removes the optional chaining from every read site.

Multiple sources work like `watch`:

```ts
const results = resource([() => query, () => page], async ([query, page]) => { /* ... */ });
```

In SvelteKit, a `load` function is still the right default for page data — it runs on the server, streams, and participates in navigation. `resource` is for fetching that belongs to a component rather than a route: a typeahead, a dependent dropdown, a polling widget. See [sveltekit.md](sveltekit.md).
