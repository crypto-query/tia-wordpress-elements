# The split: 0.45 and 1.0

Drizzle is shipping 1.0 through a long release-candidate phase while `npm latest` still points at the 0.x line. The documentation site describes 1.0. Nothing warns you about the mismatch at install time.

## Which line am I on?

```bash
grep '"version"' node_modules/drizzle-orm/package.json
grep '"version"' node_modules/drizzle-kit/package.json
```

As of 15 August 2026:

| dist-tag | drizzle-orm | drizzle-kit |
|---|---|---|
| `latest` | `0.45.2` | `0.31.10` |
| `beta` | `1.0.0-beta.22` | `1.0.0-beta.22` |
| `rc` | `1.0.0-rc.4` | `1.0.0-rc.4` |

A plain `add drizzle-orm` gets `0.45.2`. `add drizzle-orm@rc` gets a different library. The npm registry also carries dozens of branch-named tags (`effect`, `codecs`, `kit-introspect`, …) publishing `1.0.0-*` builds — those are upstream's CI channels, not releases; never pin one.

**Keep `drizzle-orm` and `drizzle-kit` on the same line.** Kit reads and writes the snapshot format the ORM's schema builders produce; mixing 0.31 with a 1.0 ORM (or the reverse) produces confusing diffs rather than a clean error.

A fast runtime discriminator, if you cannot read the file:

```ts
import * as orm from 'drizzle-orm';
const isV1 = 'defineRelations' in orm; // true on 1.0, false on 0.45
```

## What changed

Verified by diffing the two installed packages and running both.

### Relational queries

The whole relational API was rewritten. This is the change that breaks code silently rather than loudly — see [queries.md](queries.md) for both dialects side by side.

| | 0.45 | 1.0 |
|---|---|---|
| declare | `relations(table, ({ one, many }) => …)` per table | `defineRelations(schema, (r) => …)` once |
| construct | `drizzle(client, { schema })` | `drizzle({ client, relations })` |
| filter | `where: (t, { eq }) => eq(t.x, 1)` | `where: { x: 1 }` |
| sort | `orderBy: (t, { asc }) => [asc(t.id)]` | `orderBy: { id: 'asc' }` |
| many-to-many | nest through the junction table | `through` on the relation |
| exports | `relations` | `defineRelations` (`relations` removed) |

### The `drizzle()` signature

0.45 accepts a client or a URL positionally:

```ts
drizzle(client)                    // ok
drizzle(client, { schema })        // ok
drizzle(process.env.DATABASE_URL!) // ok
```

1.0 narrows the positional form to a connection string. An existing client must arrive inside the config object:

```ts
drizzle(process.env.DATABASE_URL!)          // ok
drizzle(url, { relations })                 // ok
drizzle({ client, relations })              // ok — the only way to pass a client
drizzle(client, { relations })              // fails: type error AND runtime failure
```

That last line matters more than it looks: Supabase's transaction pooler forces you to construct `postgres(url, { prepare: false })` yourself, so every Supabase project on 1.0 uses the object form.

### Renamed and removed

- `getTableColumns` → `getColumns`. Both exist on 1.0 (the old name is deprecated, not deleted); only the old name exists on 0.45.
- `.enableRLS()` → `pgTable.withRLS('name', {…})`. The old method is still callable on 1.0 and returns the table; `withRLS` is absent from 0.45.
- `.array().array()` → `.array('[][]')`.
- `.generatedAlwaysAs('expr')` → `.generatedAlwaysAs(sql\`expr\`)` — SQL only, no raw strings.
- `drizzle({ casing: 'camelCase' })` → table-level `snakeCase.table(…)` / `camelCase.table(…)`.
- Validator packages fold into core: `drizzle-zod` → `drizzle-orm/zod`, and likewise `/valibot`, `/arktype`, `/typebox`, plus a new `/effect-schema`.
- Adapters removed: `knex`, `kysely`, `prisma`, `gel`.
- Adapters added: `cockroach-core`, `mssql-core`, `node-sqlite`, `tursodatabase`, `netlify-db`, and the `effect-*` driver family. `bun-sql` gains `bun-sql/postgres` / `/mysql` / `/sqlite` subpaths; the bare `drizzle-orm/bun-sql` still resolves.
- Removed entities: `Relations`, `getOperators`, `createOne`, `createMany`, `normalizeRelation`.

### drizzle-kit

- **`schemaFilter` now defaults to every schema** instead of `['public']`. Measured against a database carrying `auth` and `storage`: 0.31.10 `pull` fetched 2 tables, 1.0.0-rc.4 `pull` fetched 4 and emitted `pgSchema('auth')` / `pgSchema('storage')` declarations. On Supabase this is destructive — always pin it.
- **Migration folder format v3.** 0.x: `0000_name.sql` plus `meta/_journal.json` and `meta/0000_snapshot.json`. 1.0: `20260815114025_name/migration.sql` plus `snapshot.json` in the same directory, and no journal file. A 0.x folder is not readable by 1.0 Kit.
- `push --strict` removed — that behaviour is the default; `--force` skips the confirmation.
- `drizzle-kit drop` removed.
- Config files may use top-level `await`.

### Also new in 1.0

JIT mappers (`jit: true`), codecs for driver-aware conversion, column aliases via `.as()`, SQL comments on queries, and migration conflict detection.

## Choosing a line

Pick **0.45** for anything you are shipping now: it is `latest`, it is what `sv add drizzle` installs, and its API matches the majority of examples in the wild.

Pick **1.0** when you want the v2 relational API — object filters and `through` many-to-many genuinely remove code — and can accept an RC under a version policy where `rc.4` and `rc.5` may still move. Note that `rc` builds do not follow semver ranges the way a stable release does; pin the exact version.

**Do not mix dialects in one codebase.** The two relational APIs share names and fail quietly across the boundary.

## Upgrading

1. Bump `drizzle-orm` and `drizzle-kit` together.
2. Replace every `relations()` block with one `defineRelations()` call.
3. Rewrite every `db.query` call's `where` / `orderBy` from callbacks to objects. **Grep for `where: (` — a missed one returns all rows instead of failing.**
4. Change `drizzle(client, { schema })` to `drizzle({ client, relations })`.
5. Pin `schemaFilter` before running any Kit command.
6. Regenerate the migration folder in the v3 layout; do not hand-edit the old one.
7. Re-point validator imports at `drizzle-orm/zod` and uninstall the standalone package.
