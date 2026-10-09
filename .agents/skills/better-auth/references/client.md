# The Svelte client

The client-first integration: the browser talks to `/api/auth/*` over fetch, and a reactive store holds the session. This is the shape Better Auth's own SvelteKit page documents. It costs you a round trip on first paint — read **the flash** below before choosing it.

```ts
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient();
```

Import from `better-auth/svelte`, never `better-auth/react` or `better-auth/client`. With no `baseURL` the client posts to the same origin, which is what a SvelteKit app wants; pass one only when auth lives on another host.

## `useSession()` is a nanostore

```svelte
<script lang="ts">
  import { authClient } from '$lib/auth-client';

  const session = authClient.useSession();
</script>

{#if $session.isPending}
  <p>Loading…</p>
{:else if $session.data}
  <p>{$session.data.user.name}</p>
  <button onclick={() => authClient.signOut()}>Sign out</button>
{:else}
  <a href="/login">Sign in</a>
{/if}
```

The atom's shape is `{ data, error, isPending, isRefetching, refetch }`. `better-auth/svelte` re-exports all of `nanostores` and `@better-fetch/fetch`, and the returned atom satisfies Svelte's store contract, so `$session` auto-subscription works and type-checks under `svelte-check` in runes mode.

It is **not** a rune. There is no `$state`-backed API in 1.6 or the 1.7 RC. `session.data` without the `$` is not reactive and is not the field you want.

Better Auth's docs page for SvelteKit is still written in Svelte 4 — it uses `on:click`, which is deprecated in Svelte 5 and an error in runes mode. Read `onclick` wherever you see it.

## The flash

`useSession()` fetches `/api/auth/get-session` from the browser. During SSR there is no browser, so the atom renders its initial `{ data: null, isPending: true }` state — and the server sends that HTML even when the request carried a valid session cookie.

Measured: a component branching on `$session` rendered `PENDING` in the SSR HTML for a fully signed-in user. The signed-in markup appeared only after hydration and a completed round trip. Users see a spinner or a "Sign in" link flick to their own name; anything that reads the store during SSR reads `null`.

Three ways out, in descending order of preference:

**1. Do not hold the session on the client at all.** Server-first: the root layout load returns `locals.user`, and components read `data.user`. Correct HTML on the first byte, no round trip, no store. See [sveltekit.md](sveltekit.md).

**2. `hydrateSession` — 1.7 and later.** The RC adds it to every client, Svelte included:

```svelte
<script lang="ts">
  import { authClient } from '$lib/auth-client';

  let { data } = $props();          // data.session from a server load

  authClient.hydrateSession(data.session);
  const session = authClient.useSession();
</script>
```

Read the implementation before relying on it, because it is narrower than the name suggests. It returns immediately if `window` is undefined, if the atom already holds data, **or if you pass `null`**. So it seeds a signed-in session into an empty store and nothing else — a signed-out user still renders `isPending` until the fetch resolves. Branch on `data.user` from the load for the signed-out case.

**3. Pass the session down and treat the store as an enhancement.** On 1.6, render from `data.user` and use `$session` only for post-hydration updates. More moving parts than either of the other two; take it only when you genuinely need both.

## Calling actions

The client is a dynamic path proxy: property paths become endpoint paths, so `authClient.signIn.email` posts to `/sign-in/email`.

```ts
const { data, error } = await authClient.signIn.email({
  email,
  password,
  callbackURL: '/dashboard'
});
if (error) message = error.message;
```

Client calls **return** `{ data, error }`; the server-side `auth.api.*` equivalents **throw** `APIError`. Same endpoints, opposite error conventions — the single most common source of "why is my catch block never firing" when moving a snippet between the two halves.

Social sign-in navigates away rather than resolving:

```ts
await authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard' });
```

Callbacks and hooks go on the call, and are the right place for pending state:

```ts
await authClient.signIn.email(
  { email, password },
  {
    onRequest: () => (loading = true),
    onSuccess: () => goto('/dashboard'),
    onError: (ctx) => (message = ctx.error.message),
    onResponse: () => (loading = false)
  }
);
```

## Keeping server and client in step

The store and `event.locals` are two caches of one fact, and they do not talk to each other. After any client-side call that changes the session, SvelteKit's `load` data is stale until you say otherwise:

```ts
import { invalidateAll } from '$app/navigation';

await authClient.signOut();
await invalidateAll();   // re-runs load functions so locals-derived data catches up
```

Skip that line and the header re-renders as signed-out while the page body still shows data loaded for the old user. This coupling is the argument for picking one style: server-first has no store to drift, client-first has no `load` to invalidate.

`refetch()` on the atom refreshes the store alone and does nothing for `load` data.

## Route protection

Client-side checks are UI, not security. `{#if $session.data}` decides what to paint; it cannot decide what a user may fetch — the endpoint behind it is reachable by anyone with `curl`. Every protected read and write still needs its server-side check, in a layout load, an endpoint, or a remote function.

## Typing

`authClient.$Infer.Session` gives the session type the client actually returns, including plugin-added fields:

```ts
import type { authClient } from '$lib/auth-client';
type Session = typeof authClient.$Infer.Session;
```

Prefer it over hand-writing a shape or importing `Session` from `better-auth` when plugins are in play — the plugin's client half is what widens the type.
