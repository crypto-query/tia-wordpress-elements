# Drizzle in SvelteKit

## Scaffolding

`sv add drizzle` is the official add-on and the fastest correct start:

```bash
npx sv add drizzle="database:postgresql+client:postgres.js"
```

Measured on `sv` 0.17.0, it writes `src/lib/server/db/index.ts` and `schema.ts`, a root `drizzle.config.ts`, a `.env` with `DATABASE_URL`, and four scripts — `db:push`, `db:generate`, `db:migrate`, `db:studio`. It pins `drizzle-orm ^0.45.2` and `drizzle-kit ^0.31.10`.

Three things to fix straight after, for a Supabase target:

1. **Add `{ prepare: false }`** to the `postgres(...)` call — the scaffold omits it, and the transaction pooler needs it.
2. **Add `schemaFilter: ['public']` and `entities: { roles: { provider: 'supabase' } }`** to `drizzle.config.ts`, so Kit leaves `auth` and `storage` alone.
3. **Move `drizzle-orm` and `postgres` into `dependencies`.** The add-on puts them in `devDependencies`; that survives a bundled build but breaks any deployment that installs production dependencies and expects the driver at runtime.

## Layout and the server boundary

```
src/lib/server/db/
  index.ts       # the client — the only module that reads the connection string
  schema.ts      # tables, relations, policies
drizzle.config.ts
drizzle/         # generated migrations, committed
```

Everything Drizzle lives under `$lib/server/` (or a `*.server.ts` file). SvelteKit fails the build if a client-reachable module imports one, which is the behaviour you want — the alternative is a connection string in a browser bundle.

Types cross the boundary freely, values do not:

```ts
// src/lib/types.ts — safe anywhere
import type { InferSelectModel } from 'drizzle-orm';
import type { posts } from '$lib/server/db/schema';
export type Post = InferSelectModel<typeof posts>;
```

`import type` is erased at compile time. A plain `import` of the same module is not, and pulls the driver with it.

## Environment variables

Two different consumers, two different mechanisms:

- **App code** uses `$env/dynamic/private` (read at runtime — the right choice when the same build is deployed to several environments) or `$env/static/private` (inlined at build time, which lets the bundler tree-shake but bakes the value into the artefact).
- **`drizzle.config.ts`** is read by the drizzle-kit CLI, outside Vite and outside SvelteKit, so `$env/*` does not resolve there. Use `process.env`, and load the file yourself if your runtime does not (`import 'dotenv/config'`, or a runtime with built-in `.env` support).

Do not reach for `dotenv` inside app code to work around this — that is what `$env/*` exists for.

Point Kit at a direct/session connection and the app at the pooler when they differ:

```ts
// drizzle.config.ts
dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL! }
```

## One client per process

A module-level `postgres(...)` call opens a connection pool. In dev, Vite re-evaluates a module every time it or its dependencies change, and nothing closes the previous pool — so an afternoon of editing `schema.ts` can leave dozens of idle pools against a database with a connection ceiling. Supabase's ceiling is low on small instances, and the symptom is `too many clients already` after a while, never on the first run.

Pin the client to the process:

```ts
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { client?: postgres.Sql };

const client = globalForDb.client ?? postgres(env.DATABASE_URL, { prepare: false });
if (import.meta.env.DEV) globalForDb.client = client;

export const db = drizzle(client, { schema });
```

In production the module evaluates once and the guard is inert; keeping it dev-only avoids surprising a serverless runtime that expects fresh state per instance. On serverless in general, prefer the transaction pooler and a small `max`.

## Where to put queries

**`+page.server.ts` load** — the default for reading data a page needs:

```ts
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const load = async ({ params }) => {
  const post = await db.query.posts.findFirst({
    where: (p, { eq }) => eq(p.slug, params.slug), // 0.45 syntax
    with: { author: true },
  });
  if (!post) error(404, 'Not found');
  return { post };
};
```

**Form actions** for mutations, **`+server.ts`** only for genuine HTTP endpoints (webhooks, third-party callers). A route that exists purely so your own page can fetch it is a load function you have not written yet.

**Remote functions** (`.remote.ts`, `query` / `form` / `command` / `prerender` from `$app/server`) let a component call the server directly with end-to-end types, which suits Drizzle well — the query's inferred row type lands in the component with no hand-written DTO. They are experimental, gated behind `kit.experimental.remoteFunctions` and `compilerOptions.experimental.async`. Two constraints that interact with this layout: a `.remote.ts` file may import `$lib/server/*` but may not itself live inside `src/lib/server`, and every argument is validated with a Standard Schema library because the function is a public HTTP endpoint. See the **svelte-sveltekit** skill for the full API.

Whichever you choose, the authorisation rule from [supabase.md](supabase.md) holds: the query itself carries the ownership check.

## What survives the load boundary

`load` return values are serialized with devalue, which handles more than JSON — `Date`, `Map`, `Set`, `BigInt`, `RegExp` — but not class instances or functions. Drizzle returns plain objects and `Date`s, so results pass through unchanged.

The traps are in column mapping rather than serialization, and they are silent. `numeric` and `date` arrive as **strings**, so `{price * qty}` in a component renders `NaN` rather than throwing. The full table is in [schema.md](schema.md) — check it before rendering a column you have not rendered before.

## Migrations and deployment

Run migrations as a deploy step, not from application code:

```json
{ "scripts": { "db:migrate": "drizzle-kit migrate", "db:generate": "drizzle-kit generate" } }
```

Migrating inside `hooks.server.ts` looks convenient and races: every instance of a horizontally scaled app runs it at once. If you must do it in-process, do it in a one-shot job.

Commit the generated migration folder. Never run `push` against an environment you share.

For adapters: any server-side database needs a running server, so `adapter-node`, `adapter-bun` or a serverless adapter whose runtime can open TCP connections. `adapter-static` cannot use a database at request time at all — only `prerender` data at build time. `adapter-auto` picks by platform, which is fine once you know which platform it picked.

## Testing

`drizzle.mock()` builds a database object with no connection for pure type-level and query-shape assertions:

```ts
const db = drizzle.mock({ schema });
db.select().from(users).where(eq(users.id, 1)).toSQL(); // { sql, params }
```

`.toSQL()` is the cheapest real assertion in Drizzle — it returns the exact SQL string and parameters without touching a database, which is ideal for pinning that a tenant filter is present in a query.

For behaviour, run against a real Postgres (a local Supabase stack, or a container) and roll back in a transaction per test. RLS behaviour in particular cannot be tested against a mock, and — since the default connection bypasses policies — testing it at all means testing through the impersonating helper.
