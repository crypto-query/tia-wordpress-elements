---
title: "Troubleshooting"
summary: "Error-message-first index of common SvelteKit and Svelte 5 failures — SSR crashes, hydration mismatches, module resolution, HMR, build and deployment — plus a systematic approach when the symptom isn't listed."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8"
mcp_sections: ["svelte/runtime-errors", "svelte/compiler-errors", "svelte/runtime-warnings", "kit/faq"]
---

# Troubleshooting

Reach for `svelte-autofixer` (Svelte MCP server) on any component before deeper debugging — it catches rune misuse, legacy syntax and SSR hazards immediately. `npx sv check` does the same across the project.

## SSR crashes

### `ReferenceError: localStorage is not defined` / `document is not defined` / `window is not defined`

A browser global was touched during server rendering — almost always at component init.

```svelte
<script>
	let theme = localStorage.getItem('theme');   // ❌ runs on the server
</script>
```

```svelte
<script>
	let theme = $state('light');

	// ✅ effects never run on the server, so no `browser` guard is needed
	$effect(() => {
		theme = localStorage.getItem('theme') ?? 'light';
	});
</script>
```

**Do not write `if (browser)` inside an `$effect`.** It's dead code — effects are client-only by construction — and it obscures the actual rule.

`browser` from `$app/environment` *is* correct for module top-level code and for `load` functions, which do run in both places.

For a third-party library that touches the DOM on import, import it dynamically:

```js
$effect(() => {
	let chart;
	import('chart.js').then(({ Chart }) => { chart = new Chart(canvas, config); });
	return () => chart?.destroy();
});
```

…or set `export const ssr = false` on the route, or use `{@attach ...}`, which only runs client-side.

> Note: `$state()` itself works fine during SSR. If something crashes on the line that declares state, the cause is the *value* being computed, not the rune.

### Hydration mismatch

The client's first render disagrees with the server's HTML. Usual causes:

| Cause | Fix |
|---|---|
| `Date.now()`, `Math.random()`, `new Date()` in the template | compute in `load`, or use [`hydratable`](async-svelte.md) |
| Locale/timezone formatting | format on the server, or after mount in an `$effect` |
| Reading `window`/`localStorage` at init | move to `$effect` |
| Viewport-dependent markup | render one version, adjust in `$effect`, or use CSS |
| Invalid HTML nesting (`<div>` in `<p>`, stray `<td>`) | fix the markup — the browser silently repairs it, so the DOM stops matching |

### State leaking between users

One user seeing another's data means module-level state mutated during SSR. Move it into [context](components.md), and keep `load` pure.

## Reactivity not working

| Symptom | Cause |
|---|---|
| Value never updates after navigation | `let x = $state(data.x)` snapshots once — use `$derived` ([loading.md](loading.md)) |
| Destructured value is frozen | destructuring takes values, not references |
| Prop change doesn't propagate | computed at init instead of `$derived` |
| Mutating an imported `$state` does nothing | you exported a reassigned binding — export an object or functions |
| `$effect` runs once, expected many | you read the object, not the property |
| `$effect` doesn't see a value | it was read after an `await` or in a `setTimeout` — untracked |
| Context value stops updating | it was reassigned rather than mutated |

`$inspect.trace('label')` as the first line of an `$effect` or `$derived.by` prints what triggered it.

## Module and import errors

### `Cannot find module '$lib/...'`

`$lib` maps to `src/lib`. Run `npm run dev` once so SvelteKit generates `.svelte-kit/tsconfig.json`, and make sure your `tsconfig.json` extends it. Custom aliases go in `kit.alias`, **not** `tsconfig.paths` (kit 2 warns about that).

### `Cannot import $lib/server/... into client-side code`

Working as intended — something reachable from the browser imports a server-only module. Follow the import chain in the error. The usual culprit is a `$lib` barrel file re-exporting both.

### `does not provide an export named ...` / CJS interop

A CommonJS-only dependency. Add it to `optimizeDeps.include`, or `ssr.noExternal` if it needs bundling for the server:

```js
export default defineConfig({
	plugins: [sveltekit()],
	ssr: { noExternal: ['problematic-package'] },
	optimizeDeps: { include: ['cjs-package'] }
});
```

### `500` from a route that works in dev

Usually a dependency that only exists in `devDependencies`, or Node APIs used on an edge runtime.

## HMR problems

- **State resets on every edit** — expected for module-level state; component state is preserved where it can be.
- **Changes not picked up** — restart after editing `svelte.config.js`, `vite.config.js`, or anything under `src/params`.
- **Stale modules** — delete `.svelte-kit` and `node_modules/.vite`, then restart.
- **Nothing updates in a container/VM** — the file watcher can't see host events:

```js
export default defineConfig({
	server: { watch: { usePolling: true } }
});
```

## Build failures

### Prerendering errors

```
Error: 404 /some/path (linked from /other/path)
```

The crawler followed a link to a route that can't be prerendered. Either add `entries()`, or relax the specific check:

```js
kit: {
	prerender: {
		handleHttpError: ({ path, referrer, message }) => {
			if (path === '/known-external') return;
			throw new Error(message);
		}
	}
}
```

`handleUnseenRoutes` fires when a route is marked prerenderable but was never reached — usually a missing `entries()`.

### `Cannot prerender pages with actions` / dynamic env vars

A prerendered route can't have form actions, request-time server loads, or `$env/dynamic/*`. Use `$env/static/*`, and remember `query` remote functions don't work on prerendered pages — use `prerender` functions.

### Type errors only in CI

`npx sv check` runs against generated types. Ensure `svelte-kit sync` has run (it's part of `dev`/`build`) so `.svelte-kit/types` exists.

## Deployment failures

| Symptom | Likely cause |
|---|---|
| Form actions 403 in production, fine locally | `ORIGIN` not set on adapter-node behind a proxy — CSRF check fails |
| `fs` errors on Cloudflare/edge | no filesystem; use `read` from `$app/server` or prerender |
| Cloudflare: worker exceeds size limit | a large library in the server bundle; import it client-side only |
| Cloudflare: `AsyncLocalStorage` errors | add the `nodejs_als` compatibility flag |
| Streaming never streams | Lambda buffers; nginx needs `proxy_buffering off` |
| Wrong client IP | set `ADDRESS_HEADER` and `XFF_DEPTH` |
| Env var undefined at runtime | `$env/static/*` is inlined at build time — use `$env/dynamic/*` for runtime values |
| `cannot find @opentelemetry/api` | tracing enabled without a collector installed |

## When it isn't listed here

1. **Reproduce in isolation.** `npx sv create repro`, add the minimum. Half the time this identifies the cause on its own.
2. **Establish where it runs.** Server, client, or both? Add a log guarded by `browser`, or check whether the failure survives `export const ssr = false`.
3. **Bisect.** Comment out half the component, half the dependencies, half the config. Framework bugs are rare; a bad interaction between two things is common.
4. **Read the actual stack.** Enable source maps in the production build when the trace is minified:

```js
export default defineConfig({
	plugins: [sveltekit()],
	build: { sourcemap: true }
});
```

5. **Check the version.** Many "bugs" are a feature added or changed in a later release. `npm ls svelte @sveltejs/kit` against the changelog.

When reporting upstream, include: SvelteKit and Svelte versions, adapter, Node version, OS, a minimal reproduction, and the full error with stack. The `svelte.dev` docs, the GitHub issues for `sveltejs/kit`, and the Discord are the escalation path.
