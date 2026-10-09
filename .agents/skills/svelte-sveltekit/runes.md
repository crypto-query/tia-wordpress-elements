---
title: "Runes"
summary: "Svelte 5 reactivity: $state (.raw/.snapshot/.eager), $derived (.by), $effect (.pre/.tracking/.pending/.root), $props, $bindable, $inspect — plus what actually happens during SSR."
verified_against: "svelte 5.56.8, @sveltejs/kit 2.70.2"
mcp_sections: ["svelte/$state", "svelte/$derived", "svelte/$effect", "svelte/$props", "svelte/best-practices"]
---

# Runes

Compiler-level reactive primitives, prefixed with `$`. They are keywords, not imports — **never `import { $state } from 'svelte'`**. They work in `.svelte` files and in `.svelte.js` / `.svelte.ts` modules; a plain `.ts` file cannot use them.

## What runs on the server

Get this right first — it drives most SSR bugs and most cargo-culted workarounds.

| Rune | During SSR | Notes |
|---|---|---|
| `$state` | ✅ runs | Value is computed and rendered. Not *reactive* — the server renders once. |
| `$derived` | ✅ runs | Evaluated for the initial HTML. |
| `$props` / `$bindable` | ✅ runs | — |
| `$effect` / `$effect.pre` | ❌ never runs | Browser only. |
| `$inspect` | ❌ never runs | Dev-mode, client only. |

Two corollaries that contradict a lot of older advice:

- **`$state(0)` in a server-rendered component is fine.** It does not crash, and it does not need a client-only wrapper component.
- **Never write `if (browser) { ... }` inside an `$effect`.** Effects don't run on the server, so the guard is dead code that implies a hazard that isn't there.

The real SSR hazard is **browser globals**, not runes:

```svelte
<script>
	// ❌ crashes during SSR — `localStorage` is undefined on the server,
	// and this runs at component init
	let theme = $state(localStorage.getItem('theme') ?? 'light');
</script>
```

```svelte
<script>
	// ✅ read it where only the browser reaches — no `browser` guard needed
	let theme = $state('light');

	$effect(() => {
		theme = localStorage.getItem('theme') ?? 'light';
	});
</script>
```

The third SSR hazard is **module-level state leaking between users**. State in a shared `.svelte.js` module is per-process on the server, so mutating it during SSR can expose one user's data to the next request. Use [context](components.md) for anything request-scoped.

## `$state`

```svelte
<script>
	let count = $state(0);
</script>

<button onclick={() => count++}>clicks: {count}</button>
```

There is no API — `count` is a number, updated like any variable.

**Use `$state` only for values that should be reactive** — variables that drive an `$effect`, a `$derived`, or a template expression. Everything else is a normal variable.

### Deep reactivity

Arrays and plain objects become deeply reactive **state proxies**; mutation triggers granular updates.

```js
let todos = $state([{ done: false, text: 'add more todos' }]);

todos[0].done = !todos[0].done;          // updates only what reads `.done`
todos.push({ done: false, text: 'eat' }); // the new object is proxied too
```

Proxying stops at anything that isn't an array or simple object — a class instance, or `Object.create(...)`.

Destructuring takes values, not references, so it breaks the link:

```js
let { done, text } = todos[0];  // ❌ evaluated once, never updates
todos[0].done;                  // ✅
```

### Classes

Class instances are not proxied. Put `$state` on the fields:

```js
class Todo {
	done = $state(false);
	doubled = $derived(this.count * 2);

	constructor(text) {
		this.text = $state(text);
	}

	// arrow function, so `this` survives being passed as a handler
	reset = () => {
		this.text = '';
		this.done = false;
	};
}
```

`onclick={todo.reset}` with a normal method binds `this` to the `<button>`. Use an arrow-function field or `onclick={() => todo.reset()}`.

Reactive versions of `Map`, `Set`, `Date` and `URL` come from [`svelte/reactivity`](#reactive-built-ins).

### `$state.raw`

Not deeply reactive — reassign only, never mutate. Skips proxy overhead, which matters for large objects and for API responses you only ever replace.

```js
let person = $state.raw({ name: 'Heraclitus', age: 49 });

person.age += 1;                                // no effect
person = { name: 'Heraclitus', age: 50 };       // works
```

Raw state can still *contain* reactive state (a raw array of reactive objects).

### `$state.snapshot`

Unwraps a proxy into a plain value, for `structuredClone`, external libraries, or logging.

```js
console.log($state.snapshot(counter));  // { count: 0 }, not Proxy { ... }
```

If the value has a `toJSON` method, the snapshot clones that result instead.

### `$state.eager`

Only relevant with [async Svelte](async-svelte.md). Because updates are synchronized, state feeding an `await` expression isn't shown until the async work settles. `$state.eager(value)` opts one read out of that, for immediate feedback:

```svelte
<a href="/about" aria-current={$state.eager(pathname) === '/about' ? 'page' : null}>about</a>
```

Use sparingly, and only in direct response to user action — coordinated updates usually give the better experience.

### Passing state into functions

JavaScript is pass-by-value, so passing state passes its *current value*. To give a function live access, pass getters:

```js
function add(getA, getB) {
	return () => getA() + getB();
}

let total = add(() => a, () => b);
```

The same applies across modules: you can declare state in `.svelte.js`, but you can only **export** it if it's never directly reassigned.

```js
/// file: state.svelte.js
// ❌ importers get the raw signal object, not a number
export let count = $state(0);
export function increment() { count += 1; }
```

```js
// ✅ mutate a property instead of reassigning the binding
export const counter = $state({ count: 0 });
export function increment() { counter.count += 1; }

// ✅ or keep it private and expose functions
let count = $state(0);
export function getCount() { return count; }
export function increment() { count += 1; }
```

## `$derived`

```js
let doubled = $derived(count * 2);
```

`$derived` takes an **expression, not a function**. For anything that needs statements, use `$derived.by`:

```js
let filtered = $derived.by(() => {
	const term = searchTerm.toLowerCase();
	return users.filter((u) => u.name.toLowerCase().includes(term));
});
```

Rules worth knowing:

- **Compute with `$derived`, not `$effect`.** This is the single most common Svelte 5 mistake.
- A derived expression returning an object or array is returned **as-is** — not made deeply reactive. Use `$state` inside `$derived.by` in the rare case you need that.
- Deriveds only propagate when the *value* changes: `$derived(count > 10)` doesn't re-run consumers on every `count` change.
- Don't reach for `$derived` when a template expression does the job — `<p>{firstName} {lastName}</p>` needs no derived.

### Deriveds are writable

Since 5.25 you can assign to a derived; it reverts to tracking its expression on the next change. That makes optimistic UI a three-liner without a shadow `$state`:

```js
let likes = $derived(post.likes);

async function onclick() {
	likes += 1;                 // optimistic
	try {
		await like();
	} catch {
		likes -= 1;               // roll back
	}
}
```

Destructuring a derived keeps every binding reactive:

```js
let { a, b, c } = $derived(stuff());
```

## `$effect`

Side effects — third-party libraries, canvas drawing, analytics. Runs after mount and in a microtask after state changes, batched, after DOM updates.

```svelte
<script>
	let canvas;

	$effect(() => {
		const context = canvas.getContext('2d');
		context.fillStyle = color;
		context.fillRect(0, 0, size, size);
	});
</script>
```

**Effects are an escape hatch.** Before writing one, check whether the job belongs to something else:

| Instead of an effect | Use |
|---|---|
| Computing a value from state | `$derived` |
| Syncing to a DOM node or external library | [`{@attach ...}`](components.md) |
| Reacting to user interaction | the event handler, or a [function binding](components.md) |
| Logging for debugging | `$inspect` |
| Observing something outside Svelte | `createSubscriber` |
| Listening on `window` / `document` | `<svelte:window>` / `<svelte:document>` |

### Teardown

```js
$effect(() => {
	const interval = setInterval(() => count++, milliseconds);
	return () => clearInterval(interval);  // before re-run, and on destroy
});
```

### Dependencies

Tracked automatically — every `$state`, `$derived` or `$props` value read **synchronously** inside the body, including through function calls. There is no dependency array.

Three ways this surprises people:

```js
// 1. async reads aren't tracked
$effect(() => {
	context.fillStyle = color;                       // tracked
	setTimeout(() => context.fillRect(0, 0, size), 0); // `size` NOT tracked
});

// 2. reading the object ≠ reading the property
$effect(() => { state; });        // runs once — `state` is never reassigned
$effect(() => { state.value; });  // runs whenever `.value` changes

// 3. only the branch that ran counts
$effect(() => {
	if (condition) confetti({ colors: [color] });  // depends on `color` only while true
	else confetti();
});
```

`$state`/`$derived` created *inside* an effect are not treated as dependencies.

Use `$inspect.trace(label)` as the first line of an effect to find out what actually triggered it.

### Variants

- **`$effect.pre`** — before DOM updates. Identical otherwise. Classic use: deciding whether to autoscroll based on the pre-update scroll position.
- **`$effect.tracking()`** — whether the current code is in a tracking context. Library-level; it's how `createSubscriber` avoids subscribing for reads inside event handlers.
- **`$effect.pending()`** — how many promises are unresolved in the current [boundary](async-svelte.md). Async Svelte only.
- **`$effect.root`** — a non-tracked scope with manual cleanup, for effects created outside component init.

```js
const destroy = $effect.root(() => {
	$effect(() => { /* setup */ });
	return () => { /* cleanup */ };
});

destroy();
```

### Never sync state with effects

```js
// ❌ two effects fighting over the same values
let spent = $state(0);
let left = $state(100);
$effect(() => { left = 100 - spent; });
$effect(() => { spent = 100 - left; });
```

```svelte
<!-- ✅ one source of truth + a function binding -->
<script>
	let spent = $state(0);
	let left = $derived(100 - spent);

	function updateLeft(left) { spent = 100 - left; }
</script>

<input type="range" bind:value={spent} max={100} />
<input type="range" bind:value={() => left, updateLeft} max={100} />
```

If you genuinely must write state an effect also reads, break the cycle with `untrack`.

## `$props`

```svelte
<script>
	let { data, form } = $props();
	let { title = 'Default', ...rest } = $props();
</script>
```

**Treat props as though they will change.** Anything computed from a prop belongs in `$derived`:

```js
let { type } = $props();

let color = $derived(type === 'danger' ? 'red' : 'green');  // ✅ updates
let color = type === 'danger' ? 'red' : 'green';            // ❌ frozen at init
```

Don't mutate props. Copy into local state when you need to own the value:

```js
let { user } = $props();
let draft = $state({ ...user });
```

In SvelteKit, `data` and `form` arrive as props — this is how `load` output reaches a component:

```svelte
<script>
	let { data } = $props();

	// derived, so it tracks navigations to a new `params`
	let sorted = $derived([...data.items].sort((a, b) => a.name.localeCompare(b.name)));
</script>
```

Two SvelteKit-specific traps:

- **Copy before sorting.** `data.items.sort(...)` mutates the loaded array in place.
- **`let x = $state(data.thing)` snapshots once.** It will not update when a navigation delivers new `data`. Use `$derived` unless you deliberately want a detached local copy.

`$props.id()` returns a unique, SSR-stable id for the component instance — use it for `for`/`aria-describedby` pairs instead of hand-rolled counters.

## `$bindable`

Opt a prop into two-way binding:

```svelte
<!-- Counter.svelte -->
<script>
	let { count = $bindable(0) } = $props();
</script>

<button onclick={() => count++}>{count}</button>
```

```svelte
<Counter bind:count />
```

## `$inspect`

Dev-only, and a rune — there is nothing to import.

```js
$inspect(count, doubled);              // logs on every change
$inspect(count).with(console.trace);   // custom handler
$inspect.trace('my effect');           // first line of an $effect/$derived.by
```

## `$host`

Inside a component compiled as a custom element, returns the host element — used to dispatch custom events.

## Reactive built-ins

`svelte/reactivity` ships reactive versions of things the proxy can't handle:

```js
import { SvelteMap, SvelteSet, SvelteDate, SvelteURL, MediaQuery, createSubscriber } from 'svelte/reactivity';

const selected = new SvelteSet();
const wide = new MediaQuery('(min-width: 800px)');
```

`svelte/reactivity/window` exposes reactive `innerWidth`, `scrollY`, `online` and friends — cheaper and tidier than an `$effect` plus a resize listener.

`createSubscriber` is the sanctioned way to wrap an external event source into a reactive value; it only subscribes while something is actually tracking the read.
