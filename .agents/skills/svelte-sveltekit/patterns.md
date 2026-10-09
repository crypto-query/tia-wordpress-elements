---
title: "Worked patterns"
summary: "End-to-end reference implementations that span several files — layout shells, session auth, paginated lists, URL-bound search, validated create forms, and shallow-routed modals."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8"
mcp_sections: ["kit/routing", "kit/auth", "kit/hooks", "kit/load", "kit/form-actions", "kit/shallow-routing", "kit/state-management"]
---

# Worked patterns

Each concept file explains one surface. This one glues them together: complete, multi-file implementations of things people actually build. Markup is deliberately unstyled — the pattern is the point.

## Layout shell with route groups

Route groups give a section its own layout and auth posture without appearing in the URL. `(marketing)` and `(app)` here are both at `/`:

```
src/routes/
├── +layout.svelte              root: global CSS, <html> furniture
├── (marketing)/
│   ├── +layout.svelte          public nav + footer
│   └── +page.svelte            /
└── (app)/
    ├── +layout.server.ts       one auth guard for everything below
    ├── +layout.svelte          sidebar chrome
    └── dashboard/+page.svelte  /dashboard
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
```

**Import global CSS exactly once, in the root layout.** SvelteKit then emits it into `<head>` and the browser blocks render until it loads, so there's no flash of unstyled content. Importing it in a `+page.svelte` instead means the page renders before its own stylesheet arrives.

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script>
	let { children, data } = $props();
</script>

<div class="shell">
	<aside>
		<a href="/dashboard">Dashboard</a>
		<a href="/settings">Settings</a>
	</aside>
	<main>{@render children()}</main>
</div>
```

To escape the layout chain for one route, rename the file rather than reaching for config: `+page@.svelte` resets to the root layout, `+page@(app).svelte` resets to `(app)`'s. See [routing.md](routing.md).

## Session auth, end to end

Four files. The hook resolves the session once per request; everything downstream reads `locals`.

```ts
// src/app.d.ts
declare global {
	namespace App {
		interface Locals {
			user: { id: string; email: string } | null;
		}
	}
}

export {};
```

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');
	event.locals.user = token ? await validateSession(token) : null;

	return resolve(event);
};
```

```ts
// src/routes/(app)/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	return { user: locals.user };
};
```

`redirect()` and `error()` are **called, not thrown** — they throw internally. `throw redirect(...)` is SvelteKit 1.

```ts
// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { createSession, verifyCredentials } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions = {
	login: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '');

		const user = await verifyCredentials(email, String(data.get('password') ?? ''));
		if (!user) {
			// `fail` preserves what the user typed — never echo the password back
			return fail(400, { email, error: 'Invalid credentials' });
		}

		cookies.set('session', await createSession(user.id), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7
		});

		redirect(303, url.searchParams.get('redirectTo') ?? '/dashboard');
	}
} satisfies Actions;
```

Two things this pattern gets right that most don't:

- **The layout guard protects pages, not endpoints.** A `+server.ts` or an action *beside* the protected pages is reachable without passing through `+layout.server.ts`. Authorize in each handler that mutates.
- **`path` is required** on `cookies.set` in kit 2, and the `secure` flag makes cookies vanish on plain-HTTP localhost — kit exempts localhost, but proxies in front of dev servers sometimes don't.

## Paginated list with "load more"

`load` renders the first page on the server (so it's indexable); the client appends subsequent pages. The trick is to **derive** the visible list rather than copying `data` into `$state` — copying is the staleness bug in [loading.md](loading.md), and the compiler warns about it.

```ts
// src/routes/posts/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/posts?page=1');

	return await res.json(); // { posts, hasMore }
};
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script>
	let { data } = $props();

	let extraPages = $state([]);
	let loading = $state(false);
	let exhausted = $state(false);

	// server-rendered first page + everything appended since
	let posts = $derived([data.posts, ...extraPages].flat());
	let hasMore = $derived(!exhausted && data.hasMore);

	async function loadMore() {
		if (loading || !hasMore) return;
		loading = true;

		const res = await fetch(`/api/posts?page=${extraPages.length + 2}`);
		const next = await res.json();

		extraPages = [...extraPages, next.posts];
		exhausted = !next.hasMore;
		loading = false;
	}

	// attachments never run on the server, so no `browser` guard is needed
	function sentinel(node) {
		const io = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) loadMore();
		});
		io.observe(node);
		return () => io.disconnect();
	}
</script>

{#each posts as post (post.id)}
	<article>
		<h2><a href="/posts/{post.slug}">{post.title}</a></h2>
		<p>{post.excerpt}</p>
	</article>
{/each}

{#if hasMore}
	<div {@attach sentinel}>{loading ? 'Loading…' : 'Scroll for more'}</div>
{/if}
```

The tradeoff: scroll position isn't restorable from a cold load, because the appended pages aren't in the URL. If that matters, either put `page` in the URL and have the endpoint return the accumulated range, or use a `query` remote function, which handles the caching for you — [remote-functions.md](remote-functions.md).

## Search bound to the URL

Filters belong in the URL: shareable, restorable, and the server can render them.

```svelte
<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	// seeded from the URL, and re-seeded whenever it changes
	let q = $derived(page.url.searchParams.get('q') ?? '');

	let timer;
	function search(value) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const params = new URLSearchParams(page.url.searchParams);
			value ? params.set('q', value) : params.delete('q');
			goto(`?${params}`, { replaceState: true, keepFocus: true, noScroll: true });
		}, 250);
	}
</script>

<input value={q} oninput={(e) => search(e.currentTarget.value)} placeholder="Search" />

{#each data.results as result (result.id)}
	<a href={result.href}>{result.title}</a>
{/each}
```

`replaceState: true` keeps every keystroke out of the history stack; `keepFocus: true` stops the navigation from blurring the input. `page` comes from `$app/state` — `$app/stores` and `$page` are the deprecated spelling.

## Create form, validated on the server

The stable path. Progressive enhancement means this works before hydration and gets better after.

```ts
// src/routes/items/new/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });

		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();

		if (!title) return fail(400, { title, missing: true });

		const item = await db.items.create({ title, ownerId: locals.user.id });
		redirect(303, `/items/${item.id}`);
	}
} satisfies Actions;
```

```svelte
<!-- src/routes/items/new/+page.svelte -->
<script>
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<form
	method="POST"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<label>
		Title
		<input name="title" value={form?.title ?? ''} required />
	</label>
	{#if form?.missing}<p>Title is required</p>{/if}

	<button disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
</form>
```

`enhance` is an **action** — `use:enhance={callback}`. It is not a function you call to build one. The callback runs before submit; its returned function runs after, and calling `update()` is what applies the result. Omit `update()` and the form appears to do nothing.

The remote-function equivalent collapses these two files into one `form` export with schema validation attached — [remote-functions.md](remote-functions.md).

## Modal via shallow routing

A photo or detail modal that has a URL, survives back/forward, but doesn't force a full navigation when opened from the list.

```svelte
<script>
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	function preview(event, item) {
		if (innerWidth < 640) return; // let small screens navigate properly
		event.preventDefault();
		pushState(`/items/${item.id}`, { selected: item });
	}
</script>

{#each data.items as item (item.id)}
	<a href="/items/{item.id}" onclick={(e) => preview(e, item)}>{item.title}</a>
{/each}

{#if page.state.selected}
	<dialog open>
		<h2>{page.state.selected.title}</h2>
		<button onclick={() => history.back()}>Close</button>
	</dialog>
{/if}
```

Type `page.state` through `App.PageState` in `app.d.ts`. The `/items/[id]` route must still render standalone — shallow routing is an enhancement, and a hard reload or a shared link lands on the real page.

## Architecture checklist

- Reads in `load`, writes in actions or remote functions. A `load` that mutates runs on every invalidation.
- Every route that renders user data has an auth check on the *server*, not only in the layout.
- Anything derived from `data` uses `$derived`, not `$state` — [loading.md](loading.md).
- Filters, sorting and pagination live in the URL.
- Secrets are imported from `$lib/server` or `$env/static/private`, never passed through `load` return values.
- Forms work with JavaScript disabled before you enhance them.
