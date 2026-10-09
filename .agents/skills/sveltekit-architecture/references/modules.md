---
title: "Domain modules"
summary: "The anatomy of one domain module — service, port, adapter, fake, schema, types, tests — with the naming convention that makes the ring visible from the file list alone."
verified_against: "svelte 5.56.9, @sveltejs/kit 2.70.2, vite 8.2.1"
---

# Domain modules

A **module** is one domain concept — orders, billing, subscriptions, auth — owning everything that concept needs, together in one folder. Organise by concept, never by technical type: a `services/` folder beside a `repositories/` folder scatters one concept across the tree and means every change touches three directories.

```
src/lib/server/modules/orders/
├── service.ts          business rules — the entry point every caller uses
├── store.ts            persistence PORT: the interface the service depends on
├── store.drizzle.ts    ADAPTER: the only file that touches the orders tables
├── store.memory.ts     FAKE: what tests inject
├── schema.ts           input validation, at the boundary — until the client validates too
├── types.ts            domain types shared inside the module
├── errors.ts           the failures this domain can have
└── service.test.ts     tests the service against the fake
```

## The naming convention

The convention is the documentation. `<port>.ts` is an interface; `<port>.<vendor>.ts` implements it.

| Name | Is | Rule |
|---|---|---|
| `store.ts` | persistence port | interface only — no import of a database client |
| `store.drizzle.ts` | production adapter | the only file in the app that touches this domain's tables |
| `store.memory.ts` | in-memory fake | same interface, arrays instead of SQL |
| `gateway.ts` | outbound-vendor port | what any payment/mail/SMS vendor must provide |
| `gateway.stripe.ts` | production adapter | the only file importing the vendor SDK |

Reading `ls` tells you which files may import a vendor: exactly the ones with a vendor in the name. That property is the point — it makes a violation visible without reading code.

**Declare a port only where a second implementation exists.** The fake counts as the second, so anything the service must be tested without — the database, the queue, the payment vendor, the clock — earns one. A logger, a formatter, a pure helper does not: import it directly and skip the hop.

## The service

`service.ts` is the entry point every caller uses. It holds the rules and the orchestration, and it is written as if HTTP does not exist.

```ts
// src/lib/server/modules/orders/service.ts
import type { OrdersStore } from './store';
import type { Order, NewOrder } from './types';
import { OrderNotFound, OrderAlreadyPaid } from './errors';

export type CreateOrderDeps = { store: OrdersStore; now: () => Date };

export async function createOrder(input: NewOrder, deps: CreateOrderDeps): Promise<Order> {
	const order = await deps.store.insert({
		...input,
		status: 'pending',
		createdAt: deps.now()
	});

	return order;
}

export async function markPaid(id: string, deps: CreateOrderDeps): Promise<Order> {
	const order = await deps.store.byId(id);
	if (!order) throw new OrderNotFound(id);
	if (order.status === 'paid') throw new OrderAlreadyPaid(id);

	return deps.store.update(id, { status: 'paid', paidAt: deps.now() });
}
```

Four properties to hold onto, each of which a caller depends on:

- **It takes its dependencies.** `deps` is the seam. [wiring.md](wiring.md) covers where the concrete ones come from.
- **It raises domain errors**, never `error(404)`. `OrderNotFound` means the same thing to a page, an endpoint and a worker; a 404 only means something to one of them.
- **It returns domain types**, not rows and not a `Response`.
- **`now` is a dependency.** A service that calls `Date.now()` directly has a clock its tests cannot move.

## The port

An interface, and nothing else. No client import, no vendor type in the signature.

```ts
// src/lib/server/modules/orders/store.ts
import type { Order, NewOrder } from './types';

export interface OrdersStore {
	insert(order: NewOrder & { status: Order['status']; createdAt: Date }): Promise<Order>;
	byId(id: string): Promise<Order | null>;
	update(id: string, patch: Partial<Order>): Promise<Order>;
}
```

Keep the port's vocabulary domain-shaped. A method called `findOneAndUpdate` has leaked its database into the interface; `markPaid` has not.

## The adapter and the fake

They implement the same interface, so the service cannot tell them apart.

```ts
// src/lib/server/modules/orders/store.drizzle.ts
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/infrastructure/database/client';
import { orders } from '$lib/server/infrastructure/database/schema';
import type { OrdersStore } from './store';

export const drizzleOrdersStore: OrdersStore = {
	async insert(order) {
		const [row] = await db.insert(orders).values(order).returning();
		return row;
	},
	async byId(id) {
		const [row] = await db.select().from(orders).where(eq(orders.id, id));
		return row ?? null;
	},
	async update(id, patch) {
		const [row] = await db.update(orders).set(patch).where(eq(orders.id, id)).returning();
		return row;
	}
};
```

```ts
// src/lib/server/modules/orders/store.memory.ts
import type { OrdersStore } from './store';
import type { Order } from './types';

export function memoryOrdersStore(seed: Order[] = []): OrdersStore {
	const rows = new Map(seed.map((o) => [o.id, o]));
	let seq = seed.length;

	return {
		async insert(order) {
			const row = { ...order, id: `order_${++seq}` } as Order;
			rows.set(row.id, row);
			return row;
		},
		async byId(id) {
			return rows.get(id) ?? null;
		},
		async update(id, patch) {
			const row = { ...rows.get(id)!, ...patch };
			rows.set(id, row);
			return row;
		}
	};
}
```

The fake is a **factory**, not a module-level singleton — each test gets a clean one. A shared fake leaks state between tests exactly the way module-level state leaks between requests.

Note what the port's `insert` signature assumes: **the id is generated below the port**, by a column default or by the adapter. Written as above against a primary key with no default, the Drizzle adapter does not compile — `Property 'id' is missing`. Either give the column a default or put the id in the port's input type; deciding that quietly is what produces the error.

## Validation

Validate at the trust boundary, and let the module own the shape it accepts. A Standard Schema library (Valibot, Zod, ArkType) gives you one schema that both the form action and the remote function can use.

```ts
// src/lib/server/modules/orders/schema.ts
import * as v from 'valibot';

export const newOrderSchema = v.object({
	sku: v.pipe(v.string(), v.nonEmpty()),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1))
});

export type NewOrderInput = v.InferOutput<typeof newOrderSchema>;
```

The service takes the *parsed* type, so parsing is the caller's job and the service can assume its input is well-formed. That keeps one schema serving several callers instead of each re-deriving the rules.

One schema does not quite cover every caller, though: **a `<form>` sends every field as a string**, while a JSON endpoint sends real numbers and booleans. So a non-string field needs a coercing variant for the form callers, and the type-checker will not catch the difference — both satisfy the schema type, and only the form fails at runtime.

```ts
// same shape, form-shaped input
export const newOrderFormSchema = v.object({
	sku: v.pipe(v.string(), v.nonEmpty()),
	quantity: v.pipe(v.string(), v.transform(Number), v.number(), v.integer(), v.minValue(1))
});
```

Keep both beside each other, deriving the domain type from one of them, so the two cannot drift. (Kit's `form()` also requires every boolean in a form schema to be optional — an unchecked checkbox sends nothing at all.)

### Where the schema file lives

`src/lib/server/modules/<domain>/schema.ts` for as long as only the server validates. The moment the client validates too, the file has to move out of `$lib/server`.

Kit's `preflight` runs the schema in the browser before submitting, and a schema **cannot be exported from a `.remote.ts` file** — so it has to come from a module the component can import. Pointing a component at the module-ring copy fails the build:

```
Cannot import $lib/server/modules/orders/schema.ts into code that runs in the browser
 src/routes/preflight/+page.svelte imports
  $lib/server/modules/orders/schema.ts
```

So a client-validated schema lives in the shared ring — `src/lib/schema/orders.ts` — and every ring imports it from there. This costs nothing architecturally: a Standard Schema library is an ordinary dependency, not a Vite virtual module, so a module importing the shared schema stays portable. Verified once the file moved — the component preflights it, `vite build` succeeds, and the plain-Node worker still imports the service through it.

Move the file when the client needs it, and leave it in the module until then.

## Domain errors

```ts
// src/lib/server/modules/orders/errors.ts
export class OrderNotFound extends Error {
	readonly code = 'order_not_found' as const;
	constructor(readonly id: string) {
		super(`Order ${id} not found`);
	}
}

export class OrderAlreadyPaid extends Error {
	readonly code = 'order_already_paid' as const;
	constructor(readonly id: string) {
		super(`Order ${id} is already paid`);
	}
}
```

A literal `code` is what lets transport branch exhaustively — [callers.md](callers.md) maps them. If you prefer returning failures over throwing them, the `typescript` skill covers Result shapes; the architectural requirement is only that the failure is a domain value, not an HTTP status.

## Types

`types.ts` holds what the domain means. Where those types come from is the decision:

- **Infer from the database schema** when the domain type is genuinely the row — cheapest, and it stays in sync.
- **Declare by hand** when the row and the concept have diverged: a row with fifteen nullable columns is not what `Order` means to the rest of the app, and the adapter's job is to translate.

Start inferred, and split the day the adapter starts mapping.

## Tests

The payoff for the port is a test with no mocking machinery in it.

```ts
// src/lib/server/modules/orders/service.test.ts
import { describe, expect, it } from 'vitest';
import { markPaid, createOrder } from './service';
import { memoryOrdersStore } from './store.memory';
import { OrderAlreadyPaid } from './errors';

const now = () => new Date('2026-01-01T00:00:00Z');

describe('markPaid', () => {
	it('refuses to pay twice', async () => {
		const deps = { store: memoryOrdersStore(), now };
		const order = await createOrder({ sku: 'abc', quantity: 1 }, deps);
		await markPaid(order.id, deps);

		await expect(markPaid(order.id, deps)).rejects.toThrow(OrderAlreadyPaid);
	});
});
```

No `vi.mock`, no module registry, no database. The test reads as the rule it is checking, which is the signal that the seam is in the right place.

Two things to know about running these:

- Kit disables its server-only import guard when `process.env.TEST === 'true'`, which is what lets Vitest import `$lib/server` at all. Scope that variable to the test command — exported pipeline-wide it also disables the guard for `vite build`, and server code reaches the client bundle (measured in `SKILL.md`).
- Keep the fake's behaviour honest. A fake that never rejects, never returns `null` and never violates a constraint tests a database you do not have. When a real adapter surprises you, teach the fake the same surprise.

## When to split a module

Split when a concept grows its own lifecycle, not when the file grows long. Billing (charges, refunds, invoices) and subscriptions (plan state, entitlements) start as one module and separate once subscription state starts changing on its own schedule rather than in response to a charge. Two modules may call each other's services — that is an ordinary inward dependency, as long as the direction stays acyclic. When two modules need each other, they are one module wearing two names.
