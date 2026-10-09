---
title: "Routing"
summary: "File conventions, layouts and snippets, dynamic/optional/rest parameters, matchers, route groups, layout breaking, route sorting, character encoding, snapshots, shallow routing and error pages."
verified_against: "@sveltejs/kit 2.70.2"
mcp_sections: ["kit/routing", "kit/advanced-routing", "kit/errors", "kit/snapshots", "kit/shallow-routing", "kit/link-options"]
---

# Routing

Filesystem-based. A directory under `src/routes` is a URL segment; `+` files give that segment behaviour.

| File | Role |
|---|---|
| `+page.svelte` | page component |
| `+page.ts` | universal load (server + client) |
| `+page.server.ts` | server-only load, plus form actions |
| `+layout.svelte` | shared layout; renders `children` |
| `+layout.ts` / `+layout.server.ts` | layout load |
| `+error.svelte` | error page for this subtree |
| `+server.ts` | API endpoint (`GET`, `POST`, …) |
| `src/params/*.js` | parameter matchers |

```
src/routes/
├── +page.svelte              → /
├── about/+page.svelte        → /about
├── blog/
│   ├── +page.svelte          → /blog
│   └── [slug]/+page.svelte   → /blog/my-post
└── api/users/+server.ts      → /api/users
```

## Layouts

A layout receives `children` as a snippet:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import '../app.css';
	let { children } = $props();
</script>

<nav>…</nav>
<main>{@render children()}</main>
<footer>…</footer>
```

Layouts nest automatically down the directory tree. Data loaded in `+layout.server.ts` is available to every child route:

```ts
// src/routes/(app)/+layout.server.ts
export async function load({ locals }) {
	return { user: locals.user };
}
```

Pages can pass named snippets up to a layout that declares them as props:

```svelte
<!-- +layout.svelte -->
<script>
	let { children, header } = $props();
</script>

{#if header}<header>{@render header()}</header>{/if}
<main>{@render children()}</main>
```

## Parameters

```
[slug]           required          /blog/hello
[[page]]         optional          /blog and /blog/2
[...path]        rest, 0+ segments /docs/a/b/c → params.path === 'a/b/c'
[id=integer]     matched           only if the `integer` matcher passes
```

```ts
// +page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const post = await db.post.findUnique({ where: { slug: params.slug } });
	if (!post) error(404, 'Not found');
	return { post };
};
```

Rest parameters match **zero** or more segments, so `src/routes/a/[...rest]/z` matches `/a/z` (`rest` undefined), `/a/b/z`, and `/a/b/c/z`.

An optional parameter **cannot follow a rest parameter** — the rest is greedy and leaves nothing behind.

### Matchers

```js
/// file: src/params/integer.js
/**
 * @param {string} param
 * @return {param is string}
 * @satisfies {import('@sveltejs/kit').ParamMatcher}
 */
export function match(param) {
	return /^\d+$/.test(param);
}
```

`/blog/123` matches `[id=integer]`; `/blog/abc` falls through to another route or 404s.

Matchers run on **server and client**, must be **synchronous**, and are checked on every navigation — so keep them to regex/set membership. A matcher that awaits a database is not a slow matcher, it's a broken one.

TypeScript matchers can narrow:

```ts
export function match(param: string): param is 'apple' | 'orange' {
	return param === 'apple' || param === 'orange';
}
```

Matchers are ordinary modules, so unit-test them directly.

### Route sorting

When several routes match, priority runs: **specificity → matched parameters → plain parameters → optional/rest (lowest) → alphabetical** as the tiebreak.

```
src/routes/foo-abc/+page.svelte        1. /foo-abc
src/routes/foo-[c]/+page.svelte        2. /foo-def
src/routes/[[a=x]]/+page.svelte        3. matched optional
src/routes/[b]/+page.svelte            4. /bar
src/routes/[...catchall]/+page.svelte  5. /anything/else
```

Optional parameters in **layouts** are ignored for sorting — an `/admin` route does not inherit a `[[lang]]/+layout.svelte`.

## Route groups

`(name)` directories group routes without appearing in the URL:

```
src/routes/
├── (app)/         dashboard, settings — app layout
├── (marketing)/   about, pricing — marketing layout
└── +layout.svelte
```

`/dashboard` and `/about` are the URLs; each group brings its own `+layout.svelte` and can hold `+layout.server.ts` for a shared auth gate.

Good uses: separating app from marketing, differing auth requirements, distinct navigation. Don't reach for groups when a component or an `{#if}` would do — deep group nesting gets hard to follow.

## Breaking out of layouts

Append `@` plus the layout segment to reset inheritance. There is **no `export const layout = false`**.

```
+page@[id].svelte    inherit from the [id] layout
+page@item.svelte    inherit from the item layout
+page@(app).svelte   inherit from the (app) layout
+page@.svelte        inherit from the root layout only
```

Layouts can break out too — `item/+layout@.svelte` inherits from the root, and its children then inherit from it.

To reuse a layout's markup without its position in the tree, break out and compose:

```svelte
<!-- src/routes/nested/route/+layout@.svelte -->
<script>
	import ReusableLayout from '$lib/ReusableLayout.svelte';
	let { data, children } = $props();
</script>

<ReusableLayout {data}>{@render children()}</ReusableLayout>
```

## Character encoding

`[x+nn]` for a hex character code, `[u+nnnn]` for a Unicode code point — for characters the filesystem or router can't take literally.

```
src/routes/smileys/[x+3a]-[x+29]/+page.svelte   → /smileys/:-)
src/routes/[x+23]tag/+page.svelte               → /#tag
src/routes/[x+2e]well-known/change-password/    → /.well-known/change-password
src/routes/[u+d83e][u+dd2a]/+page.svelte        → /🤪
```

Common codes: `/` `2f` · `:` `3a` · `*` `2a` · `?` `3f` · `#` `23` · `%` `25` · `[` `5b` · `]` `5d` · `(` `28` · `)` `29` · `\` `5c`. Find any with `':'.charCodeAt(0).toString(16)`.

The leading `.` is encoded above because TypeScript struggles with dot-prefixed directory names.

## Errors

```svelte
<!-- src/routes/+error.svelte -->
<script>
	import { page } from '$app/state';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message ?? 'Something went wrong'}</p>
<a href="/">Go home</a>
```

**In SvelteKit 2 you do not `throw` `error()` or `redirect()`** — calling them is enough. (`throw error(...)` is SvelteKit 1 syntax; `npx sv migrate sveltekit-2` fixes it.)

```ts
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(307, '/login');

	const product = await db.product.findUnique({ where: { id: params.id } });
	if (!product) error(404, 'Product not found');
	if (!product.published) error(403, 'Not available');

	return { product };
};
```

`+error.svelte` files apply to their subtree, so a nested one overrides the root for those routes. Type the error shape via the `App.Error` interface. For custom 404s under a section, pair a `[...path]` route with an `error(404, …)` in its load.

To make error boundaries work during **server** rendering and route render failures through `handleError`, enable the `handleRenderingErrors` flag — see [experimental.md](experimental.md).

## Route guards

Put the check in the highest layout that needs it:

```ts
// src/routes/(app)/+layout.server.ts
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
	if (!locals.user) redirect(307, '/login');
	return { user: locals.user };
}
```

`locals` is populated in `handle` — see [ssr-hooks.md](ssr-hooks.md). Never authorize on `url`/`params` inside a [remote function](remote-functions.md); those describe the calling page and are client-controlled.

## Typed routes and URLs

SvelteKit generates a union of your real routes into `$app/types` (2.26+), so a typo in a link is a type error rather than a 404 you find in production.

```ts
import type { Asset, RouteId, Pathname, ResolvedPathname, RouteParams } from '$app/types';

type BlogParams = RouteParams<'/blog/[slug]'>;   // { slug: string }
```

`RouteId` types `page.route.id` and `event.route.id`; `Pathname` is every valid path; `ResolvedPathname` is the same possibly carrying a base path, which is what `page.url.pathname` gives you.

Build URLs with `resolve` and `asset` from `$app/paths` (both 2.26+) rather than string concatenation — they apply `paths.base`/`paths.assets` for you and are typed against the unions above:

```svelte
<script>
	import { resolve, asset } from '$app/paths';
</script>

<a href={resolve('/about')}>About</a>
<a href={resolve('/blog/[slug]', { slug: 'hello-world' })}>Hello world</a>
<img src={asset('/potato.jpg')} alt="a potato" />
```

**`base`, `assets` and `resolveRoute` are deprecated** in favour of these. Training data is full of `import { base } from '$app/paths'` and `<a href="{base}/about">`; that still works, but it's untyped and it's the old way.

Going the other direction, `match` (2.52+) turns a path back into a route ID and params:

```js
import { match } from '$app/paths';

const route = await match('/blog/hello-world');
if (route?.id === '/blog/[slug]') { /* route.params.slug */ }
```

## Navigation

```js
import { goto, invalidate, invalidateAll, beforeNavigate, afterNavigate, preloadData } from '$app/navigation';
import { page, navigating, updated } from '$app/state';
```

`$app/state` supersedes `$app/stores` (kit 2.12) — same values, no `$` prefix, and fine-grained, so `page.state` changes don't invalidate `page.data`. `$app/stores` is deprecated and slated for removal in SvelteKit 3; `npx sv migrate app-state` converts component usage.

```svelte
<script>
	import { navigating } from '$app/state';
</script>

{#if navigating.to}
	<div class="progress-bar"></div>
{/if}
```

`goto()` no longer accepts external URLs in kit 2 — use `window.location.href`.

Guard unsaved work:

```js
beforeNavigate((navigation) => {
	if (hasUnsavedChanges && !confirm('Discard changes?')) navigation.cancel();
});
```

### Link options

Set on any element to control its descendants:

```svelte
<div data-sveltekit-preload-data="hover">
	<a href="/blog">Blog</a>
</div>

<a href="/logout" data-sveltekit-reload>Log out</a>
<a href="/search" data-sveltekit-replacestate>Search</a>
<a href="/list" data-sveltekit-noscroll>Stay put</a>
<a href="/x" data-sveltekit-keepfocus>Keep focus</a>
```

`preload-data` fetches code *and* load data on hover or tap; `preload-code` fetches only the JS. This is usually the cheapest real performance win available.

## Snapshots

Ephemeral DOM state — scroll position, an unsubmitted comment — is thrown away on navigation. Export a `snapshot` object from a `+page.svelte` or `+layout.svelte` to keep it:

```svelte
<script lang="ts">
	import type { Snapshot } from './$types';

	let comment = $state('');

	export const snapshot: Snapshot<string> = {
		capture: () => comment,
		restore: (value) => (comment = value)
	};
</script>

<textarea bind:value={comment}></textarea>
```

`capture` runs immediately before the page updates and its return value is attached to the current history entry; `restore` runs with that value on the way back. It is persisted to `sessionStorage`, so it must be JSON-serializable and it survives a reload — and it is **retained for the whole session**, which is why what you capture should be the small thing the user would hate to retype, not the page's data.

## Shallow routing

Create history entries that don't navigate — the right tool for modals, galleries and drawers that must survive the back button.

```svelte
<script>
	import { pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';

	function showModal() {
		pushState('', { showModal: true });
	}
</script>

<button onclick={showModal}>open</button>

{#if page.state.showModal}
	<Modal onclose={() => history.back()} />
{/if}
```

Type the state via the `App.PageState` interface. Because the state lives in history, a hard reload of that URL must still render something sensible — build the route to work standalone, then use shallow routing as the enhancement.

## Server-side route resolution

By default the browser downloads a route manifest and resolves navigations locally. With many routes that manifest costs time on first load:

```js
kit: {
	router: { resolution: 'server' }
}
```

The server then resolves each not-yet-visited path. You trade a slightly slower first navigation to a new path (mitigate with preloading) for a smaller initial payload, a route list that isn't public, and the ability to intercept navigation server-side.
