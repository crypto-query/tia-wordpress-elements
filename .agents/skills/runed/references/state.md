# State utilities

Containers that hold or shape state over time. All of them except `Context`, `Previous`, `FiniteStateMachine`, `useDebounce` and `useThrottle` need an effect context — see [lifecycle.md](lifecycle.md).

## Context

A typed wrapper over Svelte's `getContext`/`setContext`. It buys type safety, a real error message when the context is missing, and a definition you can import — not reactivity.

```ts
// theme-context.ts
import { Context } from "runed";
export const themeContext = new Context<"light" | "dark">("theme");
```

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  themeContext.set(data.theme);
</script>
```

```svelte
<!-- child -->
<script lang="ts">
  const theme = themeContext.get();          // throws if unset
  const safe = themeContext.getOr("light");  // fallback instead
</script>
```

The constructor argument is a **debug label**, not a key or a value — the key is a private `symbol`. Creating the instance sets nothing; the container stays empty until `set()` runs.

`set()`, `get()`, `getOr()` and `exists()` must all be called during component initialisation, the same constraint Svelte's own context API carries. They cannot run in an event handler or after an `await`.

**The value is only reactive if you make it so.** `set(someObject)` shares a snapshot. To share live state, put `$state` inside the value and read it through a getter:

```ts
export const counterContext = new Context<{ readonly count: number }>("counter");

// in the parent's init
let count = $state(0);
counterContext.set({ get count() { return count; } });
```

## PersistedState

Reactive state mirrored into `localStorage` or `sessionStorage`, synchronised across tabs by default.

```svelte
<script lang="ts">
  const count = new PersistedState("count", 0);
</script>

<button onclick={() => count.current++}>{count.current}</button>
```

Options: `storage: "local" | "session"` (default `"local"`), `syncTabs` (default `true`, via the `storage` event), `connected` (default `true`), `serializer: { serialize, deserialize }`, and `window`.

**Deep reactivity covers plain objects, arrays and primitives only.** A class instance is stored but not proxied, so mutating its properties persists nothing:

```ts
const arr = new PersistedState("a", ["a", "b"]);
arr.current.push("c");            // ✅ persists

const person = new PersistedState("p", new Person("Bob"));
person.current.name = "JG";       // ❌ silently not persisted
person.current = new Person("JG"); // ✅ reassignment persists
```

Anything JSON cannot round-trip — `Date`, `Map`, `Set`, `BigInt` — needs a `serializer` (superjson is the usual choice), otherwise it deserialises as the wrong type.

`connect()` / `disconnect()` and the `connected` option (both added in `0.37.0`) control whether the state talks to storage at all. Disconnected, changes stay in memory and cross-tab sync is off; `disconnect()` **removes the key from storage** while keeping the value in memory, and `connect()` immediately writes the in-memory value back. Use it for state that should only start persisting once the user opts in.

On the server `current` is the initial value and storage is never touched, so a persisted value that differs from the seed causes a hydration flash.

## Debounced and Throttled

Wrappers that produce a *delayed copy of state*. The source must be a real getter (`Getter<T>`); `wait` may be a getter or a number, defaulting to 250 ms.

```svelte
<script lang="ts">
  let search = $state("");
  const debounced = new Debounced(() => search, 500);
</script>

<input bind:value={search} />
<p>Searching for: {debounced.current}</p>
```

Their APIs are deliberately **not** symmetric:

| | `Debounced` | `Throttled` |
|---|---|---|
| `current` | ✅ | ✅ |
| `pending` | ✅ | — |
| `cancel()` | ✅ | ✅ |
| `setImmediately(v)` | ✅ | ✅ |
| `updateImmediately()` | ✅ (async) | — |

`cancel()` drops the pending update, leaving `current` at the old value. `setImmediately(v)` writes a new value now and cancels anything pending.

## useDebounce and useThrottle

The callback-shaped siblings. Where `Debounced` wraps state, `useDebounce` wraps a *function* and returns a debounced version of it, carrying `cancel()`, `runScheduledNow()` and `pending`. `useThrottle` returns the same minus `runScheduledNow`.

```svelte
<script lang="ts">
  let duration = $state(1000);
  const log = useDebounce(() => { /* ... */ }, () => duration);
</script>

<button onclick={log}>Ding</button>
<button onclick={log.runScheduledNow} disabled={!log.pending}>Run now</button>
<button onclick={log.cancel} disabled={!log.pending}>Cancel</button>
```

The returned function is awaitable — it resolves with the callback's return value when it eventually runs. Both are safe to create outside an effect context.

Pick by what you have: state to delay → `Debounced`; an action to rate-limit → `useDebounce`.

## Previous

Holds the prior value of a getter.

```ts
const previous = new Previous(() => count);
```

`current` is typed `T | undefined` and **starts `undefined`** — before any change there is no previous value, and that includes the whole server render. Handle the empty case rather than assuming a first value.

## StateHistory

Tracks a getter's values into a log, with undo/redo. The setter is required — that is how `undo()` and `redo()` write back.

```svelte
<script lang="ts">
  let count = $state(0);
  const history = new StateHistory(() => count, (c) => (count = c));
</script>

<button disabled={!history.canUndo} onclick={history.undo}>Undo</button>
<button disabled={!history.canRedo} onclick={history.redo}>Redo</button>
<button onclick={history.clear}>Clear</button>
```

`log` is an array of `{ snapshot, timestamp }`. `canUndo` is true once more than one entry exists; `canRedo` once the redo stack is non-empty. A `capacity` option (`MaybeGetter<number>`) bounds the log — worth setting for anything that changes on every keystroke, since the default is unbounded.

The value parameter is `MaybeGetter<T>`, so a bare value compiles and then never records anything. Always pass `() => value`.

## FiniteStateMachine

A small typed state machine — states, the events valid in each, and where they lead.

```ts
type States = "idle" | "running";
type Events = "start" | "stop";

const f = new FiniteStateMachine<States, Events>("idle", {
  idle:    { start: "running" },
  running: { stop: "idle", _enter: () => { f.debounce(2000, "stop"); } },
  "*":     { reset: "idle" },
});

f.send("start");
```

- **Actions** — instead of a target state string, a function that *returns* a state. Returning nothing cancels the transition, which is the documented way to reject an event, so a missing `return` is indistinguishable from a deliberate refusal.
- **Lifecycle** — `_enter` and `_exit` per state, called with `{ from, to, event, args }`. The initial state's `_enter` fires at construction with `from` and `event` set to `null`.
- **Wildcard** — a `"*"` state is consulted when the current state has no handler for an event, before the event is discarded.
- **`f.debounce(ms, event, ...args)`** — schedule a transition; calling it again with the same event restarts the timer.

`f.current` is the reactive state. Construction needs no effect context.

Runed's own docs point at XState for anything richer; this is intentionally minimal.

## Intervals

`useInterval(delay, options?)` — `setInterval` with a reactive delay, a tick counter and pause/resume.

```ts
const interval = useInterval(() => delay, {
  callback: (count) => console.log(`tick ${count}`),
});
// interval.counter, interval.isActive, interval.pause(), interval.resume(), interval.reset()
```

Options: `immediate` (start on creation, default `true`), `immediateCallback` (fire the callback on resume, default `false`), `callback`. Changing the delay restarts the timer with the new value.

**The `Interval` class was removed in `0.35.0`** and folded into `useInterval`. `new Interval(...)` does not exist in any current version.
