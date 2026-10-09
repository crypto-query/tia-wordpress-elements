# Drizzle on Supabase

Supabase is plain PostgreSQL with a managed `auth` schema, a connection pooler in front, and RLS as the intended authorisation layer. Drizzle connects to it as an ordinary Postgres client — which is exactly where the surprises come from.

## Connecting

Take the URI from the project's **Connect** panel. Four routes, and they are not interchangeable:

| Route | Port | User | Prepared statements | Use for |
|---|---|---|---|---|
| Direct | 5432 | `postgres` | yes | long-lived servers, migrations, `pg_dump` (IPv6 unless you buy the IPv4 add-on) |
| Shared pooler, session mode | 5432 | `postgres.<ref>` | yes | long-lived servers on IPv4-only networks |
| Shared pooler, transaction mode | 6543 | `postgres.<ref>` | **no** | serverless and edge, many short-lived connections |
| Dedicated pooler | 6543 | `postgres` | yes | paid tiers wanting lowest latency |

**Transaction mode (6543) requires `prepare: false`.** postgres-js prepares statements by default, and the pooler rejects them. The symptom is an error about prepared statements or a bind message, usually only under concurrency.

Passing `prepare: false` on a route that *does* support prepared statements costs a little performance and breaks nothing, which is why the Supabase guide sets it unconditionally. Do the same unless you have measured a reason not to.

```ts
// $lib/server/db.ts   — drizzle-orm 0.45
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
```

```ts
// drizzle-orm 1.0 — an existing client must go inside the config object
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import { relations } from './relations';

const client = postgres(env.DATABASE_URL, { prepare: false });
export const db = drizzle({ client, relations });
```

Run migrations over the **direct or session** route even when the app uses transaction mode; DDL and advisory locks want a stable session. Keep two variables — `DATABASE_URL` for the app, `DIRECT_URL` for `drizzle.config.ts`.

For a local stack (`supabase start`), the database is on `54322`:
`postgres://postgres:postgres@127.0.0.1:54322/postgres`.

## RLS does not apply to Drizzle

This is the single most important fact on this page, and it is measured rather than inferred.

Against a table with RLS enabled and a `(select auth.uid()) = owner` policy, holding one row for each of two users:

- the default connection returned **both** rows;
- `select rolbypassrls from pg_roles where rolname = current_user` returned **true**.

The role Supabase gives you in the connection string is a superuser-class role that bypasses every policy. PostgREST — what `@supabase/supabase-js` talks to — connects as `anon` or `authenticated` and passes the user's JWT, which is why RLS works there and not here.

**Consequence:** on the Drizzle side, authorisation is whatever `where` clause you wrote. A policy in your schema documents intent and protects the PostgREST path; it does not protect a Drizzle query.

Two ways to live with that.

### Own the filter explicitly

For server code that already knows the user, pass the id and filter on it. Simple, fast, no impersonation machinery — and the ownership check is visible in the query where a reviewer can find it.

```ts
const rows = await db.select().from(notes).where(eq(notes.ownerId, user.id));
```

The risk is a forgotten `where`. If a table is multi-tenant, make every query go through a helper that takes the user id as a required argument, so omitting it is a type error rather than a leak.

### Impersonate, so RLS applies

Ask Postgres to run the query as the end user. Verified: inside a transaction that sets the role and the JWT claims, each user saw exactly their own row, and the role reverted after the transaction.

```ts
import { sql } from 'drizzle-orm';

/** Run `fn` with RLS enforced as `userId`. Example code — `createDrizzle` is not a Drizzle export. */
export function asUser<T>(userId: string, fn: (tx: typeof db) => Promise<T>) {
  return db.transaction(async (tx) => {
    // `set local` / the `true` third argument scope both to this transaction
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
    );
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as typeof db);
  });
}

const notes = await asUser(user.id, (tx) => tx.select().from(notesTable));
```

Three rules, each load-bearing:

- **Always `set local`, always inside a transaction.** A bare `set role` persists on the pooled connection and the next request inherits it — a cross-user data leak, and the worst possible failure mode for this pattern.
- **Derive the user id from a verified token.** `supabase.auth.getUser()` verifies against the Auth server; `getSession()` returns whatever is in the cookie. Impersonation trusts the id you hand it completely, so an unverified id is an authorisation bypass with extra steps.
- **Cost:** every call is a transaction with two extra round trips. Reach for it on user-facing reads of RLS-protected tables; skip it for admin jobs, which want the bypass.

Supabase's own guide builds a `createDrizzle` wrapper around this idea, exposing `db.rls(tx => …)` plus a separate admin client. That wrapper is **example code to copy**, not an import — nothing named `createDrizzle` is exported by `drizzle-orm` in either version.

## `drizzle-orm/supabase`

A small subpath with the Supabase primitives, identical in 0.45 and 1.0:

```ts
import {
  anonRole, authenticatedRole, serviceRole, postgresRole, supabaseAuthAdminRole,
  authUsers,          // the auth.users table
  authUid,            // sql`(select auth.uid())`
  realtimeMessages, realtimeTopic,
} from 'drizzle-orm/supabase';
```

These roles are declared as pre-existing, so drizzle-kit references them without trying to create them. `authUsers` lets a schema hold a real foreign key into Supabase's auth schema — verified to emit `REFERENCES "auth"."users"("id")`:

```ts
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  bio: text('bio'),
}, (t) => [
  pgPolicy('own profile', {
    for: 'all',
    to: authenticatedRole,
    using: sql`(select auth.uid()) = ${t.id}`,
    withCheck: sql`(select auth.uid()) = ${t.id}`,
  }),
]);
```

Wrapping `auth.uid()` in a `select` is the Supabase performance idiom: it lets the planner evaluate it once per query instead of once per row.

`.link(table)` attaches a policy to a table you do not own, such as `realtimeMessages`. There is no `crudPolicy` here — that helper is Neon-only.

## Keep drizzle-kit off Supabase's schemas

Two settings, both mandatory on Supabase.

```ts
// drizzle.config.ts
export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_URL! },
  schemaFilter: ['public'],                       // never let Kit manage auth/storage/realtime
  entities: { roles: { provider: 'supabase' } },  // treat Supabase's roles as pre-existing
});
```

`schemaFilter` matters most on 1.0, where the default became "every schema": an unpinned `pull` on a database with `auth` and `storage` pulled those tables in as managed objects, and the next `generate` would diff them. On 0.x the default is already `['public']` — set it anyway, so the config survives the upgrade.

`entities.roles.provider: 'supabase'` stops Kit proposing to create or drop `anon`, `authenticated` and `service_role`. Add `exclude: [...]` for any custom role you manage by hand.

## Two migration systems

Supabase CLI (`supabase/migrations/`) and drizzle-kit (`drizzle/`) both want to own the schema. Running both unpinned means each sees the other's work as drift. Pick one:

- **drizzle-kit owns the schema.** The TypeScript schema is the source of truth. Keep the Supabase CLI for local stack lifecycle, Auth config and Edge Functions only. Simplest when the app is the only writer.
- **Supabase CLI owns the schema.** SQL migrations stay authoritative; run `drizzle-kit pull` to regenerate the TypeScript schema after each change and never run `generate` or `push`. Right when you already have SQL migrations, dashboard-authored policies, or database functions and triggers.

Mixed ownership works only with strict boundaries — for example Kit owning `public` while the CLI owns everything else — and the `schemaFilter` above is what enforces it.

Whichever you choose, **`drizzle-kit push` against a shared or production Supabase database is the wrong tool**: it mutates directly, writes no reviewable file, and its drop suggestions on an unpinned config can target Supabase's own objects.

## Types

`supabase gen types typescript` and Drizzle's `$inferSelect` describe the same tables from opposite directions. Do not maintain both as sources of truth:

- schema owned by Drizzle → use `typeof table.$inferSelect` / `$inferInsert` and drop the generated file;
- schema owned by SQL → keep the generated types for the `supabase-js` paths, and let `drizzle-kit pull` produce the Drizzle side.

Drizzle's inferred types describe *your query's* result shape, which a hand-maintained row type cannot, so prefer inference at every call site either way.
