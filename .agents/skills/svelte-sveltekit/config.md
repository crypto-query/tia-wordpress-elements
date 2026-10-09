---
title: "Configuration and project setup"
summary: "svelte.config.js and the Vite-plugin alternative, environment variables, aliases, CSP/CSRF, router and bundle options, version management, and project structure."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8, sv 0.17.0"
mcp_sections: ["kit/configuration", "kit/environment-variables", "kit/$app-env-private", "kit/@sveltejs-kit-env", "kit/project-structure", "kit/@sveltejs-kit-vite"]
---

# Configuration and project setup

## Creating a project

```sh
npx sv create my-app
cd my-app
npm install
npm run dev
```

`npm create svelte@latest` is retired — `sv` is the CLI. Add features to an existing project with `sv add`:

```sh
npx sv add tailwindcss drizzle playwright vitest eslint prettier
npx sv add better-auth paraglide mdsvex storybook
npx sv add experimental="features:async,remoteFunctions"
```

Other `sv` commands: `sv check` (types, a11y, unused CSS — use this in CI), `sv migrate <target>` (`svelte-5`, `sveltekit-2`, `app-state`, `self-closing-tags`).

Publishing a component library rather than shipping an app is a different build: `svelte-package` emits uncompiled `.svelte` files plus ESM JavaScript and types, and any preprocessing (TypeScript, SCSS) is resolved for consumers. See the `kit/packaging` MCP section.

## Project structure

```
my-app/
├── src/
│   ├── lib/
│   │   ├── server/          server-only; importing this from client code is a build error
│   │   └── components/
│   ├── params/              route matchers
│   ├── routes/
│   ├── app.html             %sveltekit.head% / %sveltekit.body% / %sveltekit.nonce%
│   ├── app.d.ts             App.Locals, App.Error, App.PageState, App.Platform
│   ├── hooks.server.ts
│   ├── hooks.client.ts
│   ├── hooks.ts             universal: reroute, transport
│   ├── instrumentation.server.ts   (with the instrumentation flag)
│   └── env.ts               (with explicitEnvironmentVariables)
├── static/                  served as-is from the root
├── svelte.config.js
└── vite.config.js
```

**`$lib/server` is enforced, not a convention.** SvelteKit fails the build if client-reachable code imports from it — the cheapest secret-leak protection available.

## Where config lives

The classic location:

```js
/// file: svelte.config.js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: { $components: 'src/lib/components' }
	}
};

export default config;
```

Since **2.62** it can go in the Vite plugin instead, alongside compiler options:

```js
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-auto';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: { experimental: { async: true } },
			adapter: adapter(),
			experimental: { remoteFunctions: true }
		})
	]
});
```

The `kit` namespace flattens up one level here. **If config is defined via the plugin, `svelte.config.js` is ignored entirely** — the two do not merge. Non-SvelteKit options pass through to `vite-plugin-svelte`.

`vitePreprocess` comes from `@sveltejs/vite-plugin-svelte`; kit 2 no longer re-exports it from `@sveltejs/kit/vite`.

## Aliases

```js
kit: {
	alias: {
		'my-file': 'path/to/my-file.js',   // a file
		'my-directory': 'path/to/dir',     // a directory and its contents
		'my-directory/*': 'path/to/dir/*'  // contents only
	}
}
```

Run `npm run dev` once to have SvelteKit write them into the generated `tsconfig.json`. **Don't set `paths` or `baseUrl` in your own `tsconfig.json`** — kit 2 warns, because those only teach TypeScript about the alias, not the bundler. Use `kit.alias`, which does both.

## Environment variables

Four modules, split on two axes — static (baked into the build output at build time, tree-shakeable) vs dynamic (read at runtime), and public vs private:

```js
import { API_KEY } from '$env/static/private';    // build time, server only
import { PUBLIC_URL } from '$env/static/public';  // build time, safe for the client
import { env } from '$env/dynamic/private';       // run time, server only
import { env as pub } from '$env/dynamic/public'; // run time, client-visible
```

The `PUBLIC_` prefix is what makes a variable client-visible; configure it with `kit.env.publicPrefix` / `privatePrefix`. Variables matching neither prefix are discarded.

**`$env/static/private` bakes the literal value into the build artifact.** The guard against the *client* bundle still holds, but the secret is now a plain string in `build/server/…`, so the artifact needs the same handling as the vault it came from, and rotating a key means a rebuild rather than a restart. **Read secrets through `$env/dynamic/private`**, and keep the static modules for values that are safe to ship anyway — feature flags, public URLs, anything worth tree-shaking.

**Dynamic env vars cannot be read during prerendering** (kit 2) — at build time there is no runtime value to read. Use the static modules there.

### Explicit environment variables

Since **2.63**, behind `kit.experimental.explicitEnvironmentVariables`. Variables are declared once in `src/env.ts`, `$env/*` is replaced by `$app/env/private` and `$app/env/public`, and `$app/environment` is renamed `$app/env`. The docs commit to this becoming the default in **SvelteKit 3, where all four `$env/*` modules and `$app/environment` are removed** — so it is what new code should be written against ([migration.md](migration.md)).

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
	API_KEY: {},
	CACHE_TTL_SECONDS: { description: 'How long to cache responses, in seconds' },
	GOOGLE_ANALYTICS_ID: {
		public: true,
		schema: v.pipe(v.string(), v.regex(/G-[A-Z0-9]+/))
	}
});
```

Each value is an `EnvVarConfig`. The defaults are **private and dynamic**, so `API_KEY: {}` is a complete declaration — importable from `$app/env/private`, which the build refuses to let into browser code. Three keys change that:

| Key | Effect |
|---|---|
| `public: true` | importable from `$app/env/public`, and usable in `app.html` as `%sveltekit.env.GOOGLE_ANALYTICS_ID%` |
| `static: true` | inlined at build time, so `{#if SHOW_DEBUG_OVERLAY}` drops the branch from the bundle — and on a private variable, bakes the literal into the artifact |
| `schema` | any Standard Schema validator (Zod, Valibot); also where a value is made optional, or coerced to a boolean or number |

`description` documents the variable and shows on hover at the import site. `defineEnvVars` returns its argument unaltered — it exists for the types.

Note which way round the defaults sit: **dynamic unless you ask for inlining**, and the `PUBLIC_` prefix convention is gone entirely.

**An invalid value fails the app at start *and* at build.** To require a variable at boot but not at build time, branch on `building`:

```ts
import { building } from '$app/env';

export const variables = defineEnvVars({
	SECRET: { schema: building ? v.optional(v.string()) : v.string() }
});
```

### Build-time environment flags

```js
import { browser, building, dev, version } from '$app/environment';
```

Under `explicitEnvironmentVariables` the same four come from `$app/env`. `building` is true during build *and* prerendering — the way to skip work that shouldn't happen at build time. `dev` is not tied to `NODE_ENV`.

## Security options

```js
kit: {
	csp: {
		mode: 'auto',
		directives: { 'script-src': ['self'] },
		reportOnly: { 'script-src': ['self'], 'report-uri': ['/'] }
	},
	csrf: {
		trustedOrigins: ['https://payment-gateway.com']
	}
}
```

CSP notes: `mode: 'auto'` uses hashes for prerendered pages and nonces for dynamic ones (nonces on prerendered pages are insecure and therefore forbidden). Use `%sveltekit.nonce%` for scripts you hand-write in `app.html`. On prerendered pages the policy is delivered as a `<meta>` tag, which silently drops `frame-ancestors`, `report-uri` and `sandbox`. **Svelte transitions create inline `<style>` elements** — if you use them, leave `style-src` unset or allow `unsafe-inline`.

CSRF: `checkOrigin` is deprecated in favour of `trustedOrigins`; checks apply in production only.

## Router

```js
kit: {
	router: {
		type: 'pathname',      // or 'hash' — disables SSR entirely
		resolution: 'client'   // or 'server'
	}
}
```

`resolution: 'server'` skips shipping the route manifest: faster first load and a non-public route list, at the cost of a server round trip for each not-yet-visited path. Preloading hides most of that. `type: 'hash'` is a last resort for hosts you don't control.

## Build output

```js
kit: {
	inlineStyleThreshold: 0,
	output: {
		preloadStrategy: 'modulepreload',
		bundleStrategy: 'split'
	}
}
```

`bundleStrategy`: `'split'` (default, lazy per-route chunks), `'single'` (one JS + one CSS file), `'inline'` (everything in the HTML — the result opens from the filesystem with no server).

`inlineStyleThreshold` inlines CSS files below N UTF-16 units into `<style>`. Improves FCP, costs cacheability.

## Version management

```js
import * as child_process from 'node:child_process';

kit: {
	version: {
		name: child_process.execSync('git rev-parse HEAD').toString().trim(),
		pollInterval: 300000
	}
}
```

When a navigation fails and the version has changed, SvelteKit falls back to a full page load. With `pollInterval` set you can force it earlier:

```svelte
<script>
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';

	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>
```

The name must be deterministic — a commit hash, never `Date.now()`.

## Prerender options

```js
kit: {
	prerender: {
		concurrency: 1,
		crawl: true,
		entries: ['*'],
		handleHttpError: 'fail',
		handleMissingId: 'fail',
		handleUnseenRoutes: 'fail',
		handleInvalidUrl: 'fail',
		origin: 'http://sveltekit-prerender'
	}
}
```

Raise `concurrency` when prerendering is network-bound (a remote CMS). Each `handle*` accepts `'fail' | 'ignore' | 'warn'` or a callback, so you can allow one known-bad link without disabling the check:

```js
handleHttpError: ({ path, referrer, message }) => {
	if (path === '/not-found' && referrer === '/blog/404-post') return;
	throw new Error(message);
}
```

## Paths

```js
kit: {
	paths: {
		base: '/my-app',   // deploying under a subdirectory
		assets: '',        // external asset host
		relative: true
	}
}
```

With `base` set, a root-relative `/about` still resolves against the domain root, so every link has to account for it. Use `resolve()` and `asset()` from `$app/paths` — they apply `base`/`assets` and are typed against your real routes ([routing.md](routing.md)):

```svelte
<a href={resolve('/about')}>About</a>
```

The older `base`-prefixing idiom (`<a href="{base}/about">`) still works, but `base`, `assets` and `resolveRoute` are deprecated. Set `relative: false` if your app uses a `<base>` element.

## Service worker

```js
kit: {
	serviceWorker: {
		register: false,                                    // default true
		files: (filename) => !/\.DS_Store/.test(filename)   // what lands in `$service-worker.files`
	}
}
```

`src/service-worker.js` is bundled and registered automatically when it exists — see [service-workers.md](service-workers.md).

## TypeScript

The generated `.svelte-kit/tsconfig.json` uses `moduleResolution: 'bundler'` and `verbatimModuleSyntax`. Extend it, don't replace it:

```json
{
	"extends": "./.svelte-kit/tsconfig.json",
	"compilerOptions": {
		"strict": true,
		"checkJs": true
	}
}
```

Per-route types come from `./$types`: `PageProps`, `LayoutProps` (2.16+), `PageServerLoad`, `PageLoad`, `LayoutServerLoad`, `Actions`, `RequestHandler`. Edit the generated config programmatically via `kit.typescript.config` when you need to extend a monorepo root.
