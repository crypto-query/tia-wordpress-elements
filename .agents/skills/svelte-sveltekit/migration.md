---
title: "Migration"
summary: "Svelte 4 → 5 (runes, snippets, events, stores) and SvelteKit 1 → 2 breaking changes, what SvelteKit 3 removes, plus $app/stores → $app/state. Automated codemods first, manual work second."
verified_against: "svelte 5.56.8, @sveltejs/kit 2.70.2, sv 0.17.0"
mcp_sections: ["svelte/v5-migration-guide", "kit/migrating-to-sveltekit-2", "kit/environment-variables", "cli/sv-migrate"]
---

# Migration

## Run the codemods first

```sh
npx sv migrate svelte-5        # runes, events, slots, component API
npx sv migrate sveltekit-2     # throw error/redirect, cookie paths, etc.
npx sv migrate app-state       # $app/stores → $app/state
npx sv migrate self-closing-tags
```

These handle the mechanical majority. Everything below is what they can't decide for you.

Svelte 5 runs Svelte 4 components in **legacy mode**, so migration is incremental — a component uses runes mode as soon as it uses a rune. You can't mix the two *within* one component.

## SvelteKit 3 (pre-release)

On the `next` tag today — `npx sv add experimental="versions:kit"` moves kit, the adapter and its peers together. **There is no published v3 migration guide yet**, so treat anything beyond the removals below as unsettled.

| Gone in 3 | Write this instead | Available since |
|---|---|---|
| `$env/static/private`, `$env/static/public`, `$env/dynamic/private`, `$env/dynamic/public` | `src/env.ts` + `$app/env/private` / `$app/env/public` ([config.md](config.md)) | 2.63 |
| `$app/environment` | `$app/env` — same four exports | 2.63 |
| `$app/stores` | `$app/state` — same values, no `$` prefix; `npx sv migrate app-state` converts it | 2.12 |

Every replacement ships in 2.x already, so this migration is something to finish *before* the upgrade rather than during it.

## SvelteKit 1 → 2

| Change | Action |
|---|---|
| `error()` / `redirect()` are no longer thrown by you | delete the `throw` |
| Cookies need an explicit `path` | `cookies.set(n, v, { path: '/' })` |
| Top-level promises no longer auto-awaited | add `await` (with `Promise.all`) where you wanted blocking |
| `goto()` rejects external URLs | `window.location.href = url` |
| Paths relative by default | check `paths.relative` if assets break |
| `resolvePath` removed | `resolve` from `$app/paths` (takes `base` into account; `resolveRoute` is itself now deprecated) |
| `preloadCode` takes one argument, `base`-prefixed | update call sites |
| `form` / `data` gone from `use:enhance` callbacks | `formElement` / `formData` |
| File inputs require `enctype="multipart/form-data"` | add it — kit 2 throws otherwise |
| `dangerZone.trackServerFetches` removed | server fetches are no longer trackable |
| Dynamic env vars unavailable during prerendering | use `$env/static/*` |
| `vitePreprocess` no longer re-exported | import from `@sveltejs/vite-plugin-svelte` |
| `tsconfig.json` `paths`/`baseUrl` now warn | use `kit.alias` |
| `handleError` receives `status` and `message` | use `message` for anything user-facing |

Requirements: Node 18.13+, svelte 4+, vite 5+, typescript 5+, `@sveltejs/vite-plugin-svelte@3` as a peer dependency.

### `$app/stores` → `$app/state`

Deprecated since 2.12, **slated for removal in SvelteKit 3**. Same values, no `$` prefix, and fine-grained — `page.state` changes no longer invalidate `page.data`.

```svelte
<script>
	import { page } from '$app/state';   // was '$app/stores'
</script>

{page.data}                              <!-- was {$page.data} -->
```

Requires Svelte 5 (runes). `$app/state` values are only readable during rendering on the server, not in `load`.

## Svelte 4 → 5

### State and reactivity

```js
let count = 0;                    →  let count = $state(0);
$: doubled = count * 2;           →  let doubled = $derived(count * 2);
$: { sideEffect(count); }         →  $effect(() => { sideEffect(count); });
export let name;                  →  let { name } = $props();
export let name = 'x';            →  let { name = 'x' } = $props();
$$props / $$restProps             →  let { a, ...rest } = $props();
```

Not every `$:` becomes an `$effect`. A `$:` that **computes** becomes `$derived`; only one that genuinely reaches outside — DOM, network, a third-party library — becomes an effect. Converting computations into effects is the most common way a migration ends up slower and buggier than what it replaced.

`$:` re-ran on *every* dependency change including transitive ones; `$derived` tracks precisely and caches. Some code that relied on over-firing will need adjusting.

### Stores → runes

```js
/// before: stores.js
import { writable, derived } from 'svelte/store';
export const count = writable(0);
export const doubled = derived(count, ($c) => $c * 2);
```

```js
/// after: state.svelte.js — export an object, not a reassigned binding
export const counter = $state({ count: 0 });
export function increment() { counter.count += 1; }
```

Or a class, which is usually cleaner:

```js
/// file: counter.svelte.js
export class Counter {
	count = $state(0);
	doubled = $derived(this.count * 2);
	increment = () => { this.count += 1; };
}
```

**You cannot export a reassigned `$state` binding** — the compiler rewrites every reference, and importers get the raw signal. Export an object you mutate, or expose getter/setter functions. See [runes.md](runes.md).

Stores still work, and remain the right tool for genuinely external async streams (RxJS interop, `readable` wrapping a socket). Everything else should be runes — and for anything user-specific under SSR, [context](components.md) rather than a shared module.

### Slots → snippets

```svelte
<!-- before -->
<slot />
<slot name="header" />
{#if $$slots.footer}<slot name="footer" />{/if}
```

```svelte
<!-- after -->
<script>
	let { children, header, footer } = $props();
</script>

{@render children()}
{@render header?.()}
{#if footer}{@render footer()}{/if}
```

```svelte
<!-- consumer: before -->
<Card>
	<h1 slot="header">Title</h1>
</Card>

<!-- consumer: after -->
<Card>
	{#snippet header()}<h1>Title</h1>{/snippet}
</Card>
```

`let:` directives become snippet parameters: `{#snippet row(item)}`.

### Events

```svelte
on:click={handler}              →  onclick={handler}
on:click|preventDefault={fn}    →  onclick={(e) => { e.preventDefault(); fn(e); }}
on:click|once={fn}              →  wrap the handler yourself
on:customEvent                  →  a callback prop
```

Event modifiers are gone (`svelte/legacy` has shims, but writing it out is clearer). `capture`, `passive` and `nonpassive` survive as `onclickcapture` etc.

`createEventDispatcher` → callback props:

```svelte
<!-- before -->
<script>
	const dispatch = createEventDispatcher();
</script>
<button on:click={() => dispatch('select', { id })}>

<!-- after -->
<script>
	let { onselect } = $props();
</script>
<button onclick={() => onselect({ id })}>
```

To forward every handler, spread: `<button {...props}>`.

### Component API

```js
// before
const app = new App({ target: document.body, props });
app.$set({ x: 1 });
app.$on('event', handler);
app.$destroy();

// after
import { mount, unmount } from 'svelte';

const props = $state({ x: 0 });
const app = mount(App, { target: document.body, props });
props.x = 1;                    // instead of $set
unmount(app);
```

Components are no longer classes. `<svelte:component this={C}>` is unnecessary — `<C />` works because components are values. `<svelte:self>` becomes a self-import.

### Other renames

| Before | After |
|---|---|
| `use:action` | `{@attach ...}` |
| `class:active={x}` | `class={{ active: x }}` |
| `<svelte:fragment>` | snippets |
| `beforeUpdate` / `afterUpdate` | `$effect.pre` / `$effect` |
| `setContext`/`getContext` | `createContext` |
| `immutable` compiler option | not applicable in runes mode |

Whitespace handling, `<svelte:options>` accessors, and some CSS scoping edge cases changed too — the official migration guide has the exhaustive list.

## Order of work

1. Upgrade to the latest Svelte 4 and SvelteKit 1.x first, to surface deprecation warnings against a working build.
2. `npx sv migrate sveltekit-2`, fix what it flags, get green.
3. `npx sv migrate svelte-5`, then `app-state`.
4. Convert leaf components before shared ones — the blast radius is smaller and legacy mode keeps the rest running.
5. Convert stores last; that's where design decisions live (class vs object vs context).
6. Run `npx sv check` throughout, and lean on `svelte-autofixer` via the MCP server on each converted component.

Migrating tests: `@testing-library/svelte` needs a version supporting Svelte 5, component instantiation moves to `mount`/`unmount`, and `flushSync` from `svelte` replaces waiting on `tick()` in synchronous assertions.
