---
title: "Callers"
summary: "The transport ring — load, actions, endpoints, remote functions, hooks and worker handlers — the duties each one owes, how a domain error becomes the right response in each, and what App.Locals and the transport hook carry across the boundary."
verified_against: "svelte 5.56.9, @sveltejs/kit 2.70.2, vite 8.2.1"
---

# Callers

A **caller** is anything that invokes a domain service. Each one speaks a different protocol; none of them holds a rule. This is the ring where SvelteKit lives, and the point of the layering is that adding a caller is cheap.

## The duties

Every caller does the same four things and nothing else:

1. **Parse** — turn bytes into the validated input type the service accepts.
2. **Authorize** — establish who is acting, and whether they may.
3. **Call** — one service call, with dependencies supplied.
4. **Shape** — turn the return value or the domain error into this protocol's answer.

Writes owe a fifth: **invalidate** — tell the client what this mutation just made stale, with `listOrders().refresh()` or the equivalent. It belongs in this ring and nowhere else, because the domain has no idea which queries exist.

A boundary that runs past about twenty lines has usually grown a duty beyond these, and that extra duty is domain logic that belongs one ring inward. That is the practical test for "thin".

Duties 2 and 4 are the ones that stay in transport permanently. **Transport authorizes the actor; the domain enforces the invariant.** "Is this user signed in and are they an admin" is a transport question. "May a paid order be refunded twice" is a domain question, and belongs in the service where every caller gets it — a rule enforced in a form action is a rule the worker does not have.

## Who the callers are

| Caller | File | Use it for |
|---|---|---|
| server `load` | `+page.server.ts`, `+layout.server.ts` | reads that render a page |
| form action | `+page.server.ts` | writes from a `<form>`, working without JavaScript |
| endpoint | `+server.ts` | JSON for third parties, webhooks, non-browser clients |
| remote function | `*.remote.ts` | typed reads and writes called straight from a component |
| hook | `hooks.server.ts` | per-request cross-cutting work: session, logging, tracing |
| job handler | `src/worker/handlers/*.ts` | work triggered by a queue rather than a request |

Remote functions are transport despite running on the server, so they live **outside** `$lib/server` — placing a `.remote.ts` there fails the build, because the component imports the module by design ([SKILL.md](../SKILL.md)). They belong beside the other callers and call inward.

## Worked: the same service, four ways

```ts
// src/routes/(app)/orders/+page.server.ts — read
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { orders: await orders.listFor(locals.user.id) };
};

// src/routes/(app)/orders/+page.server.ts — write
export const actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });

		const parsed = v.safeParse(newOrderSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { errors: v.flatten(parsed.issues) });

		try {
			await orders.create({ ...parsed.output, actorId: locals.user.id });
		} catch (e) {
			if (e instanceof OutOfStock) return fail(409, { error: 'Out of stock' });
			throw e;
		}
		redirect(303, '/orders');
	}
} satisfies Actions;
```

```ts
// src/routes/api/orders/+server.ts — JSON
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.apiKey) error(401, 'Unauthorized');

	const parsed = v.safeParse(newOrderSchema, await request.json());
	if (!parsed.success) error(400, 'Invalid body');

	return json(await orders.create({ ...parsed.output, actorId: locals.apiKey.ownerId }), { status: 201 });
};
```

```ts
// src/lib/remote/orders.remote.ts — typed, called from a component
import { form, getRequestEvent, query } from '$app/server';
import { orders } from '$lib/server/composition';
import { newOrderFormSchema } from '$lib/server/modules/orders/schema';

export const listOrders = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Unauthorized');
	return orders.listFor(locals.user.id);
});

export const createOrder = form(newOrderFormSchema, async (data) => {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Unauthorized');

	await orders.create({ ...data, actorId: locals.user.id });
	await listOrders().refresh();
});
```

```ts
// src/worker/handlers/process-order.ts — no request in sight
export async function processOrder(job: Job<{ orderId: string }>) {
	await orders.fulfil(job.data.orderId, { actorId: 'system' });
}
```

Four protocols, one `orders` service, zero duplicated rules. Note what each boundary supplies for itself: the page reads `locals.user`, the endpoint reads an API key, the worker passes a system actor. Identity is transport's problem in all four.

What `locals` may hold is declared once, in `src/app.d.ts`'s `App.Locals`. Keep that interface in module-ring types — `user: User`, not `supabase: SupabaseClient`. Every handler in the app reads it, so a vendor type there hands infrastructure to all of them at once, and the ring boundary you drew in the folder layout quietly stops holding.

The two schema names are not a typo — the JSON endpoint validates real numbers while the form receives strings, so the form callers use the coercing variant ([modules.md](modules.md)). Parsing is per-protocol; the parsed type is shared.

Authorize inside each handler rather than relying on a parent layout — a `+layout.server.ts` guard covers the pages beneath it and not the endpoints or actions beside them, and inside a remote function `url`/`params` describe the *calling page* and are client-controlled. The `svelte-sveltekit` skill's `best-practices.md` has the full security list; the architectural half is only that the check lives in this ring, in the handler being called.

## Mapping a domain error

The service raises `OrderNotFound`. What that becomes is the caller's decision, and the worker column is the one that is easy to get wrong:

| Domain outcome | load / action | `+server.ts` | remote function | job handler |
|---|---|---|---|---|
| not found | `error(404)` | `error(404)` | `error(404)` | log, **return** — a retry cannot find it either |
| invalid input | `fail(400, values)` | `error(400)` | the schema rejects it before the handler runs | log, **return** — the payload will not improve |
| conflict / already done | `fail(409, …)` | `error(409)` | `invalid(…)` in a `form`, `error(409)` in a `query` | **return** — the job is idempotent, this is success |
| not permitted | `error(403)` | `error(403)` | `error(403)` | log, **return** |
| infrastructure timeout | `error(503)` | `error(503)` | `error(503)` | **throw** — this is what retries are for |

In a queue, **return means done and throw means retry**, so the choice is whether a second attempt could plausibly succeed. Throwing on a validation error burns the whole retry budget re-failing on the same bytes, and returning on a timeout drops the work silently.

`fail` versus `error` in the browser-facing column: `fail` preserves what the user typed and re-renders the form, `error` throws the input away and renders the error page. Writes want `fail`.

A `form` gets the same choice through `invalid()`. A failure the schema cannot see — out of stock, name already taken — is reported with issues built from the handler's second argument, which attaches the message to the field that caused it:

```ts
export const createOrder = form(newOrderFormSchema, async (data, issue) => {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Unauthorized');

	try {
		await orders.create({ ...data, actorId: locals.user.id });
	} catch (e) {
		if (e instanceof OutOfStock) invalid(issue.sku(`${e.sku} is out of stock`));
		throw e;
	}

	await listOrders().refresh();
});
```

That is the remote-function analogue of `fail`: the user keeps what they typed, where `error(409)` would replace the page with an error. One constraint to route around — **a `command` cannot redirect**; return a value and let the caller navigate.

## Domain values crossing to the client

A service returns domain objects and `load` serializes them, so a class instance reaches the component as a plain object with its methods gone — no error at the boundary, just `total.format is not a function` somewhere further down. The `transport` hook is the seam that fixes it, and it covers remote-function arguments and results as well as `load` return values:

```ts
// src/hooks.ts — universal, runs on both sides
import { Money } from '$lib/money';

export const transport = {
	Money: {
		encode: (value) => value instanceof Money && [value.amount, value.currency],
		decode: ([amount, currency]) => new Money(amount, currency)
	}
};
```

The constraint is in the comment: `src/hooks.ts` is universal, so the class it names has to be importable by the client. A value type in the **shared** ring transports; one that lives under `$lib/server` cannot, and trying is how a domain type ends up migrating outward for a serialization reason rather than an architectural one. The usual better answer is for transport to hand the component plain data and let the domain type stay server-side — reach for `transport` when the client genuinely needs the behaviour, not just the fields.

## Keeping the graph acyclic

Transport imports the module ring. Nothing in the module ring imports transport — no service imports a `+server.ts`, and no service calls its own app over HTTP. When two routes need the same non-trivial preparation, the shared part is a module-ring function that both call, not one route importing the other.

**Transport importing transport is the tempting shortcut.** A remote query is a plain async function on the server, so a `+server.ts` can import and call one. It works — the request event propagates and the per-request cache applies — which is why it is the reuse most people reach for first. It buys two problems:

- The guard inside the shared query decides *your* response. A query guarded with `redirect(307, '/auth/login')` is reasonable for a page and wrong for an API: measured, a JSON client got `307` with `Location: /auth/login` — a browser login page served to a machine.
- A non-HTTP caller cannot load the file at all — `Cannot find module '$app/server'` — so the endpoint that reused it is fine and the worker is stuck.

Two callers share a service, not a caller. Each transport owns its own guard and its own failure shape.

The one exception worth knowing is a webhook, where an outside vendor calls you: the endpoint verifies the signature, then hands the parsed event to a router that dispatches to the right domain module's event handler. Signature verification is infrastructure, the dispatch table is transport, and what happens to an invoice is the billing module's business.
