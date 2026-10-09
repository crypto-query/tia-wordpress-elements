# Configuring `betterAuth`

The options that bite in a SvelteKit app. For provider lists, plugin catalogues and per-feature options, use the docs MCP server or `llms.txt` — [upstream.md](upstream.md).

## `betterAuth` vs `better-auth/minimal`

Two initializers, same options:

- `import { betterAuth } from 'better-auth'` — the full build, including Kysely, which powers the built-in adapter when you hand `database` a raw connection or dialect.
- `import { betterAuth } from 'better-auth/minimal'` — "minimal mode (without Kysely)", for when a real adapter (Drizzle, Prisma, Mongo) already owns the database.

`sv add better-auth` generates the `minimal` import; the docs show the plain one. Copying a docs snippet into a scaffolded `auth.ts` silently switches builds and pulls Kysely back into the server bundle. Match the import to the file you are editing.

## `baseURL` — the silent 404

`svelteKitHandler` claims a request only when its origin and path prefix match `baseURL`. When they do not, the request is passed through to normal routing, so a wrong `baseURL` means every `/api/auth/*` route returns **404** with nothing in the log.

Measured on one build with `baseURL: 'http://localhost:5173'`: `POST /api/auth/sign-in/email` returned 200 on `:5173` and 404 on `:5174`.

Three configurations, three behaviours:

| `baseURL` | Behaviour |
|---|---|
| unset | Origin derived per request — works on any origin, but logs a warning that callbacks and redirects may misbehave |
| a string | Only that exact origin is served. Any other → silent 404 |
| an object | Host checked against `allowedHosts`; a miss throws a loud `APIError` naming the host and the list |

Set the string to the origin the app is genuinely served from in production. For multi-origin deployments — preview URLs, several domains — use the object form, which fails loudly rather than silently:

```ts
baseURL: {
  allowedHosts: ['myapp.com', '*.myapp.com', 'localhost:*'],
  fallback: 'https://myapp.com',   // without it, a miss throws
  protocol: 'auto'                 // reads x-forwarded-proto; 'https' to force
}
```

**`fallback` is not optional if you prerender anything.** A prerender pass has no incoming request, so a dynamic `baseURL` has no host to derive from, and any `auth.api.*` call reachable from the `handle` hook throws. Measured: the object form without `fallback` failed the build with `APIError: Dynamic baseURL could not be resolved for this direct auth.api call` and `Error: 500 /<prerendered-route>`. The same build with a string `baseURL` succeeded.

`allowedHosts` matches the host **including port**. Measured: with `['localhost']` a request to `localhost:5177` threw `Host "localhost:5177" is not in the allowed hosts list`; `['localhost:*']` matched. Same wildcard syntax as `trustedOrigins`.

`BETTER_AUTH_URL` sets the same thing from the environment, which only works on adapters that populate `process.env` — see below.

`basePath` moves the mount point from `/api/auth`. Changing it means changing it on the client too.

## Secrets

`secret` signs cookies and tokens. Better Auth reads `options.secret`, then `BETTER_AUTH_SECRET`, then `AUTH_SECRET`, and throws in production when all three are empty. Generate with `openssl rand -base64 32`; the library estimates entropy and complains about weak values.

For rotation, `secrets` (or `BETTER_AUTH_SECRETS`) takes a **versioned list**, newest first:

```bash
BETTER_AUTH_SECRETS="2:<new-base64>,1:<old-base64>"
```

The first entry encrypts new payloads; the rest decrypt only. This is how you rotate without signing everyone out — a single `secret` swap invalidates every cookie and cached session at once. Entries must be `<non-negative integer>:<value>` or construction throws.

**Pass secrets in explicitly rather than relying on the env fallback.** Better Auth reads `process.env`, which not every SvelteKit adapter populates:

```ts
import { env } from '$env/dynamic/private';

betterAuth({ secret: env.BETTER_AUTH_SECRET, /* … */ });
```

`$env/dynamic/private` reads at runtime — right when one build is promoted through environments. `$env/static/private` inlines at build time.

## The two CSRF gates

A SvelteKit app running Better Auth has two independent origin checks with two independent allowlists, and they activate differently. Measured:

| Request | Gate | dev | production |
|---|---|---|---|
| `POST /api/auth/*` with foreign `Origin` | Better Auth | 403 `INVALID_ORIGIN` | 403 `INVALID_ORIGIN` |
| Cross-origin form POST to a form action | SvelteKit | **200** | 403 `Cross-site POST form submissions are forbidden` |

Consequences worth holding on to:

- Better Auth's `trustedOrigins` governs the first row only. It takes exact origins, wildcards (`https://*.example.com`), or a function of the request; `BETTER_AUTH_TRUSTED_ORIGINS` sets it from the environment.
- SvelteKit's `csrf.trustedOrigins` governs the second row only, and it is **off in `vite dev`**. A cross-origin form POST that works locally can 403 in production. Test CSRF behaviour with `vite preview` or a real build, never `vite dev`.
- `auth.api.*` called from a form action bypasses Better Auth's check entirely — it never crosses the HTTP handler. SvelteKit's check is the only thing standing there, so do not disable it and assume Better Auth still has you covered.

`advanced.disableCSRFCheck` turns off Better Auth's origin validation, fetch-metadata checks and cross-site navigation blocking together. It is a debugging tool.

## Sessions

```ts
session: {
  expiresIn: 60 * 60 * 24 * 7,     // 7 days
  updateAge: 60 * 60 * 24,         // refresh the row at most daily
  cookieCache: { enabled: true, maxAge: 300 }
}
```

`cookieCache` is the one to reach for in SvelteKit, because the `handle` hook makes a session lookup a per-request cost — measured in [sveltekit.md](sveltekit.md). It adds a signed `better-auth.session_data` cookie carrying the session and user, default TTL 5 minutes, and `strategy` selects the encoding (`compact` by default, or `jwt` / `jwe`).

The trade is staleness: for up to `maxAge`, a revoked session or an edited user keeps working from the cookie. Keep `maxAge` short, and for anything that must take effect immediately — bans, role changes — check the database in that specific path rather than trusting `locals.user`.

## Plugin order

`plugins` is an ordered array and `sveltekitCookies` goes last. The guard is precise: it warns only when a plugin *after* it declares `hooks.after`, since those hooks can set cookies the cookie plugin will not see. Plugins with no `after` hooks may sit after it harmlessly — but "last" is the rule that never needs checking.

Every plugin with a server half has a client half to match (`organizationClient()`, `twoFactorClient()`), and the pair must agree or the client's typed methods will not exist.

## Where the config lives

One module under `$lib/server/`, exporting `auth`. The `auth` CLI reads that same file via `--config` to generate schema, so it must be importable outside a running SvelteKit server — which it is, as long as it sticks to `$env/dynamic/private` and `$app/server` imports that the CLI's loader can resolve. Keep conditional or request-scoped logic out of it.
