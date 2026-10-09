# Querying

Drizzle offers two query styles over the same schema. The **SQL-like builder** (`db.select()…`) mirrors SQL and is identical across both versions. The **relational query builder** (`db.query.<table>`) returns nested objects in one round trip — and is the thing 1.0 rewrote.

## The SQL-like builder

```ts
import { eq, and, or, not, ilike, inArray, gt, gte, lt, isNull, desc, asc, count, sum, sql } from 'drizzle-orm';

const rows = await db
  .select({ id: posts.id, title: posts.title, author: users.name })
  .from(posts)
  .innerJoin(users, eq(posts.authorId, users.id))
  .where(and(eq(posts.published, true), ilike(posts.title, `%${term}%`)))
  .orderBy(desc(posts.createdAt))
  .limit(20)
  .offset(page * 20);
```

`select()` with no argument returns every column; a partial object narrows both the SQL and the return type. Every operator is an import — there is no `where({ id: 1 })` in this builder.

Writes:

```ts
const [post] = await db.insert(posts).values({ title, slug }).returning();

await db.insert(posts).values(rowsArray);                       // multi-row, one statement

await db.insert(posts)                                          // upsert
  .values({ slug, title })
  .onConflictDoUpdate({ target: posts.slug, set: { title } });

await db.update(posts).set({ views: sql`${posts.views} + 1` }).where(eq(posts.id, id));

await db.delete(posts).where(eq(posts.id, id));
```

`.returning()` is Postgres-only and free — prefer it over a follow-up select. An `update` or `delete` with no `where` hits every row and Drizzle will not stop you.

Aggregates and raw SQL:

```ts
const [{ total }] = await db.select({ total: count() }).from(posts).where(eq(posts.published, true));

await db.execute(sql`select * from search_posts(${term})`);
```

`sql` interpolation is parameterised — `${term}` becomes a bind parameter, not string concatenation. `sql.raw()` is not; it is for identifiers you control and never for user input.

Build conditions incrementally with `$dynamic()`:

```ts
let q = db.select().from(posts).$dynamic();
if (term) q = q.where(ilike(posts.title, `%${term}%`));
if (limit) q = q.limit(limit);
const rows = await q;
```

Without `$dynamic()`, a second `.where()` replaces the first rather than combining — collect conditions in an array and `and(...conditions)` instead.

Queries are lazy: nothing executes until awaited. `.toSQL()` returns `{ sql, params }` without touching the database, which is the cheapest way to assert a query is shaped the way you think.

## Relational queries

One statement, nested results, no manual join or regrouping. **The syntax differs by version and the mismatch is silent** — see [versions.md](versions.md).

### 0.45

Requires `drizzle(client, { schema })` where `schema` includes the `relations()` exports.

```ts
const result = await db.query.posts.findMany({
  where: (p, { eq, and }) => and(eq(p.published, true), eq(p.authorId, userId)),
  orderBy: (p, { desc }) => [desc(p.createdAt)],
  columns: { id: true, title: true },
  with: { author: { columns: { name: true } }, comments: true },
  limit: 20,
});

const one = await db.query.posts.findFirst({ where: (p, { eq }) => eq(p.slug, slug) });
```

`where` and `orderBy` are callbacks receiving the table and an operator bag.

### 1.0

Requires `drizzle({ client, relations })`. Filters are objects:

```ts
const result = await db.query.posts.findMany({
  where: { published: true, authorId: userId },        // implicit AND
  orderBy: { createdAt: 'desc' },
  columns: { id: true, title: true },
  with: { author: { columns: { name: true } }, comments: true },
  limit: 20,
});
```

Operators nest inside the field, and `AND` / `OR` / `NOT` / `RAW` compose:

```ts
where: {
  views: { gt: 100 },
  title: { like: 'M%' },
  OR: [{ authorId: userId }, { published: true }],
  author: { name: { like: 'A%' } },     // filter on a related table
}
```

Filtering by a relation's columns is new in 1.0 and replaces a manual join.

**The failure to watch:** a 0.45-style callback passed to 1.0 is ignored rather than rejected. Measured on `1.0.0-rc.4`, `where: (u, { eq }) => eq(u.name, 'grace')` produced `select … from "users"` with no `WHERE` clause, returning all rows from `findMany` and an arbitrary row from `findFirst`. Nothing logs. When migrating, grep for `where: (`.

### Choosing between the two builders

Reach for the relational builder when you want a nested object graph — it is one query, and it beats hand-rolled joins plus regrouping. Reach for the SQL-like builder for aggregates, window functions, set operations, `returning()`, and anything where you care about the exact SQL. Mixing them in one codebase is normal.

The relational builder always emits a single statement, so it cannot silently N+1. It also has no `join` escape hatch: if you need a condition the relation does not express, use the SQL-like builder.

## Transactions

```ts
const result = await db.transaction(async (tx) => {
  const [order] = await tx.insert(orders).values({ userId }).returning();
  await tx.insert(orderItems).values(items.map((i) => ({ ...i, orderId: order.id })));
  return order;
});
```

Use `tx`, never `db`, inside the callback — a stray `db` call runs on a different connection outside the transaction, and will not roll back. Throwing rolls back; `tx.rollback()` does it explicitly.

Keep transactions short. They hold a connection for their whole lifetime, which is scarce behind a pooler, and never `await` an HTTP call inside one.

Set the isolation level where it matters:

```ts
await db.transaction(async (tx) => { /* … */ }, { isolationLevel: 'serializable' });
```

Nested `transaction()` calls become savepoints.

## Prepared statements

```ts
import { sql } from 'drizzle-orm';

const getPostBySlug = db.query.posts
  .findFirst({ where: (p, { eq }) => eq(p.slug, sql.placeholder('slug')) })
  .prepare('get_post_by_slug');

const post = await getPostBySlug.execute({ slug });
```

This skips query construction on each call. **It is incompatible with the Supabase transaction pooler** (port 6543), which is exactly why the client is built with `prepare: false` — see [supabase.md](supabase.md). On a session or direct connection it is a real win for hot paths only; elsewhere the saving is noise.

## Counting and pagination

`count()` is a separate query. For keyset pagination — which stays correct and fast as offsets grow — order by an indexed unique column and filter on the last seen value:

```ts
.where(and(eq(posts.published, true), lt(posts.createdAt, cursor)))
.orderBy(desc(posts.createdAt))
.limit(20)
```

`offset` re-scans everything it skips; it is fine for small pages and poor for deep ones.
