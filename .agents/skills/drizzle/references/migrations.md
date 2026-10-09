# drizzle-kit

drizzle-kit is a separate CLI that reads your schema file, diffs it against a stored snapshot or a live database, and writes SQL. It never runs in your app.

## Config

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/db/schema.ts',   // file, glob, or array
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_URL! },
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
```

`process.env` — not `$env/*` — because the CLI runs outside SvelteKit. `strict: true` asks before applying; `verbose: true` prints the statements. Point `dbCredentials` at a **direct or session** connection: DDL and migration locks want a stable session.

Multiple configs are fine (`--config=path`) when one project spans databases.

## Commands

| Command | Does |
|---|---|
| `generate` | diff schema against the last snapshot, write a new SQL migration |
| `migrate` | apply pending migrations, recording them in a tracking table |
| `push` | diff schema against the **live database** and apply it directly, no file |
| `pull` | introspect a live database into a TypeScript schema (also called `introspect`) |
| `check` | detect conflicting/corrupt migrations, e.g. after a bad merge |
| `up` | upgrade old snapshot files to the current format |
| `studio` | browser UI over the database |

## generate + migrate, or push

**`generate` + `migrate`** is the default and the only safe option once a database is shared. You get a reviewable SQL file, an ordered history, and a replayable path from empty to current. Review the SQL before applying — the diff engine cannot tell a rename from a drop-plus-add, and will happily emit the destructive version. When it does, edit the generated file to use `ALTER TABLE … RENAME` before it runs anywhere.

**`push`** skips the file and mutates the database. It is the right tool for a fast local loop against a database you can drop, and the wrong tool everywhere else: no history, no review, no rollback, and its drop suggestions on a shared database are exactly the accidents you cannot undo. `sv add drizzle` sets up `db:push` first because it is the quickest way to see something work — move to `generate`/`migrate` before anyone else touches the database.

Typical loop:

```bash
bun run db:generate     # writes drizzle/0001_x.sql — read it
bun run db:migrate      # applies it
```

Applying at deploy time is a pipeline step, not something `hooks.server.ts` should do; a scaled-out app would run it once per instance simultaneously.

The `migrate()` function exported from `drizzle-orm/<driver>/migrator` does the same thing in-process, for a one-shot job or a container entrypoint:

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
await migrate(db, { migrationsFolder: './drizzle' });
```

Give it a **direct** connection with `max: 1`, and end the client afterwards.

## Folder formats

Two incompatible layouts, one per line:

```
# 0.x
drizzle/
  0000_lively_hawkeye.sql
  meta/_journal.json
  meta/0000_snapshot.json

# 1.0
drizzle/
  20260815114025_lively_hawkeye/migration.sql
  20260815114025_lively_hawkeye/snapshot.json
```

1.0 drops the journal and groups each migration in its own timestamped directory, which removes the merge conflict two branches used to get in `_journal.json`. Commit whichever you have; do not hand-edit snapshots.

## Introspecting an existing database

`pull` writes `schema.ts`, `relations.ts` and a baseline migration from a live database. It is the right start when the database already exists — including a Supabase project built through the dashboard.

**Pin `schemaFilter` first.** Measured against a database carrying `auth` and `storage` schemas: drizzle-kit 0.31.10 pulled 2 public tables, while 1.0.0-rc.4 pulled 4, generating `pgSchema('auth')` and `pgSchema('storage')` declarations that then become Kit-managed objects. Also set `entities.roles.provider` on a managed platform so Kit does not try to own the platform's roles. Both settings are in [supabase.md](supabase.md).

Expect to clean up after a pull: generated names are mechanical, and check constraints and some defaults come through as raw SQL.

## Multiple writers

If anything other than drizzle-kit changes the schema — a dashboard, a DBA, another service — Kit sees it as drift and proposes to undo it. Either give Kit exclusive ownership of a schema and fence it with `schemaFilter`, or let the other system own the schema and use `pull` only. Choosing neither produces migrations that fight each other.

Run `check` in CI to catch two branches that each generated a migration from the same parent snapshot. Resolve by regenerating the later one, not by renumbering files.
