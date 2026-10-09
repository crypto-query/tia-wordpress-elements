---
title: "Service workers"
summary: "src/service-worker.js, the $service-worker module, precaching build output, update semantics, and when to reach for vite-pwa instead."
verified_against: "@sveltejs/kit 2.70.2"
mcp_sections: ["kit/service-workers", "kit/$service-worker", "kit/configuration"]
---

# Service workers

A proxy between your app and the network. Offline support is the headline use, but the everyday win is **precaching your built JS and CSS** so navigation costs nothing — worth doing even in apps that can never work offline.

`src/service-worker.js` (or `src/service-worker/index.js`) is bundled and registered automatically. No wiring needed.

## `$service-worker`

```js
import { base, build, files, prerendered, version } from '$service-worker';
```

| Export | What it holds |
|---|---|
| `build` | the app's own JS/CSS — content-hashed, so cacheable forever |
| `files` | everything in `static/` |
| `prerendered` | pathnames of prerendered pages |
| `version` | `kit.version.name` — the natural cache key |
| `base` | the deployment's base path |

`kit.serviceWorker.files` filters what lands in `files` (default excludes `.DS_Store`).

## A working cache

Precache the build on install, drop stale caches on activate, then network-first with a cache fallback:

```js
/// file: src/service-worker.js
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const self = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (globalThis.self));

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
		})()
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	event.respondWith(
		(async () => {
			const url = new URL(event.request.url);
			const cache = await caches.open(CACHE);

			if (ASSETS.includes(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}

			try {
				const response = await fetch(event.request);

				// offline `fetch` can resolve to a non-Response instead of throwing
				if (!(response instanceof Response)) throw new Error('invalid response');

				if (response.status === 200 && !response.headers.get('cache-control')?.includes('no-store')) {
					cache.put(event.request, response.clone());
				}

				return response;
			} catch (err) {
				const hit = await cache.match(event.request);
				if (hit) return hit;
				throw err;
			}
		})()
	);
});
```

The triple-slash references are load-bearing: they swap DOM typings for webworker ones and type the `$service-worker` import.

**The `no-store` check is not optional.** A cached [`query.live`](remote-functions.md) response keeps streaming after the page closes, because the clone never ends.

## Updates

Browsers check for a new service worker on **full-page navigation**, not on client-side navigation — so moving around your SPA will never pick up a new deployment on its own. SvelteKit calls `registration.update()` only during error recovery: a route module fails to load, and [version polling](config.md) shows the app was redeployed.

To check more eagerly, do it yourself in the root layout:

```js
import { afterNavigate } from '$app/navigation';

afterNavigate(async () => {
	const registration = await navigator.serviceWorker?.getRegistration();
	await registration?.update();
});
```

A new worker still installs in the background and only takes over once **every** tab under the old one closes — reloading the page you're on is not enough.

## Manual registration

```js
kit: {
	serviceWorker: {
		register: false,
		files: (filename) => !/\.DS_Store/.test(filename)
	}
}
```

Then register it yourself, matching SvelteKit's own default:

```js
import { dev } from '$app/environment';

if ('serviceWorker' in navigator) {
	addEventListener('load', () => {
		navigator.serviceWorker.register('./path/to/service-worker.js', {
			type: dev ? 'module' : 'classic'
		});
	});
}
```

## Gotchas

- **`build` and `prerendered` are empty arrays in dev**, and the worker isn't bundled there. Test caching against `npm run preview`.
- **Stale beats absent only sometimes.** For prices, availability and anything transactional, failing is better than serving yesterday's answer.
- **Browsers evict caches that grow too large**, taking your precached shell with them — keep video and large media out.
- `version` as the cache key means a redeploy invalidates everything; that's the intent, so don't hand-roll a cleverer key.
- For Workbox conventions and generated manifests, [vite-pwa](https://vite-pwa-org.netlify.app/frameworks/sveltekit.html) is the better fit than hand-writing the above.
