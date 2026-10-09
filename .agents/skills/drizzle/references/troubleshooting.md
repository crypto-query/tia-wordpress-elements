# Troubleshooting

Symptom first. Most Drizzle failures on Supabase are one of: the version split, the pooler, or RLS not doing what you assumed.

## A query returns too many rows, or the wrong one

**A v1-style `where` callback on drizzle-orm 1.0.** The filter is ignored silently — no error, no warning, and the emitted SQL has no `WHERE` clause. `findMany` returns the whole table and `findFirst` returns an arbitrary row.

```ts
where: (p, { eq }) => eq(p.id, id)   // 0.45
where: { id }                         // 1.0
```

Confirm with `.toSQL()`: if the SQL has no `WHERE`, this is it. Then grep the codebase for `where: (`.

**Or: you expected RLS to filter.** It does not — the Supabase connection bypasses policies. Verify with:

```ts
await db.execute(sql`select current_user, (select rolbypassrls from pg_roles where rolname = current_user)`);
```

If `rolbypassrls` is `true`, every policy is inert on this connection and the filter has to be in your query. See [supabase.md](supabase.md).

**Or: a second `.where()` replaced the first.** Chaining twice overwrites without `$dynamic()`. Combine with `and(...)`.

## `Cannot read properties of undefined (reading 'users')` on `db.query`

`db.query` is undefined. Either no relations were passed to `drizzle()`, or you passed the wrong key for your version: 0.45 wants `{ schema }`, 1.0 wants `{ relations }`. On 1.0, `{ schema }` silently produces a db with no `query` at all.

Check the table is exported from the schema module and that you spread the whole module (`import * as schema`).

## Prepared statement errors, or failures only under load

`prepared statement "s1" already exists`, `bind message supplies N parameters`, or errors that appear only with concurrency: you are on the transaction pooler (port `6543`) with prepared statements on. Add `{ prepare: false }` to the `postgres()` call. The `sv add drizzle` scaffold omits it.

The same symptom appears if the app points at `6543` while migrations point at the same port — give Kit the direct or session URL.

## `too many clients already` / connection exhaustion

Usually the dev server: every Vite re-evaluation of the client module opens a new pool and nothing closes the old one. Pin the client to `globalThis` in dev — [sveltekit.md](sveltekit.md).

Otherwise: transactions held open across an `await` on something slow, a `max` that is too high for the instance, or serverless invocations each opening a direct connection. Use the transaction pooler for serverless and keep `max` small.

## drizzle-kit wants to drop tables you did not declare

`schemaFilter` is unpinned. On 1.0 the default is every schema, so Kit sees `auth`, `storage` and `realtime` as unmanaged objects to reconcile. Set `schemaFilter: ['public']` and `entities: { roles: { provider: 'supabase' } }`, then regenerate.

If it wants to drop and recreate a column you merely renamed, that is the diff engine being unable to see intent — edit the generated SQL to `ALTER TABLE … RENAME COLUMN` before applying.

## drizzle-kit cannot read the migration folder

The folder is in the other version's format. 0.x uses `meta/_journal.json` with flat `.sql` files; 1.0 uses timestamped directories with `migration.sql` and `snapshot.json`. Regenerate rather than hand-converting, and keep `drizzle-orm` and `drizzle-kit` on the same line.

## `$env/dynamic/private` fails to resolve in drizzle.config.ts

The CLI runs outside SvelteKit and Vite, so the virtual modules do not exist. Use `process.env` in the config, and `$env/*` in app code. Load the `.env` yourself if the runtime does not.

## The connection string works locally but not in production

IPv6. Direct connections resolve to IPv6 by default, and many hosts are IPv4-only. Use the shared pooler (session mode for a long-lived server, transaction mode for serverless), or buy the IPv4 add-on.

## `TypeError: … is not a function` after upgrading

Something moved. `relations` → `defineRelations`, `getTableColumns` → `getColumns`, `.enableRLS()` → `pgTable.withRLS`, `drizzle-zod` → `drizzle-orm/zod`, and `knex` / `kysely` / `prisma` / `gel` adapters are gone. Full map in [versions.md](versions.md).

If it is `createDrizzle`, that is not a Drizzle export in any version — it is example code from Supabase's RLS guide.

## `NaN` in the UI from a numeric column

`numeric` and `decimal` return **strings** so exact decimals survive. `date` does too. Convert explicitly at the point of use; the full mapping is in [schema.md](schema.md).

## Types are `any`, or inference crawls

A large schema in one file plus `select()` with many joins makes TypeScript work hard. Narrow selects to the columns you need, split very large schema files by domain, and check `strict` is on — Drizzle's inference degrades badly without it.

If the editor disagrees with `svelte-check`, the check script is the gate: it type-checks `.svelte` files that a plain `tsc` invocation skips.

## Drizzle and supabase-js disagree about the data

They are different paths to the same database: supabase-js goes through PostgREST as `anon`/`authenticated` with RLS applied, Drizzle connects directly as a bypassing role. Different visible rows for the same "user" is the expected consequence, not a bug — decide which path owns which operation.
