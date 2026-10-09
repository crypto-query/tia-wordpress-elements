---
title: "Component authoring"
summary: "Template syntax, snippets, bindings, attachments, context (createContext), styling, special elements, lifecycle and TypeScript for Svelte 5 components."
verified_against: "svelte 5.56.8"
mcp_sections: ["svelte/snippet", "svelte/@attach", "svelte/context", "svelte/bind", "svelte/typescript", "svelte/declaration-tags", "svelte/best-practices", "svelte/svelte-events"]
---

# Component authoring

Runes themselves live in [runes.md](runes.md). This is everything around them.

## Modern replacements at a glance

Every left-hand item still works and still appears in older code and blog posts. Use the right-hand one in new code.

| Legacy | Use instead |
|---|---|
| `<slot>`, `$$slots`, `<svelte:fragment>` | `{#snippet}` + `{@render}` |
| `on:click={...}` | `onclick={...}` |
| `createEventDispatcher` | callback props |
| `use:action` | `{@attach ...}` |
| `class:active={x}` | `class={{ active: x }}` |
| `<svelte:component this={C} />` | `<C />` — components are values |
| `<svelte:self />` | `import Self from './This.svelte'` |
| `setContext` / `getContext` | `createContext()` |
| stores for shared state | classes with `$state` fields |
| `export let` | `$props()` |
| `{@const x = y}` | `{const x = y}` — declaration tags |

## Template syntax

```svelte
{#if condition}…{:else if other}…{:else}…{/if}

{#each items as item, index}…{/each}
{#each items as item (item.id)}…{/each}          <!-- keyed: prefer this -->
{#each items as item, i (item.id)}…{:else}<p>none</p>{/each}

{#await promise}…{:then value}…{:catch error}…{/await}

{#key value}<Component />{/key}                   <!-- recreate on change -->

{const total = price * qty}                       <!-- declaration tag -->
{@html sanitized}
{@debug user}
```

**Always key your each blocks.** Keying lets Svelte move DOM rather than rewrite it. The key must uniquely identify the item — **never the index**. And avoid destructuring in `{#each}` if you need to mutate the item (e.g. `bind:value={item.count}`), since destructured bindings are detached copies.

With [async Svelte](async-svelte.md) enabled, `{#await}` is largely superseded by plain `await` in markup plus a `<svelte:boundary>`.

### Declaration tags

`{const ...}` and `{let ...}` (since **5.56**) declare local variables in markup, and supersede `{@const ...}` — which the docs now call legacy:

```svelte
{#each boxes as box (box.id)}
	{const area = box.width * box.height}
	<p>{box.width} ⨉ {box.height} = {area}</p>
{/each}
```

They do two things `{@const}` could not. They go **anywhere** in the component rather than only as an immediate child of a block or component, and `{let ...}` holds *reactive* state — so a scrap of UI state can live in the block it belongs to instead of a `<script>` variable that outlives it:

```svelte
{#if editing}
	{let name = $state(user.name)}
	{const greeting = $derived(`Hello ${name}`)}

	<input bind:value={name} />
	<p>{greeting}</p>
{/if}
```

Scope is lexical: a declaration is visible to its siblings and their children, and an inner one shadows an outer.

## Snippets

Reusable markup, instantiated with `{@render}`. Declared in the template.

```svelte
{#snippet row(item, index)}
	<tr><td>{index + 1}</td><td>{item.name}</td></tr>
{/snippet}

<table>
	{#each items as item, i}
		{@render row(item, i)}
	{/each}
</table>
```

Snippets are values, so they pass as props — this is what replaced named slots:

```svelte
<!-- consumer -->
<DataTable {rows} {header}>
	{#snippet empty()}
		<p>Nothing here yet.</p>
	{/snippet}
</DataTable>
```

```svelte
<!-- DataTable.svelte -->
<script>
	let { rows, header, empty, children } = $props();
</script>

{@render header?.()}
{#if rows.length}
	{@render children()}
{:else}
	{@render empty?.()}
{/if}
```

Content placed directly inside a component's tags arrives as the `children` snippet. Use `{@render x?.()}` for optional ones.

A snippet declared at the top level can be referenced from `<script>`; one that reads no component state can live in `<script module>` and be exported for other components to import.

## Bindings

```svelte
<input bind:value={name} />
<input type="number" bind:value={age} />        <!-- coerced to number -->
<input type="checkbox" bind:checked={accepted} />
<input type="radio" bind:group={selected} value="a" />
<select bind:value={selected}>…</select>
<div bind:clientWidth={w} bind:clientHeight={h}>…</div>
<video bind:currentTime bind:paused></video>
<div bind:this={element}></div>
<Component bind:value />
```

### Function bindings

A getter/setter pair — the clean way to derive-and-write without an `$effect`:

```svelte
<input bind:value={() => value, (v) => value = v.toLowerCase()} />
```

## Attachments — `{@attach ...}`

Since 5.29, and the replacement for actions. An attachment runs in an effect when the element mounts, and **re-runs whenever state it reads changes** — actions never did that. It may return a teardown.

```svelte
<script>
	/** @type {import('svelte/attachments').Attachment} */
	function myAttachment(element) {
		console.log(element.nodeName);
		return () => console.log('cleaning up');
	}
</script>

<div {@attach myAttachment}>…</div>
```

The common shape is a **factory** — a function returning an attachment, so you can parameterize it:

```svelte
<script>
	import tippy from 'tippy.js';

	function tooltip(content) {
		return (element) => {
			const instance = tippy(element, { content });
			return instance.destroy;
		};
	}
</script>

<button {@attach tooltip(content)}>Hover me</button>
```

Because `tooltip(content)` is evaluated inside an effect, the tooltip is destroyed and rebuilt whenever `content` changes. When setup is expensive and you don't want that, pass a getter and read it in a nested effect:

```js
function foo(getBar) {
	return (node) => {
		veryExpensiveSetupWork(node);
		$effect(() => update(node, getBar()));
	};
}
```

Inline attachments work too, and the nested-effect trick applies there as well:

```svelte
<canvas {@attach (canvas) => {
	const context = canvas.getContext('2d');   // once
	$effect(() => {                            // on every `color` change
		context.fillStyle = color;
		context.fillRect(0, 0, canvas.width, canvas.height);
	});
}}></canvas>
```

Falsy values are ignored, so `{@attach enabled && myAttachment}` is a valid conditional.

On a **component**, `{@attach ...}` becomes a prop keyed by a `Symbol`. If that component spreads props onto an element, the element receives the attachment — which is how you write wrapper components that stay attachable:

```svelte
<!-- Button.svelte -->
<script>
	let { children, ...props } = $props();
</script>

<button {...props}>{@render children?.()}</button>
```

```svelte
<Button {@attach tooltip(content)}>Hover me</Button>
```

For an object you'll spread, build the key with `createAttachmentKey`. To use an action-only library, wrap it with `fromAction` — both from `svelte/attachments`.

## Context

Prefer `createContext` (5.40+): no string keys, and it's type-safe.

```ts
/// file: context.ts
import { createContext } from 'svelte';

interface User {
	name: string;
}

export const [getUserContext, setUserContext] = createContext<User>();
```

```svelte
<!-- Parent.svelte -->
<script>
	import { setUserContext } from './context';
	setUserContext({ name: 'world' });
</script>
```

```svelte
<!-- Child.svelte -->
<script>
	import { getUserContext } from './context';
	const user = getUserContext();
</script>

<h1>hello {user.name}</h1>
```

Reactive state passes through context fine, but **reassigning breaks the link**:

```svelte
<button onclick={() => counter = { count: 0 }}>  <!-- ❌ breaks it -->
<button onclick={() => counter.count = 0}>       <!-- ✅ -->
```

Svelte warns when you get this wrong. To pass a primitive, pass a getter function instead.

`setContext`/`getContext` (plus `hasContext`, `getAllContexts`) still exist for older versions and dynamic keys.

### Why context beats a shared module on the server

Module-level state is per-process. Mutate it during SSR and it can leak to the *next user's* request:

```svelte
<script>
	import { myGlobalState } from './state.svelte.js';
	let { data } = $props();

	if (data.user) myGlobalState.user = data.user;  // ❌ leaks across requests
</script>
```

Context is per-render, so it can't. Use it for anything request-scoped.

### Testing a component that reads context

Since 5.49 you can wrap the component in a function:

```js
function Wrapper(...args) {
	setUserContext({ name: 'Bob' });
	return MyComponent(...args);
}

const component = mount(Wrapper, { target: document.body });
```

Works with `hydrate` and `render` too.

## Lifecycle

Runes replaced most of it.

| Svelte 4 | Svelte 5 |
|---|---|
| `onMount` | `$effect` (still fine for genuinely one-time setup) |
| `beforeUpdate` | `$effect.pre` |
| `afterUpdate` | `$effect` |
| `onDestroy` | teardown returned from `$effect` |

```js
$effect(() => {
	const cleanup = setup();
	return cleanup;
});
```

`tick()` returns a promise resolving after pending state changes hit the DOM. With async Svelte, `settled()` waits for the whole update — see [async-svelte.md](async-svelte.md).

## Component communication

- **Parent → child**: props.
- **Child → parent**: callback props — `<Child onchange={handleChange} />`, and in the child `let { onchange } = $props()`. No `createEventDispatcher`.
- **Two-way**: `bind:` plus `$bindable()`.
- **Across a subtree**: context.
- **App-wide**: a class with `$state` fields in a `.svelte.js` module — but see the SSR warning above for anything user-specific.

## Special elements

```svelte
<svelte:head>
	<title>My App</title>
	<meta name="description" content="…" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} bind:innerWidth={width} />
<svelte:document onvisibilitychange={handle} />
<svelte:body onmouseenter={handle} />

<svelte:element this={tag}>Content</svelte:element>

<svelte:boundary>…</svelte:boundary>

<svelte:options runes={true} customElement="my-element" />
```

Note the plain `onkeydown` — `on:keydown` is legacy syntax. Prefer `<svelte:window>` over an `$effect` that adds a listener, and `svelte/reactivity/window` over binding dimensions when you only need to read them.

When a listener genuinely has to be attached imperatively, use `on` from `svelte/events` rather than `addEventListener` — it returns a cleanup function and fires in the right order relative to `onclick`-style attributes, which Svelte delegates.

`<svelte:self>` and `<svelte:component>` are legacy; import the component (or use the value directly) instead.

## Styling

Styles in `<style>` are scoped to the component.

**Dynamic classes** — use clsx-style objects and arrays in the `class` attribute rather than the `class:` directive:

```svelte
<button class={['btn', { active: isActive, 'animate-pulse': isLoading }]}>
	Toggle
</button>
```

**Dynamic values** — the `style:` directive, for things not known at build time:

```svelte
<div style:width="{width}px" style:transform={`rotate(${rotation}deg)`}>Box</div>
```

**JS values in CSS** — set a custom property and read it in `<style>`:

```svelte
<div style:--columns={columns}>…</div>

<style>
	div { grid-template-columns: repeat(var(--columns), 1fr); }
</style>
```

**Styling a child component** — pass a CSS custom property:

```svelte
<Child --color="red" />
```

```svelte
<!-- Child.svelte -->
<style>
	h1 { color: var(--color); }
</style>
```

When that's impossible (a third-party component), fall back to `:global`:

```svelte
<style>
	div :global {
		h1 { color: red; }
	}
</style>
```

Only the **top-level** `<style>` is scoped. A `<style>` nested inside an element or a block is injected into the DOM verbatim, so its selectors leak to the whole page — which is occasionally what you want, and otherwise a surprising way to lose scoping.

For utility-first systems, theming and variants, see the `tailwind-css` skill. For `transition:`, `animate:` and animated values, see [motion.md](motion.md).

## TypeScript

```svelte
<script lang="ts">
	interface Props {
		adjective: string;
		count?: number;
		children?: import('svelte').Snippet;
	}

	let { adjective, count = 0, children }: Props = $props();
</script>
```

```svelte
<!-- generic component -->
<script lang="ts" generics="T">
	let { items, row }: { items: T[]; row: Snippet<[T]> } = $props();
</script>
```

Useful types from `svelte`: `Component`, `ComponentProps<typeof MyComponent>`, `Snippet`. Element attribute types live in `svelte/elements` (`HTMLButtonAttributes` and friends) — the right choice for wrapper components that spread `...props`.

In `.js` files, the same shapes work as JSDoc:

```svelte
<script>
	/** @type {{ adjective: string, count?: number }} */
	let { adjective, count = 0 } = $props();
</script>
```
