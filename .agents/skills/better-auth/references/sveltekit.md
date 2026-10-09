# Better Auth in SvelteKit — the server-first integration

The style `sv add better-auth` generates, and the better default: the session is server state, reaching components through `load`. The browser never talks to `/api/auth/*` directly except for OAuth redirects.

## Scaffolding

```bash
npx sv add better-auth="demo:password"        # or demo:password,github
```

Measured on `sv` 0.17.0: the add-on hard-requires Drizzle (`dependsOn('drizzle')`) and pulls that add-on in first if `drizzle-orm` is absent. It writes `src/lib/server/auth.ts`, `src/lib/server/db/auth.schema.ts`, a `handle` hook, `App.Locals`, `.env` entries (`ORIGIN`, `BETTER_AUTH_SECRET`, optionally `GITHUB_CLIENT_ID`/`_SECRET`), demo routes under `/demo/better-auth`, and one script:

```json
{ "auth:schema": "auth generate --config src/lib/server/auth.ts --output src/lib/server/db/auth.schema.ts --yes" }
```

It pins `better-auth` and `auth` at `^1.6.23` in **devDependencies**. Move both to `dependencies` for any deployment that installs production dependencies and expects the library at runtime. The generated app type-checks clean out of the box (0 errors on `svelte-check`).

Two option quirks: `demo` is the only option, and passing `docker:no` to the Drizzle add-on alongside a `sqlite` database is rejected — `Incompatible 'drizzle' option specified: 'false'`. Drop the `docker` option for SQLite.

## The three files

```
src/lib/server/auth.ts   # betterAuth({...}) — the only module holding the secret
src/hooks.server.ts      # mounts the handler, populates locals
src/app.d.ts             # types locals.user / locals.session
```

```ts
// src/lib/server/auth.ts
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  plugins: [sveltekitCookies(getRequestEvent)] // last
});
```

`getRequestEvent` from `$app/server` needs SvelteKit ≥ 2.20. `baseURL` is deliberately absent — see [config.md](config.md) for when to set it and why the string form is a trap.

## The handle hook

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({ headers: event.request.headers });
  if (session) {
    event.locals.session = session.session;
    event.locals.user = session.user;
  }
  return svelteKitHandler({ event, resolve, auth, building });
};
```

Two separate jobs in one hook, and it helps to keep them apart mentally:

- **`svelteKitHandler`** claims requests under `basePath` (default `/api/auth`) and passes everything else through. Its whole body is an origin+prefix test; if the test fails the request falls through to normal routing, which is why a misconfigured `baseURL` surfaces as a 404 rather than an error.
- **The `getSession` call** is yours. `svelteKitHandler` populates nothing. Without those four lines `event.locals.user` is permanently `undefined`, which looks identical to a broken session.

`building` makes `svelteKitHandler` return `resolve(event)` immediately, so no auth endpoint is served during a build. It is required by the signature, so forgetting it is a type error rather than a runtime surprise.

It does **not** cover the `getSession` call above it. Prerendering runs the whole hook: measured, a prerender pass executed that line for every prerendered page. With no cookie to look up it cost zero queries, but it still resolved the auth context — enough to fail the build outright when `baseURL` used the object form without a `fallback`. If you prerender, either give the dynamic `baseURL` a `fallback` ([config.md](config.md)) or skip the lookup as well:

```ts
if (!building) {
  const session = await auth.api.getSession({ headers: event.request.headers });
  // …
}
```

Compose with `sequence()` when you have other hooks, and put auth first so downstream hooks see `locals`:

```ts
export const handle = sequence(handleBetterAuth, handleEverythingElse);
```

### The cost of the hook

`handle` runs for every request the SvelteKit server sees. Measured with SQL logging on, one page request that never touched the session still issued **two queries** — `select ... from session where token = ?` then `select ... from user where id = ?`. Turning on `session.cookieCache` took that to **zero**, at the cost of a second cookie (`better-auth.session_data`, signed, 5-minute default TTL).

If you would rather not spend even a cached lookup on asset requests, gate the call on `event.route.id` being non-null — but measure before adding the branch.

## App.Locals

```ts
// src/app.d.ts
import type { User, Session } from 'better-auth';

declare global {
  namespace App {
    interface Locals {
      user?: User;
      session?: Session;
    }
  }
}
export {};
```

Optional properties, not `User | null` — the hook only assigns on success. That choice propagates: every consumer writes `if (!locals.user)`, which is the check you want anyway.

## Reading the session

**Load functions** are the normal path. Return the user from a root layout and every page has it:

```ts
// src/routes/+layout.server.ts
export const load = async ({ locals }) => ({ user: locals.user });
```

**Protect in the load function of the subtree you are protecting**, not in the hook:

```ts
// src/routes/(app)/+layout.server.ts
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals, url }) => {
  if (!locals.user) redirect(302, `/login?next=${encodeURIComponent(url.pathname)}`);
  return { user: locals.user };
};
```

A route group gives you one guard for a whole subtree with no path matching. Guarding inside `handle` instead means re-deriving "is this route protected?" from a string on every request, including static assets — and getting it wrong fails open.

Note that layout guards do not run for `+server.ts` endpoints. Check `locals.user` in the endpoint too.

## Writing: form actions

```ts
// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';

export const actions = {
  signIn: async ({ request }) => {
    const data = await request.formData();
    try {
      await auth.api.signInEmail({
        body: {
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? '')
        },
        headers: request.headers
      });
    } catch (error) {
      if (error instanceof APIError) return fail(400, { message: error.message });
      throw error;
    }
    redirect(302, '/');
  }
};
```

`auth.api.*` throws `APIError` on rejection — a 401 does not come back as a return value. Catch it, `fail()` with a message, and let anything else propagate.

The cookie is set by the `sveltekitCookies` plugin, not by this code. Verify it during development by asserting on the response header:

```bash
curl -si -X POST 'http://localhost:5173/login?/signIn' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'email=a@b.com&password=…' | grep -i set-cookie
```

No `set-cookie` line means the plugin is missing or not last, whatever the status code says.

**Social sign-in** is a redirect, not a fetch — `auth.api.signInSocial` returns a `url` you redirect to:

```ts
const result = await auth.api.signInSocial({ body: { provider: 'github', callbackURL: '/' } });
if (result.url) redirect(302, result.url);
return fail(400, { message: 'Social sign-in failed' });
```

The provider then calls back into `/api/auth/callback/github`, which `svelteKitHandler` serves. That callback is the one place the browser must be able to reach `/api/auth/*` directly, so its origin has to satisfy `baseURL`.

**Sign-out** takes the request headers, and the same cookie rules apply:

```ts
await auth.api.signOut({ headers: request.headers });
redirect(302, '/login');
```

## Remote functions

`getRequestEvent()` works inside a `.remote.ts` file, so both paths are available there. Measured with a signed-in cookie, a `query` returned the user from `locals` *and* from a direct `auth.api.getSession` call; without the cookie both came back empty:

```ts
// src/routes/data.remote.ts
import { query, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';

export const myOrders = query(async () => {
  const { locals } = getRequestEvent();
  if (!locals.user) error(401, 'Sign in first');
  return await ordersFor(locals.user.id);
});
```

Prefer `locals` — the hook already paid for the lookup. Remote functions are public HTTP endpoints, so the `if (!locals.user)` line is load-bearing: unlike a load function, nothing upstream guards it. Remote functions are gated behind `kit.experimental.remoteFunctions`; see the **svelte-sveltekit** skill for the rest.

## Deployment

- **Any server adapter.** Auth needs a request/response cycle; `adapter-static` cannot serve `/api/auth/*` at all.
- **`BETTER_AUTH_SECRET` must be stable across instances and deploys.** Rotating it invalidates every signed cookie, including cached sessions.
- **`$env/dynamic/private`** if one build is promoted through environments; `$env/static/private` bakes the value into the artefact.
- **Trust the proxy.** Behind a load balancer the derived origin comes from forwarded headers; the object form of `baseURL` takes `protocol: 'auto'` to read `x-forwarded-proto`.
- Native database drivers can defeat bundling regardless of Better Auth — a libsql client, for instance, failed to resolve its platform binary under `adapter-node` in a plain build. That is a driver/bundler problem; check it separately before blaming auth.
