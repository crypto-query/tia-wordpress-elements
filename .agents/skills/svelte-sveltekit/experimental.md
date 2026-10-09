---
title: "Experimental features"
summary: "The full opt-in roster: async, remoteFunctions, explicitEnvironmentVariables, handleRenderingErrors, forkPreloads, tracing and instrumentation — what each buys, what it costs, and how to turn it on."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8, sv 0.17.0"
mcp_sections: ["kit/configuration", "cli/experimental", "kit/observability", "kit/environment-variables"]
---

# Experimental features

> Everything on this page is outside semver. Breaking changes and removals ship in **any** release, including patches. Pin your versions and read changelogs before upgrading.

## The roster

| Flag | Namespace | Gives you | Since |
|---|---|---|---|
| `async` | `compilerOptions.experimental` | `await` in `<script>`, `$derived`, markup | svelte 5.36 |
| `remoteFunctions` | `kit.experimental` | `query` / `form` / `command` / `prerender` | kit 2.27 |
| `explicitEnvironmentVariables` | `kit.experimental` | `src/env.ts` + `$app/env/*` | kit 2.63 |
| `handleRenderingErrors` | `kit.experimental` | `<svelte:boundary>` around each `+error.svelte`, working on the server | — |
| `forkPreloads` | `kit.experimental` | preloading via Svelte's `fork` API | — |
| `tracing.server` | `kit.experimental` | OpenTelemetry spans for hooks, loads, actions, remote functions | kit 2.31 |
| `instrumentation.server` | `kit.experimental` | `src/instrumentation.server.ts` runs before app code | kit 2.31 |

Scaffold any combination:

```sh
npx sv add experimental="features:async,remoteFunctions"
```

`sv add experimental` can also move `@sveltejs/kit` (plus your adapter and peers) onto the `next` line with `versions:kit` — that's how you get at SvelteKit 3 pre-releases.

## Turning them on

```js
/// file: svelte.config.js
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		experimental: {
			remoteFunctions: true,
			explicitEnvironmentVariables: true,
			handleRenderingErrors: true,
			forkPreloads: true,
			tracing: { server: true },
			instrumentation: { server: true }
		}
	},
	compilerOptions: {
		experimental: {
			async: true
		}
	}
};

export default config;
```

Note the split: `async` is a **compiler** option, everything else is a **kit** option. Getting this wrong is the most common reason remote functions "don't work".

Since kit 2.62 the whole config can live in the Vite plugin instead. If you do this, **`svelte.config.js` is ignored entirely** — not merged:

```js
/// file: vite.config.js
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

The `experimental` namespace is shared with `vite-plugin-svelte`: SvelteKit reads its own flags and forwards the rest.

## Pairings that matter

- **`remoteFunctions` needs `async`.** Remote functions are designed around `await` in components. See [remote-functions.md](remote-functions.md).
- **`tracing.server` needs `instrumentation.server`** to be useful — spans with nowhere to go are just overhead.
- **`handleRenderingErrors` pairs with `async`** if you're using `<svelte:boundary>` `pending` snippets, since both concern the same boundary.

## explicitEnvironmentVariables

The one flag here that is not really optional: it becomes the default in SvelteKit 3, which removes all four `$env/*` modules and `$app/environment`. The declaration format, the `EnvVarConfig` keys, schema validation and the `building` escape hatch are in [config.md](config.md).

## handleRenderingErrors

Wraps the component tree in a `<svelte:boundary>` at every level that has an `+error.svelte`, rendering the error page when that subtree throws. Two consequences worth the flag on its own:

- **error boundaries start working on the server**, not just the client
- the error object goes through `handleError`, so your reporting hook sees render failures

## Observability: tracing and instrumentation

Server-side OpenTelemetry spans for the `handle` hook (including each `handle` in a `sequence`, nested as children), server and universal `load` functions run on the server, form actions, and remote functions.

`src/instrumentation.server.ts` is guaranteed to run before your application code is imported — provided your adapter and platform support it.

```js
/// file: src/instrumentation.server.js
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { register } from 'node:module';

const { registerOptions } = createAddHookMessageChannel();
register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);

const sdk = new NodeSDK({
	serviceName: 'my-app',
	traceExporter: new OTLPTraceExporter(),
	instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```

```sh
npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
      @opentelemetry/exporter-trace-otlp-proto import-in-the-middle
```

Run Jaeger locally and traces land at [localhost:16686](http://localhost:16686).

Annotate spans from anywhere via the request event — `tracing.root` is the root `handle` span, `tracing.current` is whichever of `handle` / `load` / action / remote function you're inside:

```js
import { getRequestEvent } from '$app/server';

async function authenticate() {
	const user = await getAuthenticatedUser();
	getRequestEvent().tracing.root.setAttribute('userId', user.id);
}
```

> **Cost.** Tracing, and especially instrumentation, carry nontrivial overhead. Consider enabling them in dev and preview only rather than in production by default.

`@opentelemetry/api` is an optional peer dependency. A "cannot find `@opentelemetry/api`" error usually just means you haven't set up collection yet; if collection *is* set up and the error persists, install it directly.

## Adoption checklist

Before turning any of these on in a project you have to keep running:

1. Pin exact versions of `svelte`, `@sveltejs/kit` and your adapter — patches can break you.
2. Confirm your **adapter** supports what you enabled (instrumentation especially — it needs platform cooperation).
3. Check whether the flag changes existing behaviour, not just adds surface. `async` reorders block effects relative to `$effect.pre`/`beforeUpdate`; `handleRenderingErrors` changes what happens on a server render failure.
4. Have a rollback: these are single-line flags, so keep the non-experimental path working where the cost is low.
