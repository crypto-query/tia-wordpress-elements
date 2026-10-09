---
title: "Async Svelte"
summary: "await in components, <svelte:boundary> pending/failed snippets, $effect.pending(), settled(), fork(), and hydratable. Experimental — requires compilerOptions.experimental.async."
verified_against: "svelte 5.56.8, @sveltejs/kit 2.70.2"
mcp_sections: ["svelte/await-expressions", "svelte/svelte-boundary", "svelte/hydratable", "svelte/$effect"]
---

# Async Svelte

Since **svelte 5.36** the `await` keyword works in three places it previously couldn't:

- the top level of a component's `<script>`
- inside `$derived(...)`
- inside markup

This is the foundation [remote functions](remote-functions.md) are built on. Experimental; the flag disappears in Svelte 6.

```js
/// file: svelte.config.js
export default {
	compilerOptions: {
		experimental: {
			async: true
		}
	}
};
```

## Synchronized updates

The defining behaviour, and the one that surprises people: **state changes are not shown until the async work they feed has finished**, so the UI is never internally inconsistent.

```svelte
<script>
	let a = $state(1);
	let b = $state(2);

	async function add(a, b) {
		await new Promise((f) => setTimeout(f, 500));
		return a + b;
	}
</script>

<input type="number" bind:value={a}>
<input type="number" bind:value={b}>

<p>{a} + {b} = {await add(a, b)}</p>
```

Incrementing `a` does **not** briefly render `2 + 2 = 3`. The whole line updates to `2 + 2 = 4` when `add` resolves. Updates may overlap — a fast one lands while a slower earlier one is still running.

When you deliberately want the immediate-feedback behaviour instead — a nav link highlighting on click, before the page loads — reach for `$state.eager(value)`. Use it only for direct response to user action; see [runes.md](runes.md).

## Concurrency

Independent `await` expressions in markup run **in parallel**, even though they read sequentially:

```svelte
<p>{await one(x)}</p>
<p>{await two(y)}</p>
```

Sequential `await`s inside `<script>` or an async function behave like ordinary JavaScript — they serialize. Independent `$derived` expressions are the exception: they're created in order but update independently afterwards.

```js
// `b` isn't created until `a` resolves, but afterwards
// they update independently
let a = $derived(await one(x));
let b = $derived(await two(y));
```

Svelte warns with [`await_waterfall`](https://svelte.dev/docs/svelte/runtime-warnings) when you write this — heed it and hoist the calls if the two are genuinely independent.

## Loading states

### `pending` — first render

```svelte
<svelte:boundary>
	<p>{await delayed('hello!')}</p>

	{#snippet pending()}
		<p>loading...</p>
	{/snippet}
</svelte:boundary>
```

The `pending` snippet shows while the boundary is first resolving, and **never again** — subsequent updates are globally coordinated, not per-boundary.

### `$effect.pending()` — every render after

Counts unresolved promises in the current boundary, excluding child boundaries. This is what drives an inline "validating…" spinner:

```svelte
{#if $effect.pending()}
	<p>pending promises: {$effect.pending()}</p>
{/if}
```

### `settled()` — imperative

Resolves when the current update has fully applied.

```js
import { tick, settled } from 'svelte';

async function onclick() {
	updating = true;

	// without this, `updating` batches with the changes below
	// and never reaches the screen
	await tick();

	color = 'octarine';
	answer = 42;

	await settled();

	updating = false;
}
```

The `await tick()` is the non-obvious part: without it your "loading" flag is grouped into the same coordinated update as the work it was meant to announce.

## Error handling with `<svelte:boundary>`

Since 5.3. A boundary walls off part of the tree so you can show pending UI and catch render-time errors. Providing any of `pending`, `failed` or `onerror` activates it.

```svelte
<svelte:boundary>
	<FlakyComponent />

	{#snippet failed(error, reset)}
		<button onclick={reset}>oops! try again</button>
	{/snippet}
</svelte:boundary>
```

`onerror(error, reset)` gets the same arguments and is the hook for error reporting, or for lifting `error`/`reset` out of the boundary:

```svelte
<svelte:boundary onerror={(e) => report(e)}>...</svelte:boundary>
```

**Boundaries only catch errors thrown during rendering or while running effects.** Errors from event handlers, `setTimeout`, or work started after an `await` escape them. When a boundary handles an error, its existing content is torn down. Throwing inside `onerror` (or rethrowing) escalates to the parent boundary.

### Server behaviour

By default boundaries do nothing on the server — a render error fails the whole render. Since 5.51, `render(...)` accepts `transformError` to change that for boundaries with a `failed` snippet:

```js
const { head, body } = await render(App, {
	transformError: (error) => {
		console.error(error);           // full error stays on the server
		return { message: 'An error occurred!' };  // sanitized, serialized to the client
	}
});
```

The return value must be JSON-stringifiable; it hydrates the `failed` snippet in the browser and is passed to `onerror`. **Redact it** — SSR error messages and stacks routinely contain secrets.

Under SvelteKit you don't call `render` yourself. Today, use the [`handleRenderingErrors`](experimental.md) experimental flag, which wraps each level that has an `+error.svelte` in a boundary and routes the error through `handleError`. Full `transformError` support via `handleError` is planned.

## Server-side rendering

`svelte/server`'s `render(...)` is awaitable:

```js
const { head, body } = await render(App);
```

A `<svelte:boundary>` with a `pending` snippet renders **that snippet** during SSR and skips its contents. Every `await` outside such a boundary resolves before `render` returns. So a pending snippet is also a decision about what search engines and no-JS visitors see — a boundary with `pending` ships a spinner to the crawler.

Streaming SSR is planned but not shipped.

## `hydratable` — don't refetch on hydration

The pitfall of plain `await` in a component: the server does the work, then the client redoes it during hydration, blocking hydration for its duration.

```svelte
<script>
	import { hydratable } from 'svelte';
	import { getUser } from 'my-database-library';

	// server: run, serialize into `head`. client: read the serialized value.
	// after hydration, calling it again just runs `getUser`.
	const user = await hydratable('user', () => getUser());
</script>
```

You rarely call this directly — it's the machinery under remote functions and data libraries. It's also the way to get a random or time-based value that is stable across server and client:

```ts
const rand = hydratable('random', () => Math.random());
```

Library authors: prefix keys with your library name to avoid collisions.

Values are serialized with devalue (`Map`, `Set`, `URL`, `BigInt`, …), and promises are supported:

```svelte
<script>
	const promises = hydratable('pair', () => ({
		one: Promise.resolve(1),
		two: Promise.resolve(2)
	}));
</script>

{await promises.one}
{await promises.two}
```

### CSP

`hydratable` injects an inline `<script>` into `head`, which a Content Security Policy will block. Pass a nonce for dynamically rendered responses:

```js
const nonce = crypto.randomUUID();
const { head, body } = await render(App, { csp: { nonce } });
response.headers.set('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
```

A nonce must be generated per response — reusing one defeats the purpose. For statically generated HTML you must use hashes instead:

```js
const { head, body, hashes } = await render(App, { csp: { hash: true } });
```

Prefer nonces: hashes will interfere with streaming SSR later.

## `fork` — speculative work

Added in 5.42. Runs `await` expressions you *expect* to need, so the result is ready when the user commits. Mainly framework machinery — SvelteKit's [`forkPreloads`](experimental.md) flag uses it for navigation preloading — but it's usable directly:

```svelte
<script>
	import { fork } from 'svelte';

	let open = $state(false);
	/** @type {import('svelte').Fork | null} */
	let pending = null;

	function preload() {
		pending ??= fork(() => { open = true; });
	}

	function discard() {
		pending?.discard();
		pending = null;
	}
</script>

<button
	onfocusin={preload} onfocusout={discard}
	onpointerenter={preload} onpointerleave={discard}
	onclick={() => { pending?.commit(); pending = null; open = true; }}
>open menu</button>

{#if open}
	<Menu onclose={() => open = false} />
{/if}
```

## Caveats

- Experimental: `await` handling and `$effect.pending()` can break outside a major release.
- Effect ordering changes when `experimental.async` is on — block effects (`{#if}`, `{#each}`) now run **before** an `$effect.pre` or `beforeUpdate` in the same component. Rare, but it is a real behaviour change on an existing codebase.
