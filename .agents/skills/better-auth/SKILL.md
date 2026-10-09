---
name: better-auth
description: Better Auth 1.6/1.7 in SvelteKit — the server handler and hooks, the Svelte client's SSR gap, schema generation with the `auth` CLI, and the upstream skill pack. Use when wiring Better Auth into a SvelteKit app, writing or reviewing sign-in, session or route-protection code, running `sv add better-auth` or the `auth` CLI, or debugging a session that is missing, stale or 404ing.
version: 1.0.0
scope: integration
distribution: author-only
---

# Better Auth

Better Auth is a framework-agnostic TypeScript auth library: you own the database, it owns the tables, the endpoints and the cookies. `betterAuth({...})` builds one object exposing two faces — `auth.handler(request)`, a fetch handler you mount at `/api/auth/*`, and `auth.api.*`, the same endpoints callable in-process as plain functions.

Two facts drive nearly every mistake below.

**Two integrations, not one.** `sv add better-auth` scaffolds a **server-first** app: form actions call `auth.api.*`, the `handle` hook puts the session on `event.locals`, and no auth client is ever created. Better Auth's own SvelteKit page documents the **client-first** shape: `createAuthClient()` from `better-auth/svelte` and a reactive `useSession()` store. Both work; the failure is mixing them and holding the session twice, in two places that disagree. Pick one per app, and read [sveltekit.md](references/sveltekit.md) or [client.md](references/client.md) accordingly.

**`auth.api.*` hands you a `Response` you never send.** Called in-process, its `Set-Cookie` header goes nowhere unless the `sveltekitCookies` plugin copies it onto the SvelteKit response. Measured: with the plugin removed, a form action calling `auth.api.signInEmail` returned **200 with no `Set-Cookie`** — credentials verified, session row written, nobody signed in. Nothing throws.

Unlike many libraries, the npm package carries **no agent documentation at all** — `node_modules/better-auth/` holds `dist/`, `README.md` and `LICENSE.md`, nothing else. Upstream's agent material is a separate skill pack, a docs MCP server and per-page `.md` files; [upstream.md](references/upstream.md) covers what to install and where it is wrong about Svelte.

Everything here was verified on 15 August 2026 against `better-auth` 1.6.29 and 1.7.0-rc.6, the `auth` CLI 1.6.29, SvelteKit 2.70.2, Svelte 5.56.1, `sv` 0.17.0, Vite 8.2.1 and TypeScript 6.0.3, by scaffolding a real app and driving it over HTTP — not read off the docs.

## Where to look

| File | Read it for |
|---|---|
| [sveltekit.md](references/sveltekit.md) | the **server-first** integration: `svelteKitHandler`, the `handle` hook, `event.locals`, form actions, remote functions, route protection, deployment |
| [client.md](references/client.md) | the **client-first** integration: `createAuthClient`, `useSession` as a nanostore, **the flash** and how to close it, sign-in/out, Svelte 5 syntax |
| [config.md](references/config.md) | `betterAuth` options: `baseURL` and the silent 404, secrets, the **two CSRF gates**, `session.cookieCache`, plugin order, `better-auth/minimal` |
| [database.md](references/database.md) | adapters, the `auth` CLI (`generate` / `migrate`), the four core tables, Drizzle specifics |
| [versions.md](references/versions.md) | 1.6 vs the 1.7 RC, the CLI package rename, breaking changes, what `sv` pins |
| [upstream.md](references/upstream.md) | the official skill pack, the docs MCP server, `llms.txt` — what each covers, and its Svelte blind spot |

## Working rules

**Decide server-first or client-first before writing a line, and write it down.** Every question below — where the session lives, what `invalidateAll` is for, whether you need `sveltekitCookies` — has a different answer per style. An app that reads `event.locals.user` in a load *and* calls `useSession()` in a component has two sources of truth that drift on every sign-out. Server-first is the better default in SvelteKit: it is what the official add-on generates, it renders the right HTML on the first byte, and it survives with JavaScript disabled.

**Put `sveltekitCookies(getRequestEvent)` last in `plugins` the moment any code calls `auth.api.*`.** This is the single highest-value line in a SvelteKit integration, and its absence fails silently rather than loudly. "Last" is not superstition: the guard warns only when a *later* plugin declares `hooks.after`, because those hooks can set cookies this one will not see. Needs SvelteKit ≥ 2.20 for `getRequestEvent`.

**Set `baseURL` to the origin the app is really served from — and use the object form whenever that is more than one.** `svelteKitHandler` claims a request only when its origin matches `baseURL`'s, so a stale value makes every `/api/auth/*` route **404** with no log line. Measured: one build with `baseURL: 'http://localhost:5173'` answered 200 on `:5173` and 404 on `:5174`. Leaving it unset derives the origin per request and works anywhere, but warns that callbacks and redirects may misbehave — fine locally, not a production answer. The object form (`allowedHosts`) fails loudly instead of silently: [config.md](references/config.md).

**Enable `session.cookieCache` before shipping.** A `handle` hook that calls `auth.api.getSession()` runs on *every* request. Measured: 2 SQL queries per page hit — one for `session`, one for `user` — on a page that never touched the session. With `cookieCache` on, the same request issued **0**.

**Keep `betterAuth()` under `$lib/server/`, and let components import only `better-auth/svelte`.** One package, two subpaths, and only one of them belongs in a browser bundle — the server object closes over your secret and your database handle. `import type` crosses the boundary free; a plain import drags the whole server with it.

**Generate the schema with `auth`, not `@better-auth/cli`.** The CLI moved to the `auth` package, versioned in lockstep with the library (1.6.29 for both). `@better-auth/cli` is frozen at 1.4.21 from April 2026 — the docs and the official skill pack both still tell you to run it. `npx auth@latest generate` / `migrate`.

**Reach for the docs MCP server or `llms.txt` for anything beyond these files.** There is no bundled `AGENTS.md` to fall back on. `https://mcp.better-auth.com/mcp` (added with `npx auth@latest mcp --claude-code`) and `https://better-auth.com/llms.txt` — a 22 KB index whose entries resolve to real Markdown at `/llms.txt/docs/<path>.md`. There is no `llms-full.txt`; that URL 404s.

## Corrections to common assumptions

Ordered by how often each one produces broken or insecure code:

- **`useSession()` renders signed-out on the server, every time.** It is a client-side fetch, so SSR emits the `isPending` branch even when the request carried a valid session cookie — measured, the SSR HTML for a signed-in user contained `PENDING`. That is **the flash**: correct HTML arrives one round trip after hydration, and it also leaks into anything that reads the store during SSR. 1.7 adds `hydrateSession` to close it; on 1.6 you pass the session down from a server load. [client.md](references/client.md).
- **A sign-in that returns 200 has not necessarily signed anyone in.** See the second fact above. Assert on the `Set-Cookie` header, not the status code, when checking an auth flow through a form action.
- **There are two independent CSRF gates with two independent allowlists, and one of them is off in dev.** Better Auth rejects a foreign `Origin` on `/api/auth/*` with `403 INVALID_ORIGIN` in dev and production alike. SvelteKit's own check rejects cross-origin form POSTs — but only when `dev` is false: the identical request returned **200 in `vite dev` and 403 in `vite preview`**. Configuring `trustedOrigins` on Better Auth does nothing for form actions, and configuring `csrf.trustedOrigins` in SvelteKit does nothing for `/api/auth/*`.
- **The `sv add better-auth` scaffold is server-first and hard-requires Drizzle.** It calls `dependsOn('drizzle')`, so on a project without `drizzle-orm` it pulls the Drizzle add-on in first. It writes no client, and its demo pages are form actions with `use:enhance`. If you want the client-first shape you are writing it yourself.
- **The scaffold imports `betterAuth` from `better-auth/minimal`, and the docs import it from `better-auth`.** These are different builds — `minimal` is the initializer without Kysely, for when an adapter already owns the database. Copying a docs snippet into a scaffolded `auth.ts` silently swaps builds and drags Kysely back in.
- **Better Auth's own SvelteKit page is written in Svelte 4.** Its example uses `on:click`, which is deprecated in Svelte 5 and an error in runes mode. Translate to `onclick` as you read; the surrounding API is current.
- **`useSession()` is a nanostore, not a rune.** `better-auth/svelte` re-exports all of `nanostores`, and the atom satisfies Svelte's store contract, so `$session` auto-subscription type-checks and works. There is no `$state`-based API in 1.6 or the 1.7 RC — do not expect `session.data` to be reactive without the `$`.
- **`event.locals.user` is not populated for you.** `svelteKitHandler` routes auth requests and nothing more; the session lookup in the `handle` hook is code you write. Its absence looks exactly like a broken session.
- **The health check is `GET /api/auth/ok` returning `{"ok":true}`** — not `{ status: "ok" }`, which is what the official skill pack claims. It is the fastest way to tell "handler not mounted" apart from "credentials wrong".
- **`allowedHosts` in the object `baseURL` matches host *with port*.** `'localhost'` does not match `localhost:5177`; `'localhost:*'` does. The mismatch throws a loud `APIError` naming the host and the list — a genuine improvement on the string form's silent 404.
- **`auth generate` emits Drizzle `relations()`, the 0.45-era API.** On Drizzle 1.0, which replaced `relations()` with `defineRelations()`, the generated file needs converting. [database.md](references/database.md).
- **Prerendering runs your `handle` hook, and `building` does not cover the part you wrote.** `building` is required by `svelteKitHandler`'s signature — omit it and the type-checker says so — but it short-circuits that call only. The `auth.api.getSession()` line above it executes on every prerendered page. It costs no query (no cookie, so the lookup short-circuits — measured 0 SQL during a full prerender), yet it still resolves the auth context, which is enough to fail a build: with the object form of `baseURL` and no `fallback`, prerendering died on `APIError: Dynamic baseURL could not be resolved for this direct auth.api call` and the build exited non-zero. Give a dynamic `baseURL` a `fallback`, or guard the session lookup with `building` too.
- **The 1.7 RC changes the account model, not the SvelteKit surface.** `Account.accountId` becomes `Account.providerAccountId`, `Account.issuer` becomes required, and `experimental.joins` moves to `advanced.database.joins`. The `better-auth/svelte-kit` module is byte-identical between 1.6.29 and 1.7.0-rc.6 — upgrading is a schema problem, not an integration one. [versions.md](references/versions.md).

## Related skills

- **svelte-sveltekit** — the framework side: `hooks.server.ts`, `event.locals`, form actions, remote functions, `$app/server`, adapters
- **drizzle** — the schema `auth generate` writes into, and the 0.45/1.0 split that decides whether it compiles
- **typescript** — inference across the `auth.api` surface and the `svelte-check` gate
