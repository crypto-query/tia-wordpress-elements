# Declaring a schema

The TypeScript declaration is the schema. drizzle-kit diffs it against the database; the app infers its types from it.

## Tables and columns

```ts
import { pgTable, uuid, text, integer, numeric, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  views: integer('views').notNull().default(0),
  price: numeric('price', { precision: 10, scale: 2 }),
  meta: jsonb('meta').$type<{ tags: string[] }>().default({ tags: [] }),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('posts_slug_idx').on(t.slug),
  index('posts_created_idx').on(t.createdAt.desc()),
]);
```

Notes that matter:

- The second argument is the **database** name; the object key is the TypeScript name. Passing the string is optional in recent versions, but writing `snake_case` explicitly keeps SQL conventional and TypeScript idiomatic, and it survives the 1.0 casing rework.
- The third argument returns an **array** of indexes and constraints. Older examples return an object — that form is deprecated.
- `$type<T>()` narrows a `json`/`jsonb` column without changing the SQL. It is an assertion, not validation: nothing checks that stored rows match.
- `.$defaultFn(() => …)` generates a value in JS per insert; `.default(…)` and `.defaultNow()` emit a database default. Only the database default applies to rows written by anything other than your app.
- `.$onUpdate(() => new Date())` maintains an `updatedAt` from the client side. A trigger is the only version that also covers writes from SQL or the dashboard.

## What each column returns

Measured through `postgres-js`. The string-typed ones are the common source of silent bugs:

| Column | JS type | Watch for |
|---|---|---|
| `integer`, `real`, `doublePrecision` | `number` | |
| `numeric` / `decimal` | **`string`** | exact decimals; arithmetic on it yields `NaN` |
| `bigint({ mode: 'number' })` | `number` | unsafe above 2^53 |
| `bigint({ mode: 'bigint' })` | `bigint` | `JSON.stringify` throws on it |
| `text`, `varchar`, `uuid` | `string` | |
| `boolean` | `boolean` | |
| `timestamp`, with or without timezone | `Date` | |
| `date` | **`string`** | `'2026-08-15'`; use `{ mode: 'date' }` for a `Date` |
| `json`, `jsonb` | object | |

Choose the type for the data, then convert at the edge — moving money to `doublePrecision` to get a `number` trades correctness for convenience.

## Enums, schemas, views

```ts
import { pgEnum, pgSchema, pgView } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'member']);        // a real Postgres enum type
export const analytics = pgSchema('analytics');                      // non-public schema
export const events = analytics.table('events', { /* … */ });
```

A `pgEnum` is a database type: adding a value is a migration, and removing one is a rewrite. A `text` column with a CHECK constraint, or a lookup table, changes more cheaply — pick the enum when the set is genuinely fixed.

If you declare tables in a non-`public` schema, keep `schemaFilter` in the Kit config in step or the diff will not see them.

## Relations

Relations are a **client-side** concept: they teach the relational query API how tables connect and emit no SQL of their own. Foreign keys are separate — `.references(…)` is what creates the constraint. Declaring one without the other is legal and occasionally right, but usually a mistake.

### 0.45 — `relations()`, one call per table

```ts
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

Export them alongside the tables and pass the whole module as `schema`:

```ts
import * as schema from './schema';
export const db = drizzle(client, { schema });
```

Many-to-many needs the junction table declared as a table with its own relations, and queries nest through it.

### 1.0 — `defineRelations()`, once for the schema

```ts
// relations.ts
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
  users: {
    posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }),
    groups: r.many.groups({                       // native many-to-many
      from: r.users.id.through(r.usersToGroups.userId),
      to: r.groups.id.through(r.usersToGroups.groupId),
    }),
  },
  posts: {
    author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
  },
}));
```

```ts
export const db = drizzle({ client, relations });
```

`through` collapses the junction hop, so `with: { groups: true }` returns groups directly instead of an array of join rows.

## RLS, policies and roles

```ts
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
}, (t) => [
  pgPolicy('owner reads own notes', {
    as: 'permissive',      // or 'restrictive'
    for: 'select',         // 'all' | 'select' | 'insert' | 'update' | 'delete'
    to: authenticatedRole,
    using: sql`(select auth.uid()) = ${t.ownerId}`,   // filters existing rows
    withCheck: sql`(select auth.uid()) = ${t.ownerId}`, // validates written rows
  }),
]);
```

- **A policy on a table enables RLS on that table** — verified in the generated SQL. Enable it explicitly (`.enableRLS()` on 0.45, `pgTable.withRLS(…)` on 1.0) for tables that should be locked down with *no* policy, which yields default-deny.
- `using` governs reads and the visibility half of updates and deletes; `withCheck` governs what may be written. A policy `for: 'all'` with only `using` lets a user write rows they then cannot see.
- `pgRole('name').existing()` references a role Kit must not create.
- `.link(table)` attaches a policy to a table declared elsewhere.
- On Supabase, RLS does not constrain your Drizzle queries at all — see [supabase.md](supabase.md) before relying on any of this.

## Inferred types

```ts
type Post = typeof posts.$inferSelect;   // what a select returns
type NewPost = typeof posts.$inferInsert; // what an insert accepts (defaults optional)
```

Prefer these over hand-written interfaces — they cannot drift. For a query with joins or partial columns, infer from the query instead: `Awaited<ReturnType<typeof getPosts>>`.

To derive validators from the schema, use `drizzle-zod` on 0.45 or `drizzle-orm/zod` on 1.0 (likewise `/valibot`, `/arktype`, `/typebox`, `/effect-schema`):

```ts
import { createInsertSchema } from 'drizzle-zod';
export const insertPostSchema = createInsertSchema(posts, {
  title: (s) => s.min(1).max(200),   // refine individual fields
});
```

This keeps one definition behind both the table and the form validation — worth it precisely where a remote function or action validates untrusted input.
