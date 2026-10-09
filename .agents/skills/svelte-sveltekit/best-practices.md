---
title: "Best practices"
summary: "Project organization, state ownership, security, accessibility, testing and the production checklist — the decisions that aren't syntax."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8"
mcp_sections: ["svelte/best-practices", "kit/auth", "kit/accessibility", "kit/seo", "svelte/testing", "svelte/browser-support"]
---

# Best practices

Syntax-level guidance lives in [runes.md](runes.md) and [components.md](components.md). This page is the decisions around them.

## Project organization

```
src/lib/
├── server/          server-only — enforced by the build
│   ├── db.ts
│   └── auth.ts
├── components/
│   ├── ui/          generic, no domain knowledge
│   └── <feature>/
├── state/           *.svelte.ts — shared reactive state
└── utils/
```

Group `src/routes` by section using route groups — `(marketing)`, `(app)`, `(auth)` — so each gets its own layout and auth posture without polluting URLs.

When a component grows past a few hundred lines, the split is usually along the line between "fetches and decides" and "renders".

## State ownership

Decide where state lives by asking who needs it and how long it must survive:

| Scope | Put it in |
|---|---|
| One component | `$state` in that component |
| A component and its children | props, or `$bindable` for two-way |
| A subtree, request-scoped | [context](components.md) via `createContext` |
| Route data | `load` → `data` prop, read with `$derived` |
| Survives reload, affects SSR, shareable | **the URL** (`?sort=price`) |
| Ephemeral UI across navigation | [snapshots](routing.md#snapshots) |
| Truly app-wide, non-user-specific | a class with `$state` in `*.svelte.ts` |

Two rules that prevent most state bugs:

- **Server state and client state are different things.** `load` output is server state — derive from it, don't copy it into `$state` unless you deliberately want a detached draft.
- **Never put user-specific state in a shared module.** On a long-lived server that state is shared across requests, so one user's data can reach another. Context is per-render and cannot leak.

Filters, sorting and pagination belong in the URL. It costs nothing, survives reload, and makes every view linkable.

## Security

- **`$lib/server` for anything secret.** The build enforces it.
- **Secrets come from `$env/dynamic/private`** — or `$app/env/private` under explicit env vars — never a `PUBLIC_` prefix. `$env/static/private` bakes the literal into the build artifact, which then needs the same handling as the secret itself ([config.md](config.md)).
- **Validate every input at the trust boundary** — form actions, `+server.js` handlers, and remote functions all take arbitrary bytes from the internet. A Standard Schema library (Zod, Valibot) is the low-friction option.
- **Authorize in the handler, not the layout.** A `+layout.server.ts` guard protects pages beneath it — it does not protect sibling endpoints or actions.
- **Never authorize on `url`/`params`/`route` inside a remote function** — they describe the calling page and are client-controlled.
- **Cookies**: `httpOnly`, `secure`, `sameSite: 'lax'`, and an explicit `path` (required in kit 2).
- **`{@html}` is an XSS hole** unless the input is sanitized or authored by you.
- **Set `csrf.trustedOrigins`** for third parties that post to you; don't reach for `['*']`.
- **Rate-limit** auth and mutation endpoints in `handle`.
- Prefer a maintained auth library (`npx sv add better-auth`) over hand-rolled sessions.

## Accessibility

Svelte's compiler warns about many a11y problems — treat those warnings as errors rather than silencing them.

- Semantic elements first: `<button>` for actions, `<a>` for navigation. A `<div onclick>` has no keyboard, focus or role behaviour.
- Every input needs a label — `$props.id()` gives you SSR-stable ids for `for`/`aria-describedby`.
- Images need `alt`; decorative ones need `alt=""`.
- Visible focus indicators; never `outline: none` without a replacement.
- Announce client-side navigations — SvelteKit handles focus reset, but dynamic content changes need `aria-live`.
- Honour `prefers-reduced-motion` around transitions and animations — `prefersReducedMotion.current` from `svelte/motion` ([motion.md](motion.md)).
- Check the contrast ratio of every colour pair you author, and walk the flow you built for keyboard reachability.

`npx sv check` includes an accessibility pass.

## SEO

- SSR or prerender anything you want indexed. SPA mode gets you downranked.
- Unique `<title>` and `<meta name="description">` per route via `<svelte:head>`.
- Canonical URLs, Open Graph and Twitter tags on shareable pages.
- Generate `sitemap.xml` and `robots.txt` from a `+server.js` endpoint.
- Structured data (JSON-LD) where it applies.
- Core Web Vitals are a ranking factor — see [performance.md](performance.md).

## Testing

```sh
npx sv add vitest playwright
```

- **Unit** — pure logic in plain `.ts`. Reactive modules need the `.svelte.ts` extension so runes compile; wrap assertions with `flushSync` from `svelte` when you need synchronous propagation.
- **Component** — Vitest with the browser environment, or `@testing-library/svelte` (a Svelte 5-compatible version). Instantiate with `mount`/`unmount`. For a component that reads context, wrap it in a function that sets the context first ([components.md](components.md)).
- **E2E** — Playwright against `npm run preview`, not `dev`.
- **Server** — `load` functions and actions are ordinary functions; call them with a fake event.

Test behaviour through the DOM the user sees, not component internals. The highest-value tests are E2E over the critical flows plus unit tests over business logic; broad shallow component tests tend to cost more than they catch.

## Error handling

- `error(status, message)` for expected failures; it renders `+error.svelte`.
- `fail(400, { ...values })` in form actions — it preserves what the user typed. `error()` throws it away.
- `handleError` reports to your tracker and returns a **sanitized** shape; `error.message` may contain secrets, `message` does not.
- `<svelte:boundary>` walls off flaky subtrees on the client; the `handleRenderingErrors` flag extends that to the server.
- Remember boundaries don't catch errors from event handlers or post-`await` work.

## Production checklist

**Correctness**
- `npx sv check` clean; no accessibility warnings suppressed without cause.
- `npm run build && npm run preview` exercised, not just `dev`.
- Tested with JavaScript disabled if you claim progressive enhancement.
- Svelte itself targets **Baseline 2020** — Chrome/Edge 87, Firefox 83, Safari 14. Three features cost more: `$state.snapshot` needs Safari 15.4, `flip` from `svelte/animate` needs Firefox 126, and `bind:devicePixelContentBoxSize` has no Safari support at all.

**Security**
- No secret reachable from the client bundle.
- Every mutation endpoint validates input and checks authorization itself.
- Cookies `httpOnly` + `secure` + `path`; CSP configured.
- Dependencies audited.

**Performance**
- Images sized and optimized; LCP image preloaded.
- Fonts self-hosted with `font-display`.
- `data-sveltekit-preload-data` set.
- Everything prerenderable is prerendered.

**Operations**
- `handleError` wired to a real error tracker.
- `kit.version.name` set to a commit hash for safe deploys.
- Health-check endpoint if the platform wants one.
- Structured logging; tracing considered ([experimental.md](experimental.md)).
- Rollback path known.

## Adopting experimental features

Remote functions and async Svelte are genuinely good, and genuinely unstable. Before committing a production codebase:

- Pin exact versions — these APIs move in patch releases.
- Isolate the surface: keep remote functions in a few `.remote.ts` files rather than scattered through components, so a breaking change is a contained edit.
- Know what a rollback costs. `form` remote functions and form actions solve the same problem; keeping the action path working is cheap insurance early on.
- Read [experimental.md](experimental.md) for the flag-by-flag tradeoffs.
