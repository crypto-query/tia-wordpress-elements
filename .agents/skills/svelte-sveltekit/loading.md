---
title: "Loading data"
summary: "Universal vs server load, the load event, SvelteKit's fetch, parent data and waterfalls, streaming promises, invalidation, and how load data reaches components without going stale."
verified_against: "@sveltejs/kit 2.70.2"
mcp_sections: ["kit/load", "kit/state-management", "kit/page-options"]
---

# Loading data

## Universal vs server load

| | `+page.ts` / `+layout.ts` (universal) | `+page.server.ts` / `+layout.server.ts` (server) |
|---|---|---|
| Runs | server during SSR, client on navigation | server only |
| Can return | anything, incl. classes and functions | must be serializable (devalue) |
| Access to | `fetch`, `params`, `url`, `parent`, `depends` | + `cookies`, `locals`, `request`, `platform`, `clientAddress` |
| Use for | public APIs, non-serializable values | database, private env vars, secrets |

```js
/// file: src/routes/blog/[slug]/+page.js
export async function load({ params, fetch }) {
	const response = await fetch(`/api/posts/${params.slug}`);
	return { post: await response.json() };
}
```

```js
/// file: src/routes/blog/[slug]/+page.server.js
import * as db from '$lib/server/database';

export async function load({ params, locals }) {
	return { post: await db.getPost(params.slug), user: locals.user };
}
```

Both can exist for one route — the server load runs first and its result reaches the universal load as `data`.

### Load vs remote functions

[Remote functions](remote-functions.md) don't replace `load`. Keep in `load`: auth gates and redirects on route entry, data the route must have before rendering, and anything driving `depends`/`invalidate`. Move to remote functions: data a *component* needs, data fetched from several places (deduped automatically), and every mutation.

## The load event

```ts
// universal
{ params, route, url, data, fetch, setHeaders, parent, depends, untrack }

// server load adds
{ cookies, locals, platform, request, clientAddress, isDataRequest, isSubRequest }
```

`isDataRequest` is `true` when the browser is requesting data for a client-side navigation rather than a full page render — useful to skip work only needed for the initial HTML.

## Use the provided `fetch`

Always destructure `fetch` from the event rather than reaching for the global:

```js
export async function load({ fetch }) {
	const res = await fetch('/api/posts');  // relative URLs work
	return { posts: await res.json() };
}
```

You get: relative URL resolution, cookie and auth header forwarding, same-origin requests handled in-process (no HTTP round trip on the server), and responses inlined into the HTML so the client doesn't refetch during hydration. The global `fetch` gives you none of that.

## Parent data

```js
/// file: src/routes/profile/+layout.js
export async function load({ parent }) {
	const { user } = await parent();
	return { user, posts: await fetchPosts(user.id) };
}
```

**Start your own slow work before awaiting the parent**, or you serialize two independent requests:

```js
// ❌ waterfall
const parentData = await parent();
const data = await getData(params);

// ✅ overlapped
const data = getData(params);
const parentData = await parent();
return { ...parentData, ...(await data) };
```

Same principle within a single load — `Promise.all` over independent fetches:

```js
const [user, posts] = await Promise.all([fetchUser(), fetchPosts(params.userId)]);
```

> In kit 2, **top-level promises are no longer auto-awaited**. In kit 1 returning `{ response: fetch(url).then(r => r.json()) }` blocked; now it streams. Add `await` where you want the blocking behaviour back.

## Streaming

Return a promise instead of awaiting it, and the page renders immediately while the slow part arrives later:

```js
export async function load({ params }) {
	return {
		post: await db.getPost(params.slug),     // blocks — needed for first paint
		comments: db.getComments(params.slug),   // streams
		related: db.getRelatedPosts(params.slug) // streams, in parallel
	};
}
```

```svelte
<article>
	<h1>{data.post.title}</h1>
</article>

{#await data.comments}
	<p>Loading comments…</p>
{:then comments}
	{#each comments as comment}<div>{comment.text}</div>{/each}
{:catch error}
	<p>Failed: {error.message}</p>
{/await}
```

With [async Svelte](async-svelte.md) enabled you can `await data.comments` directly in markup inside a `<svelte:boundary>` instead of `{#await}`.

Three things that bite:

- **Unhandled rejections can take down the server.** Attach a `.catch(() => {})` to any streamed promise you don't otherwise handle. SvelteKit's `fetch` already does this for you.
- **Set headers before you return.** Once streaming starts the headers are gone; `setHeaders` inside a `.then()` is too late. Redirects have the same constraint.
- **Not every platform streams.** AWS Lambda buffers responses. Vercel and Cloudflare stream. Behind nginx you may need `proxy_buffering off;`.

## Getting load data into components

`data` is a prop. The trap is that **SvelteKit reuses components across navigations** — going from `/blog/a` to `/blog/b` updates `data` but does not re-run the `<script>`.

```svelte
<script>
	let { data } = $props();

	// ❌ computed once, never updates when you navigate to another post
	const wordCount = data.content.split(' ').length;

	// ❌ same bug — snapshots `data.items` at first render
	let items = $state(data.items);

	// ✅ tracks `data`
	let wordCount = $derived(data.content.split(' ').length);
	let sorted = $derived([...data.items].sort(byName));
</script>
```

Use `$state(data.x)` **only** when you deliberately want a detached local copy — a draft the user edits — and accept that a navigation won't refresh it. Everything else is `$derived`.

Don't mutate `data` either: `data.items.push(item)` mutates a prop. Derive, or hold a local `$state` copy.

To force a full remount on navigation:

```svelte
{#key page.url.pathname}
	<BlogPost {...data} />
{/key}
```

`PageProps` (2.16+) types both props at once:

```svelte
<script>
	/** @type {import('./$types').PageProps} */
	let { data, form } = $props();
</script>
```

## Keep load pure

`load` must have no side effects. Writing user data into a module-level store or variable puts one user's data somewhere every request can see it — on a long-lived server, Alice's data reaches Bob.

```js
// ❌ NEVER
import { user } from '$lib/user';
export async function load({ fetch }) {
	user.set(await (await fetch('/api/user')).json());
}

// ✅ return it
export async function load({ fetch }) {
	return { user: await (await fetch('/api/user')).json() };
}
```

Then pass it down as props, read it from `page.data`, or put it in [context](components.md) — never a shared module.

## Invalidation

```js
export async function load({ depends, fetch }) {
	depends('app:products');                 // custom key
	const res = await fetch('/api/products'); // URL tracked automatically
	return { products: await res.json() };
}
```

A load re-runs when: a `params` or `url` property it *read* changes, a `fetch`ed URL is invalidated, a declared `depends` key is invalidated, `parent()` data changed, or `invalidateAll()` is called.

```js
import { invalidate, invalidateAll } from '$app/navigation';

await invalidate('app:products');
await invalidate('/api/products');
await invalidate((url) => url.pathname.startsWith('/api/'));
await invalidateAll();
```

Wrap reads you *don't* want to create a dependency in `untrack`:

```js
export async function load({ url, untrack }) {
	if (untrack(() => url.pathname === '/')) { /* ... */ }
}
```

## Caching

```js
export async function load({ setHeaders }) {
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return { data: await fetchData() };
}
```

`setHeaders` is only meaningful on the server, and only for the initial render. Don't set `cache-control` on a response that contains user-specific data unless it's `private`.

## Page options

Set per route in `+page.ts` / `+page.server.ts` / `+layout.ts`; children inherit and may override.

```js
export const prerender = true;    // build-time HTML; 'auto' to also include in the manifest
export const ssr = false;         // client-only render
export const csr = false;         // ship no JS — the page is inert HTML
export const trailingSlash = 'always';

// generate dynamic routes for prerendering
export function entries() {
	return [{ slug: 'first-post' }, { slug: 'second-post' }];
}
```

`ssr = false` on a route makes it a SPA page — the HTML shell is served and everything renders client-side. `csr = false` removes JavaScript entirely, which is right for genuinely static content and wrong for anything interactive.

Prerendered pages can't use [`query`](remote-functions.md) remote functions — use `prerender` functions there.
