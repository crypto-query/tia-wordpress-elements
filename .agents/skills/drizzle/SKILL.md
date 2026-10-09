---
name: drizzle
description: Drizzle ORM on Supabase Postgres in SvelteKit — schema and relations, drizzle-kit migrations, RLS, the postgres-js connection, and the 0.45/1.0 split. Use when writing or reviewing Drizzle schema or queries, wiring a database into a server route, load function or remote function, running drizzle-kit, or debugging a query that returns the wrong rows.
version: 1.0.0
scope: integration
distribution: author-only
---

# Drizzle

Drizzle is a headless TypeScript ORM: you declare tables in TypeScript, and `drizzle-kit` diffs those declarations against the database to write SQL migrations. Zero dependencies, no runtime schema — the types *are* the schema.

Two facts drive nearly every mistake below.

**The split.** `npm latest` is **`drizzle-orm@0.45.2` / `drizzle-kit@0.31.10`**, while **`orm.drizzle.team` documents 1.0** (`rc` is `1.0.0-rc.4`, `beta` is `1.0.0-beta.22`). So `add drizzle-orm` installs a library the current documentation does not describe, and the two lines disagree on the relational query API, the `drizzle()` signature, the migration folder format, and which schemas drizzle-kit manages. **Read `node_modules/drizzle-orm/package.json` before writing a relational query.** Both lines are covered here; every claim is labelled with the version it was measured on.

**Drizzle does not obey RLS.** The connection string Supabase hands you authenticates as `postgres`, a role with `rolbypassrls` — so the policies in your schema do nothing on a Drizzle query. This is measured, not theoretical, and [supabase.md](references/supabase.md) has the impersonation fix.

Everything here was verified on 15 August 2026 against `drizzle-orm` 0.45.2 and 1.0.0-rc.4, `drizzle-kit` 0.31.10 and 1.0.0-rc.4, `postgres` 3.4.9 and `sv` 0.17.0, by running queries and migrations against a real PostgreSQL 15 database — not read off the docs.

## Where to look

| File | Read it for |
|---|---|
| [versions.md](references/versions.md) | **the split**: how to tell which line you are on, the v0→v1 rename map, what was removed, migration-format incompatibility |
| [supabase.md](references/supabase.md) | connection modes and `prepare: false`, the **RLS bypass** and impersonation, `drizzle-orm/supabase` helpers, `schemaFilter`, coexisting with Supabase CLI migrations |
| [sveltekit.md](references/sveltekit.md) | `sv add drizzle`, server-only placement, env modules, load functions / actions / remote functions, the client singleton, deployment |
| [schema.md](references/schema.md) | declaring tables and columns, relations in **both** APIs, policies and roles, generated types |
| [queries.md](references/queries.md) | relational queries v1 vs v2, the SQL-like builder, joins, transactions, prepared statements |
| [migrations.md](references/migrations.md) | `drizzle-kit` commands, `generate` vs `push`, config, both folder formats |
| [troubleshooting.md](references/troubleshooting.md) | symptom-first: wrong rows, `db.query` undefined, prepared-statement errors, drizzle-kit wanting to drop half the database |

## Working rules

**Check the installed version before writing a relational query.** The two lines share a spelling and disagree on meaning, and the failure is silent rather than loud — a v1-style `where` callback on 1.0 returns *every* row. One `grep version node_modules/drizzle-orm/package.json` settles it. [versions.md](references/versions.md).

**Treat a Drizzle query as a superuser query.** RLS is not a safety net here: the default connection bypasses it, so every ownership check must be an explicit `where` clause you wrote, or a deliberate impersonating transaction. Reviewing a Drizzle query on Supabase means asking "what stops this returning another tenant's rows?" and finding the answer in the query itself.

**Pass `prepare: false` when the connection goes through the transaction pooler.** Port `6543` (Supavisor transaction mode) does not support prepared statements, and postgres-js prepares by default. The official `sv add drizzle` scaffold omits this, so a Supabase project fails on the scaffold's own client.

**Keep Drizzle under `$lib/server/` or in a `.server.ts` file.** SvelteKit enforces the boundary at build time; importing your schema module from shared code drags the driver and your connection string toward the client bundle. Importing *types* is free — `import type`.

**Pin `schemaFilter: ['public']` on Supabase.** A Supabase database carries `auth`, `storage`, `realtime`, `vault` and more. drizzle-kit 1.0 introspects **all** schemas by default (0.x defaulted to `public`), so an unpinned `pull` or `push` puts Supabase's own managed tables under Drizzle's control.

**`generate` then `migrate` once anyone else shares the database; `push` only against a database you can drop.** `push` diffs and mutates directly, leaving no file to review, no history and no way to replay. It is the right tool for a local scratch loop and the wrong one everywhere after.

**For API detail beyond these files, read `llms-full.txt`.** Upstream publishes `https://orm.drizzle.team/llms.txt` (~37 KB, an index) and `https://orm.drizzle.team/llms-full.txt` (~3.5 MB, the entire documentation). It describes **1.0** — treat it as authoritative for the RC and as aspirational for 0.45. The npm package itself ships only a `README.md`: no `AGENTS.md`, no bundled agent docs. There is no first-party Drizzle agent skill; the ones in public registries are third-party.

## Corrections to common assumptions

Ordered by how often each one produces broken or unsafe code:

- **A v1-style `where` callback on 1.0 is silently ignored — it does not throw.** `db.query.users.findMany({ where: (u, { eq }) => eq(u.name, 'grace') })` returned all three rows on `1.0.0-rc.4`, and `findFirst` returned the *wrong* row; the emitted SQL had no `WHERE` clause at all. Training data is saturated with this syntax, so an ownership check written from memory silently becomes "return everything". On 1.0 the filter is an object: `where: { name: 'grace' }`.
- **RLS policies do not constrain a Drizzle query.** Measured: with two rows protected by a `(select auth.uid()) = owner` policy, the default connection returned both, and `select rolbypassrls` on the connected role came back `true`. Only a transaction that does `set local role authenticated` plus `set_config('request.jwt.claims', …)` filtered correctly.
- **`relations()` is gone in 1.0; `defineRelations()` does not exist in 0.45.** They are not aliases — v1 declares relations per table, v1.0 declares them for the whole schema in one call, with `through` for many-to-many. Verified: `'defineRelations' in orm` is `false` on 0.45.2 and `true` on the RC, where `'relations' in orm` is `false`.
- **On 1.0 you cannot pass a client positionally.** `drizzle(client, config)` is 0.45's signature; the RC accepts `[string]`, `[string, config]` or a single config object, so an existing `postgres.Sql` must go in as `drizzle({ client, relations })`. The positional form fails at runtime too, not only in the type-checker — which matters because Supabase *requires* you to build the client yourself for `prepare: false`.
- **On 1.0, `{ schema }` gives you no `db.query` at all.** `drizzle(client, { schema })` leaves `db.query` `undefined`, so the first relational call throws on a property of undefined. 1.0 wants `{ relations }`; `schema` no longer powers the relational API.
- **`createDrizzle` is not exported by `drizzle-orm`.** Grepping both installed versions finds nothing. The `createDrizzle` / `db.rls(tx => …)` helper in Supabase's RLS guide is **example code you copy into your project**, not an import.
- **`crudPolicy` is Neon-only.** It lives in `drizzle-orm/neon` in both versions and there is no Supabase equivalent — write `pgPolicy` by hand. The Supabase subpath exports roles, `authUsers`, `authUid`, `realtimeMessages` and `realtimeTopic`, and nothing that generates policies.
- **Defining a `pgPolicy` on a table already enables RLS on it.** The generated SQL carried `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for a table that only had a policy and never called `.enableRLS()`. Adding both is harmless; assuming a policy-less table is protected is not.
- **The migration folders are mutually unreadable.** 0.x writes `0000_name.sql` beside `meta/_journal.json`; 1.0 writes `<timestamp>_<name>/migration.sql` beside `snapshot.json` and has no journal. Upgrading is a folder conversion, not a version bump.
- **`drizzle-zod`, `drizzle-valibot`, `drizzle-arktype` and `drizzle-typebox` are separate packages on 0.45 and folded into core on 1.0** as `drizzle-orm/zod`, `/valibot`, `/arktype`, `/typebox` (plus `/effect-schema`). Installing the standalone package alongside 1.0 gets you two copies of the same generator.
- **1.0 drops the `knex`, `kysely`, `prisma` and `gel` adapters** and adds `cockroach-core`, `mssql-core`, `node-sqlite`, `tursodatabase` and the `effect-*` drivers. `bun-sql` also gains dialect subpaths (`bun-sql/postgres`) while the bare path keeps working.
- **`getTableColumns` still works on 1.0 — it is deprecated, not removed.** Both names are exported by the RC; only `getTableColumns` exists on 0.45. Prefer `getColumns` when you are on 1.0.
- **`.enableRLS()` still exists on 1.0 despite the changelog calling it removed.** The method is present and returns the table. `pgTable.withRLS('name', {…})` is the 1.0 spelling and is absent from 0.45.
- **`sv add drizzle` scaffolds the 0.x line and is not Supabase-ready.** `sv` 0.17.0 pins `drizzle-orm ^0.45.2` / `drizzle-kit ^0.31.10`, writes a client with no `prepare: false`, and puts `drizzle-orm` and `postgres` in `devDependencies`. It is a good starting point that needs three edits for Supabase — [sveltekit.md](references/sveltekit.md) lists them.
- **Drizzle is not a Supabase client replacement.** It speaks Postgres over TCP; Auth, Storage, Realtime and Edge Functions still need `@supabase/supabase-js`. The two coexist, and `drizzle-orm/supabase` exists precisely to reference `auth.users` from a Drizzle schema.

## Related skills

- **svelte-sveltekit** — the framework side: `$lib/server`, `$env/*`, load functions, form actions, remote functions, adapters
- **typescript** — inference on wide schema objects, `satisfies`, and why `noUncheckedIndexedAccess` bites on query results
- **effect** — 1.0 ships `drizzle-orm/effect-postgres` and an `effect-schema` bridge, if the backend is already Effect-shaped
