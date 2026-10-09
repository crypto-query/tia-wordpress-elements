---
name: svelte-sveltekit
description: SvelteKit 2 and Svelte 5. Use when writing or debugging .svelte / .svelte.ts code, configuring or deploying a SvelteKit app, migrating from Svelte 4 or SvelteKit 1, or adopting experimental features like remote functions and async Svelte.
version: 2.3.0
scope: framework
distribution: author-only
---

# SvelteKit 2 + Svelte 5

Verified against **svelte 5.56.8** / **@sveltejs/kit 2.70.2** / **sv 0.17.0**. Anything below tagged experimental is outside semver — it can break in a patch release.

## Where to look

| File | Read it for |
|---|---|
| [runes.md](runes.md) | `$state` `$derived` `$effect` `$props` `$bindable` `$inspect`, what runs during SSR, `svelte/reactivity` |
| [components.md](components.md) | template syntax, declaration tags, snippets, bindings, `{@attach}`, `createContext`, styling, special elements, TypeScript |
| [motion.md](motion.md) | `Spring` `Tween`, `transition:`/`in:`/`out:`, `crossfade`, `animate:flip`, easing, view transitions, reduced motion |
| [remote-functions.md](remote-functions.md) | `query` `query.batch` `query.live` `form` `command` `prerender`, single-flight mutations · **experimental** |
| [async-svelte.md](async-svelte.md) | `await` in components, `<svelte:boundary>`, `$effect.pending()`, `settled()`, `fork()`, `hydratable` · **experimental** |
| [routing.md](routing.md) | file conventions, layouts, params, matchers, route groups, layout breaking, `resolve`/`$app/types`, snapshots, shallow routing, errors |
| [loading.md](loading.md) | universal vs server `load`, streaming, invalidation, page options, getting data into components |
| [forms.md](forms.md) | form actions, `fail`, `use:enhance`, `applyAction`, uploads, optimistic UI |
| [ssr-hooks.md](ssr-hooks.md) | `handle` `handleFetch` `handleError` `handleValidationError` `init` `reroute` `transport`, auth, caching, hydration |
| [adapters.md](adapters.md) | node / static / vercel / cloudflare / netlify, SPA mode, platform bindings, deployment |
| [config.md](config.md) | `svelte.config.js` vs the Vite plugin, env vars, aliases, CSP/CSRF, router and bundle options |
| [experimental.md](experimental.md) | the full opt-in roster and what each flag costs |
| [patterns.md](patterns.md) | worked multi-file builds: layout shells, session auth, paginated lists, URL search, create forms, modals |
| [performance.md](performance.md) | bundle size, preloading, images, fonts, load latency |
| [service-workers.md](service-workers.md) | `src/service-worker.js`, `$service-worker`, precaching, offline, update semantics |
| [migration.md](migration.md) | Svelte 4→5, SvelteKit 1→2, what SvelteKit 3 removes, `$app/stores`→`$app/state`, codemods |
| [best-practices.md](best-practices.md) | state ownership, security, a11y, testing, production checklist |
| [troubleshooting.md](troubleshooting.md) | error-message-first index of common failures |

## Working rules

The **Svelte MCP server** is authoritative and current; these files are the opinionated layer on top. Use `list-sections` → `get-documentation` for exact API details and anything not covered here, and **run `svelte-autofixer` on every component before delivering it**, repeating until it reports nothing.

Each file lists the MCP sections it derives from in its `mcp_sections` frontmatter — go straight to those when you need the primary source.

Prefer `npx sv` for anything scaffolding-related: `sv create`, `sv add <feature>`, `sv check`, `sv migrate <target>`.

`npx sv add ai-tools` installs the Svelte team's own agent tooling — the MCP server plus their skills and subagents. For Claude Code it lands as a committed `.claude/settings.json` and installs on workspace trust, so there is no `/plugin install` step.

## Corrections to common assumptions

Training data is full of Svelte 4 and SvelteKit 1 patterns, and of confident claims that were never true. The ones that actually cause broken code:

- **`$state` works during SSR.** It renders fine; it just isn't reactive there. What *never* runs on the server is `$effect`. So don't wrap effect bodies in `if (browser)` — that's dead code — and don't split components just to "keep state off the server". The real SSR hazard is browser globals (`localStorage`, `document`) read at component init.
- **`error()` and `redirect()` are not thrown.** `throw error(404)` is SvelteKit 1. In kit 2 you call them.
- **`enhance` is an action**, used as `use:enhance={callback}`. It is not a function you call to produce an action.
- **`let x = $state(data.x)` silently goes stale.** SvelteKit reuses components across navigations, so the `<script>` doesn't re-run and `x` keeps the first page's value. Use `$derived` unless you deliberately want a detached copy.
- **`$app/stores` is deprecated** since 2.12 and goes away in SvelteKit 3. Use `$app/state` — same values, no `$` prefix.
- **`$env/static/private` bakes the literal into the build artifact.** It is protected from the client bundle, not from the artifact. Read secrets through `$env/dynamic/private`, or `$app/env/private` under explicit environment variables — which become the default in SvelteKit 3, when all four `$env/*` modules are removed.
- **`npm create svelte@latest` is retired.** It's `npx sv create`.
- **Breaking out of a layout is a filename**, `+page@.svelte`. There is no `export const layout = false`.
- **Runes are keywords, not imports.** Never `import { $state } from 'svelte'`.
- **`spring()` and `tweened()` are deprecated stores.** Since 5.8 they're the `Spring` and `Tween` classes, read via `.current` rather than `$spring`.
- **`{@const}` is legacy.** Since 5.56 it's a declaration tag — `{const area = w * h}` — and `{let name = $state('')}` gives you reactive state in markup. Declaration tags go anywhere, not just as an immediate child of a block.
- **`base` from `$app/paths` is deprecated.** Since 2.26 it's `resolve('/about')` and `asset('/logo.png')` — typed against your real routes, so `<a href="{base}/about">` is both the old way and an unchecked one.
- Prefer the modern form: `{@attach}` over `use:`, snippets over slots, `onclick` over `on:click`, callback props over `createEventDispatcher`, `class={{ active: x }}` over `class:active`, `<C />` over `<svelte:component>`, `createContext` over `setContext`/`getContext`, classes with `$state` over stores.

## Experimental status

The roster, and what each flag costs, is in [experimental.md](experimental.md). One split causes most of the trouble: **`async` is a `compilerOptions.experimental` flag; every other flag lives under `kit.experimental`.** Remote functions need `remoteFunctions` *and* `async` — that pairing is the most common reason they appear not to work.

```sh
npx sv add experimental="features:async,remoteFunctions"
```

## Related skills

- **tailwind-css** — Tailwind v4 styling, theming, migration
- **typescript** — strict-mode patterns
- **typescript-design-patterns** — architecture-level shapes on top of these APIs: request-scoped state, registries, state machines, undo stacks
- **bits-ui** — headless Svelte 5 components
- **storybook-svelte** — component workshop setup
- **gsap-svelte5** — animation beyond CSS transitions
