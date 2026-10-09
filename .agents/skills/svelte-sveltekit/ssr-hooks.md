---
title: "SSR, hooks and auth"
summary: "The request lifecycle: handle, handleFetch, handleError, handleValidationError, init, reroute and transport — plus auth patterns, cache headers, hydration and rendering modes."
verified_against: "@sveltejs/kit 2.70.2"
mcp_sections: ["kit/hooks", "kit/auth", "kit/@sveltejs-kit-hooks", "kit/page-options", "kit/observability"]
---

# SSR, hooks and auth

## Rendering modes

| Mode | Config | HTML from | JS shipped |
|---|---|---|---|
| SSR (default) | — | server, per request | yes, hydrates |
| Prerendered (SSG) | `export const prerender = true` | build time | yes, hydrates |
| SPA | `export const ssr = false` | shell only | yes, renders |
| Static | `export const csr = false` | server/build | none |

These are per-route and inherited by children, so a mostly-SSR app can prerender its marketing pages and run its dashboard as a SPA.

## Hooks

Three files. `src/hooks.server.js` (server only), `src/hooks.client.js` (browser only), `src/hooks.js` (universal — runs in both).

### `handle` — every request

```js
/// file: src/hooks.server.js
export async function handle({ event, resolve }) {
	event.locals.user = await getUser(event.cookies.get('sessionid'));

	const response = await resolve(event);
	response.headers.set('x-custom', 'value');
	return response;
}
```

This is where `event.locals` gets populated, and therefore where auth belongs.

Compose several with `sequence` — they nest, and with tracing enabled each appears as a child span of the root `handle`:

```js
import { sequence } from '@sveltejs/kit/hooks';

export const handle = sequence(authHandle, loggingHandle);
```

Short-circuit by returning a `Response` instead of calling `resolve`:

```js
if (event.url.pathname.startsWith('/custom')) {
	return new Response('Custom response');
}
```

`resolve` takes options:

```js
return resolve(event, {
	transformPageChunk: ({ html, done }) =>
		done ? html.replace('</body>', '<script>/* analytics */</script></body>') : html,

	filterSerializedResponseHeaders: (name) => name.startsWith('x-'),

	preload: ({ type, path }) => type === 'js' || type === 'css'
});
```

`transformPageChunk` is called per chunk while streaming — check `done` before doing anything that needs the whole document. `preload` defaults to js and css; adding fonts helps or hurts depending on how many you have.

### `handleFetch` — server-side fetch

Intercepts `fetch` calls made inside `load` and endpoints:

```js
export async function handleFetch({ event, request, fetch }) {
	// route public API calls to an internal address
	if (request.url.startsWith('https://api.example.com/')) {
		request = new Request(
			request.url.replace('https://api.example.com/', 'http://localhost:9999/'),
			request
		);
	}

	// forward credentials to a subdomain (cookies aren't sent cross-origin)
	if (request.url.startsWith('https://api.mydomain.com/')) {
		const cookie = event.request.headers.get('cookie');
		if (cookie) request.headers.set('cookie', cookie);
	}

	return fetch(request);
}
```

Be deliberate about that second pattern — you are forwarding the user's credentials to another host.

### `handleError` — unexpected errors

Runs for errors you didn't create with `error()`. Its job is to **report** the error and **return a safe shape** for the client.

```js
export async function handleError({ error, event, status, message }) {
	await errorTracker.capture(error, { user: event.locals.user, url: event.url.href });

	return { message: 'An error occurred', code: generateErrorCode() };
}
```

`status` and `message` are kit 2 additions: for a thrown exception the status is `500` and the message is `Internal Error`. **`message` is safe to show; `error.message` is not** — it can carry secrets.

The return value must satisfy `App.Error`:

```ts
/// file: src/app.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
			code: string;
		}
		interface Locals {
			user: User | null;
		}
		interface PageState {
			showModal?: boolean;
		}
		interface Platform {}
	}
}

export {};
```

`src/hooks.client.js` exports its own `handleError` for browser-side failures.

### `handleValidationError`

Shapes the 400 returned when a [remote function](remote-functions.md) argument fails schema validation:

```js
/** @type {import('@sveltejs/kit').HandleValidationError} */
export function handleValidationError({ event, issues }) {
	return { message: 'Bad request' };
}
```

Don't echo `issues` back — a failure here means either a stale client or someone probing your endpoints.

### `init`

Runs once before the server handles its first request — the place for database connections or other one-time setup.

```js
export async function init() {
	await db.connect();
}
```

For tracing setup you want `src/instrumentation.server.ts` instead, which runs before app code is even imported. See [experimental.md](experimental.md).

### `reroute` — universal

Map a URL onto a different route without changing what the user sees:

```js
/// file: src/hooks.js
const translated = {
	'/de/ueber-uns': '/de/about',
	'/fr/a-propos': '/fr/about'
};

export function reroute({ url }) {
	if (url.pathname in translated) return translated[url.pathname];
}
```

Since 2.18 it can be async and receives `fetch` — useful for CMS-driven slugs, at the cost of a request per unresolved navigation:

```js
export async function reroute({ url, fetch }) {
	const api = new URL('/api/reroute', url);
	api.searchParams.set('pathname', url.pathname);
	return (await fetch(api).then((r) => r.json())).pathname;
}
```

### `transport` — universal

Teach SvelteKit to send your own classes across the server/client boundary. This applies to `load` return values **and** [remote function](remote-functions.md) arguments and results.

```js
/// file: src/hooks.js
import { Vector } from '$lib/math';

export const transport = {
	Vector: {
		encode: (value) => value instanceof Vector && [value.x, value.y],
		decode: ([x, y]) => new Vector(x, y)
	}
};
```

`encode` returns a falsy value for anything it doesn't handle.

## Authentication

Put session resolution in `handle`, the gate in a layout load.

```js
/// file: src/hooks.server.js
export async function handle({ event, resolve }) {
	const sessionId = event.cookies.get('sessionid');
	event.locals.user = sessionId ? await db.getUserBySession(sessionId) : null;
	return resolve(event);
}
```

```js
/// file: src/routes/(app)/+layout.server.js
import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
	if (!locals.user) redirect(307, `/login?redirectTo=${url.pathname}`);
	return { user: locals.user };
}
```

Cookie settings that matter:

```js
cookies.set('sessionid', id, {
	path: '/',          // required in kit 2
	httpOnly: true,     // not readable from JS
	secure: true,       // HTTPS only
	sameSite: 'lax',    // CSRF mitigation; 'strict' breaks inbound links
	maxAge: 60 * 60 * 24 * 7
});
```

Rules that are easy to get wrong:

- **A layout load guards only its subtree.** `+server.js` endpoints and form actions under it are *not* covered — check `locals.user` in each.
- **After an action changes the session cookie, update `event.locals` too.** `handle` doesn't re-run before the post-action `load`.
- **Never authorize on `url`/`params` inside a remote function** — they describe the calling page and are client-supplied.
- Prefer a real auth library (`npx sv add better-auth`) over hand-rolled sessions.

### CSRF

SvelteKit checks the `origin` header on `POST`/`PUT`/`PATCH`/`DELETE` form submissions, in production only.

```js
kit: {
	csrf: {
		trustedOrigins: ['https://payment-gateway.com']
	}
}
```

`checkOrigin` is deprecated in favour of `trustedOrigins`. `['*']` trusts everything and disables the protection — only for origins you fully control.

## Caching

```js
export async function load({ setHeaders }) {
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return { data: await fetchData() };
}
```

```js
// conditional on who's asking
setHeaders({
	'cache-control': locals.user ? 'private, no-cache' : 'public, max-age=3600'
});
```

ETags let you skip sending a body that hasn't changed:

```js
/// file: +server.js
export async function GET({ request, setHeaders }) {
	const data = await getData();
	const etag = `"${hash(JSON.stringify(data))}"`;

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304 });
	}

	setHeaders({ etag, 'cache-control': 'public, max-age=0, must-revalidate' });
	return json(data);
}
```

**Never cache a response containing user-specific data as `public`.** When in doubt, `private`.

## Hydration

The server renders HTML, the client attaches to it. A **hydration mismatch** happens when the client's first render disagrees with the server's markup — the usual causes:

- `Date.now()`, `Math.random()`, or a timezone-dependent format rendered in the template
- reading `window`/`localStorage` during component init
- markup that depends on viewport width

Fix by rendering the deterministic version first and correcting in an `$effect` (which never runs on the server), or by using [`hydratable`](async-svelte.md) for values that must be stable across both.

Invalid HTML nesting is the other classic cause — the browser silently repairs `<div>` inside `<p>`, so the DOM stops matching what the server sent.

## Observability

With `kit.experimental.tracing.server`, SvelteKit emits OpenTelemetry spans for `handle` (including each `sequence` member), server-side `load` functions, form actions, and remote functions. Annotate them via `event.tracing.root` / `event.tracing.current`. Setup lives in [experimental.md](experimental.md).
