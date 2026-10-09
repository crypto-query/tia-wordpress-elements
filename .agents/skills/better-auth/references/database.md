# Database, schema and the `auth` CLI

Better Auth owns its tables and hands you the schema; you own the migration. Nothing is created at runtime.

## The CLI is the `auth` package

```bash
npx auth@latest generate    # write the schema file for your ORM
npx auth@latest migrate     # apply it — built-in (Kysely) adapter only
npx auth@latest secret      # generate a strong BETTER_AUTH_SECRET
npx auth@latest info        # dump the resolved config, adapter and versions
npx auth@latest mcp         # register the docs MCP server with your agent
npx auth@latest upgrade     # bump better-auth packages to the CLI's version
```

`auth` is versioned in lockstep with the library — 1.6.29 for both at the time of writing. **`@better-auth/cli` is the old name and is frozen at 1.4.21 from April 2026**, yet the docs and the official skill pack still tell you to run `npx @better-auth/cli@latest migrate`. Upstream's own 1.7 release notes have moved to `npx auth`.

Useful flags on `generate`: `--config` (path to the module exporting `auth`), `--output` (where to write), `--adapter` and `--dialect` (generate without a configured adapter), `-y`. `migrate` takes only `--config`, `--cwd` and `-y`.

`--config` points at a real module the CLI imports, so it must load outside a running SvelteKit server. Keeping `auth.ts` to `$env/dynamic/private` and `$app/server` imports is enough; request-scoped or conditional construction is not.

## Which command applies to you

| Adapter | Generate | Apply |
|---|---|---|
| Built-in (Kysely over a raw connection) | not needed | `auth migrate` |
| Drizzle | `auth generate --output …/auth.schema.ts` | `drizzle-kit push` (dev) or `generate` + `migrate` |
| Prisma | `auth generate --output prisma/schema.prisma` | `prisma migrate dev` |
| Mongo | schemaless | — |

`auth migrate` works **only** with the built-in adapter. On Drizzle or Prisma it cannot help — that ORM's own migration tool applies the change. Running the wrong one is a common dead end.

Re-run `generate` after adding any plugin: `organization()`, `twoFactor()`, `admin()` and friends all add tables or columns, and the plugin's endpoints fail at runtime against a stale schema.

## The four core tables

`user`, `session`, `account`, `verification`.

- **`user`** — `id`, `name`, `email` (unique), `emailVerified`, `image`, timestamps.
- **`session`** — `id`, `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `userId`, timestamps. Indexed on `userId`.
- **`account`** — one row per credential or linked provider, holding OAuth tokens and the password hash for email/password users. Indexed on `userId`.
- **`verification`** — email-verification and password-reset tokens, indexed on `identifier`.

`session` and `account` cascade on user delete. Password hashes live in `account`, not `user` — a detail worth knowing before writing a query that "gets the user with their password".

Extra columns go through `user: { additionalFields: { … } }` so they survive regeneration, never by hand-editing the generated file. Anything you write into that file is overwritten: the CLI prints `Schema was overwritten successfully!` and means it.

## With Drizzle

`sv add better-auth` wires this up already: `auth generate` writes `src/lib/server/db/auth.schema.ts`, and `src/lib/server/db/schema.ts` re-exports it (`export * from './auth.schema'`) so one `schema` object covers app and auth tables.

```ts
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

database: drizzleAdapter(db, { provider: 'sqlite' })   // 'pg' | 'mysql' | 'sqlite'
```

Note `provider: 'pg'` for PostgreSQL — `generate --dialect postgresql` maps to it, but the adapter option itself wants the short name.

**The generated file uses `relations()`, the Drizzle 0.45 API.** Drizzle 1.0 replaced it with `defineRelations()`, so on the 1.0 line the output needs converting after every regeneration. Check which line you are on before wiring the output into your schema — the **drizzle** skill covers the split.

Point the Drizzle adapter at the same `db` instance the rest of the app uses. Two instances means two connection pools.

## Verifying it worked

```bash
curl -s http://localhost:5173/api/auth/ok    # {"ok":true}
```

That endpoint answers as soon as the handler is mounted, so it separates "handler not reachable" from "database wrong" from "credentials wrong" in one call. A 404 here is a `baseURL`/mount problem, not a schema problem — [config.md](config.md).

Then sign up once and read the row:

```bash
curl -si -X POST http://localhost:5173/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"password1234","name":"Grace"}'
```

A 200 with a `set-cookie: better-auth.session_token=…` header means the whole path — handler, adapter, schema, cookies — is working.
