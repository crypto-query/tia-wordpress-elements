---
title: "Adapters and deployment"
summary: "Choosing and configuring adapter-auto, -node, -static, -vercel, -cloudflare and -netlify; SPA mode; platform bindings; and writing a custom adapter."
verified_against: "@sveltejs/kit 2.70.2, adapter-node 5.5.7, adapter-static 3.0.10, adapter-vercel 6.3.4, adapter-cloudflare 7.2.9, adapter-netlify 6.0.4, adapter-auto 7.0.1"
mcp_sections: ["kit/adapters", "kit/adapter-node", "kit/adapter-static", "kit/adapter-vercel", "kit/adapter-cloudflare", "kit/single-page-apps", "kit/writing-adapters", "kit/project-types"]
---

# Adapters and deployment

An adapter turns the build output into something a given platform can run. One per project, in `svelte.config.js`.

```js
import adapter from '@sveltejs/adapter-node';

export default {
	kit: { adapter: adapter({ /* options */ }) }
};
```

## Choosing

| Target | Adapter |
|---|---|
| Not decided yet / CI detects it | `adapter-auto` |
| Own server, Docker, Fly, Railway, Google Cloud Run | `adapter-node` |
| Fully static site, GitHub Pages, S3 | `adapter-static` |
| SPA (no server logic) | `adapter-static` with `fallback` |
| Vercel | `adapter-vercel` |
| Cloudflare Workers or Pages | `adapter-cloudflare` |
| Netlify | `adapter-netlify` |

`npx sv add sveltekit-adapter` installs and wires one up.

**`adapter-auto` takes no options.** As soon as you need `{ edge: true }`, ISR, or a runtime setting, install the concrete adapter. Doing so also gets you `event.platform` emulation in dev, automatic type declarations, and a lockfile entry that speeds up CI.

## adapter-node

```js
import adapter from '@sveltejs/adapter-node';

export default {
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true,
			envPrefix: ''
		})
	}
};
```

```sh
npm run build
node build
```

Configured entirely through environment variables at **run** time:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | bind address |
| `PORT` | `3000` | port |
| `ORIGIN` | — | the public URL; **set this** |
| `PROTOCOL_HEADER` / `HOST_HEADER` | — | e.g. `x-forwarded-proto` / `x-forwarded-host` |
| `PORT_HEADER` | — | behind a proxy on a nonstandard port |
| `ADDRESS_HEADER` | — | where `clientAddress` comes from |
| `XFF_DEPTH` | `1` | trusted proxy count for `x-forwarded-for` |
| `BODY_SIZE_LIMIT` | `512K` | `K`/`M`/`G` suffixes, or `Infinity` |
| `SHUTDOWN_TIMEOUT` | `30` | seconds before force-closing connections |
| `IDLE_TIMEOUT` | — | seconds before self-shutdown (socket activation) |

**Set `ORIGIN`** (or the `*_HEADER` pair) behind a reverse proxy — without it, form actions fail CSRF checks because SvelteKit can't tell what its own origin is. This is the single most common adapter-node deployment failure.

```sh
ORIGIN=https://my.site PORT=4000 node build
```

`envPrefix` avoids collisions on hosts that already define `PORT`:

```sh
MY_APP_PORT=4000 MY_APP_ORIGIN=https://my.site node build
```

Graceful shutdown on `SIGINT`/`SIGTERM`: stop accepting connections, wait for in-flight requests, emit `sveltekit:shutdown`, then force-close after `SHUTDOWN_TIMEOUT`.

To wrap the server in Express/Polka, import the generated handler:

```js
import { handler } from './build/handler.js';
import express from 'express';

const app = express();
app.get('/healthz', (req, res) => res.end('ok'));
app.use(handler);
app.listen(3000);
```

Dockerfile essentials: build with dev dependencies present, then run `node build` with `PORT`/`HOST`/`ORIGIN` set and only production dependencies.

## adapter-static

```js
import adapter from '@sveltejs/adapter-static';

export default {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined,
			precompress: false,
			strict: true
		})
	}
};
```

Every route must be prerenderable, so set it at the root:

```js
/// file: src/routes/+layout.js
export const prerender = true;
```

Constraints that follow: no server `load` at request time, no form actions, no `+server.js` endpoints answering live traffic, and **no `query` remote functions** — use `prerender` remote functions instead.

Routes with required `[params]` need `entries()` to tell the crawler what to build:

```js
export function entries() {
	return [{ slug: 'first-post' }, { slug: 'second-post' }];
}
```

`strict: true` fails the build when a route wasn't prerendered — keep it on. Tune what happens on other prerender problems via `kit.prerender.handleHttpError`, `handleMissingId`, `handleUnseenRoutes` and `handleInvalidUrl`, each accepting `'fail' | 'ignore' | 'warn'` or a function.

For **GitHub Pages**, set `paths.base` to the repo name and add `.nojekyll` to `static/`.

### SPA mode

```js
adapter({ fallback: '200.html' })
```

```js
/// file: src/routes/+layout.js
export const ssr = false;
```

The fallback name is host-specific (`200.html` on Surge, `index.html` elsewhere — avoid `index.html` where you also prerender). On Apache, add a `static/.htaccess` rewriting unmatched paths to it.

SPA mode costs real performance — a blank document, then JS, then data, before anything renders — and it harms SEO and breaks entirely without JS. Prerender everything you can, especially the homepage; if you can prerender it all, use plain static generation instead.

An SPA is also the way into a **native shell** — Tauri or Capacitor for mobile, Tauri/Wails/Electron for desktop, `adapter-static` for a browser extension. These serve the built app from a local web server, and Capacitor's speaks HTTP/1, so set [`bundleStrategy: 'single'`](config.md) to keep the request count down. Same trick on embedded devices.

## adapter-vercel

```js
import adapter from '@sveltejs/adapter-vercel';

export default {
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			regions: ['iad1'],
			memory: 1024,
			maxDuration: 60,
			isr: {
				expiration: 60,
				bypassToken: process.env.BYPASS_TOKEN,
				allowQuery: ['search']
			}
		})
	}
};
```

Options can be set per route by exporting `config` from `+page.server.js` / `+layout.server.js` / `+server.js`:

```js
export const config = { runtime: 'edge', regions: ['iad1'] };
```

The edge runtime is fast to start but has no Node APIs — no `fs`, and many npm packages won't run. ISR (`expiration`) serves a cached render and revalidates in the background; anything user-specific must not be ISR-cached.

## adapter-cloudflare

Covers **both** Workers and Pages, and supports all SvelteKit features.

```js
import adapter from '@sveltejs/adapter-cloudflare';

export default {
	kit: {
		adapter: adapter({
			config: undefined,
			platformProxy: { configPath: undefined, environment: undefined, persist: undefined },
			fallback: 'plaintext',
			routes: { include: ['/*'], exclude: ['<all>'] }
		})
	}
};
```

> `@sveltejs/adapter-cloudflare-workers` is **deprecated** (it targets the old Workers Sites). Migrate by swapping the import and replacing `site.bucket` with `assets.directory` + `assets.binding` in your Wrangler config.

`wrangler.jsonc` for Workers:

```jsonc
{
	"name": "my-app",
	"main": ".svelte-kit/cloudflare/_worker.js",
	"compatibility_flags": ["nodejs_als"],
	"compatibility_date": "2026-01-01",
	"assets": { "binding": "ASSETS", "directory": ".svelte-kit/cloudflare" }
}
```

**`nodejs_als` is required** — SvelteKit needs `AsyncLocalStorage` (this is what makes `getRequestEvent()` work after an `await`). On Pages, add it under project settings → Runtime, or via `compatibility_flags`.

Bindings arrive on `platform`:

```js
export async function POST({ request, platform }) {
	const value = await platform.env.MY_KV.get('key');
	const country = platform.cf?.country;
	platform.ctx.waitUntil(logAsync());
}
```

Type them in `src/app.d.ts` using `@cloudflare/workers-types`. Still prefer `$env/static/private` over `platform.env` for plain environment variables.

Cloudflare specifics:

- **No `fs`.** Use `read` from `$app/server`, or prerender the route.
- `_headers` and `_redirects` in the project root affect **static assets only** — dynamic responses need `handle` or endpoint headers.
- Add `nodejs_compat` if a dependency needs Node built-ins.
- The worker is bundled into one file with a size limit; import large libraries client-side only if you hit it.
- Pages' `/functions` directory is ignored — write `+server.js` endpoints instead.
- `routes.include`/`exclude` are Pages-only, capped at 100 combined rules. If `<prerendered>` blows the cap, replace it with a wildcard like `/articles/*`.

## adapter-netlify

```js
adapter({ edge: false, split: false })
```

`split: true` gives one function per route (better cold starts, more functions). `edge: true` uses Deno-based edge functions. `netlify.toml` needs a `build.publish` of `build` and `build.command` of `npm run build`.

## Platform context

Whatever the adapter exposes arrives as `event.platform`, typed through the `App.Platform` interface in `src/app.d.ts`. Anything you read there ties you to that platform — keep it behind a small module so swapping hosts is one file.

## Custom adapters

```js
/** @returns {import('@sveltejs/kit').Adapter} */
export default function () {
	return {
		name: 'my-adapter',
		async adapt(builder) {
			builder.rimraf('build');
			builder.writeClient('build/client');
			builder.writePrerendered('build/prerendered');
			builder.writeServer('build/server');
			// emit a manifest and a platform entry point
		}
	};
}
```

`builder` also gives you `builder.routes`, `builder.generateManifest()`, `builder.compress()` and `builder.getBuildDirectory()`. Look at `adapter-node` as the reference implementation.

## Deployment checklist

- The right adapter is a direct dependency, not `adapter-auto`.
- `ORIGIN` (or `PROTOCOL_HEADER`/`HOST_HEADER`) set for adapter-node behind a proxy.
- Private env vars configured on the platform, and not reachable from `$env/static/public`.
- `csrf.trustedOrigins` lists any third party that posts forms to you.
- Prerendered routes actually built (`strict: true` will tell you).
- Streaming works on the target — Lambda buffers; nginx may need `proxy_buffering off`.
- If you enabled `instrumentation.server`, confirm the adapter and platform support it.
