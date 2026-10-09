---
title: "Wiring"
summary: "How a service gets its dependencies — parameter injection, factories, the composition root — and the per-process / per-request line that decides where each one is built."
verified_against: "svelte 5.56.9, @sveltejs/kit 2.70.2, vite 8.2.1, Node 26.7"
---

# Wiring

A service depends on the interface it declared; something outside plugs in the concrete client. This file is about that "something outside". Only two patterns are worth having.

## Parameter injection — the default

Pass dependencies as an argument. The signature documents what the service needs, and a test supplies fakes with no machinery.

```ts
// the service
export async function createOrder(input: NewOrderInput, deps: { store: OrdersStore; now: () => Date }) {
	return deps.store.insert({ ...input, status: 'pending', createdAt: deps.now() });
}

// transport calls it with the real adapter
await createOrder(input, { store: drizzleOrdersStore, now: () => new Date() });

// a test calls it with the fake
await createOrder(input, { store: memoryOrdersStore(), now: () => new Date('2026-01-01') });
```

Reach for this first. It costs one argument, it needs no framework, and it makes each function's dependencies legible where they are used.

## Factory — when the list stops fitting

When a service has several stable dependencies and every caller passes the same ones, bundle them once and return an object of methods closed over them.

```ts
// src/lib/server/modules/orders/service.ts
export function createOrdersService(deps: { store: OrdersStore; queue: JobQueue; now: () => Date }) {
	return {
		async create(input: NewOrderInput) {
			const order = await deps.store.insert({ ...input, status: 'pending', createdAt: deps.now() });
			await deps.queue.add('order-confirmation', { orderId: order.id });
			return order;
		},
		async cancel(id: string) {
			/* … also uses deps */
		}
	};
}

export type OrdersService = ReturnType<typeof createOrdersService>;
```

Callers then do `orders.create(input)` and never see the dependencies. The cost is one wiring file — which is the next section, and which you now have to keep somewhere.

| | Dependency enters | Cost | Reach for it when |
|---|---|---|---|
| **parameter** | at each call site | one argument per call | most services — the clean default |
| **factory** | once, at construction | a composition root | many stable deps, or you want one place that assembles the graph |

Either way the service names an interface, never "Drizzle" or "BullMQ". The injection style only decides *where* the concrete client is plugged in; the interface is what makes it swappable at all.

## The composition root

One module that builds the graph: reads config, constructs clients, picks adapters, exports assembled services. It is the only place allowed to know both a port and its adapter.

```ts
// src/lib/server/composition.ts
import { DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY } from '$app/env/private';
import { createOrdersService } from './modules/orders/service';
import { drizzleOrdersStore } from './modules/orders/store.drizzle';
import { stripeGateway } from './modules/billing/gateway.stripe';
import { jobQueue } from './infrastructure/queue';

export const orders = createOrdersService({
	store: drizzleOrdersStore,
	queue: jobQueue,
	now: () => new Date()
});
```

Two properties make this the right place for config. It is the outermost server module, so config stops there instead of spreading; and every env module SvelteKit offers is a Vite virtual module, so importing one inside the module ring breaks that module's portability exactly the way `$app/*` does — measured, importing a service that reads `$env/static/private` from a plain Node entry:

```
error: Cannot find module '$env/static/private' from '.../modules/orders/service.ts'
```

Read config at the root; pass values inward as plain arguments.

### Which env module, and the one that bakes secrets into your build

`$env/static/private` is the wrong default, and it is the one most examples reach for. Vite **inlines its values at build time**, so every secret it reads is a literal in the build output — anyone with the artifact has the credentials, and a stray copy leaks all of them. Verified on a real app: a value-grep for five production secrets over a `vite build` output found each of them present in two files. Use it only for values you would publish.

There are three mechanisms, and in a current app you should be choosing between the last two:

| module | when the value is read | in the bundle? |
|---|---|---|
| `$env/static/private` | build time, inlined | **yes — literal secrets in the artifact** |
| `$env/dynamic/private` | runtime, from the process | no |
| `$app/env/private` (**explicit env vars**) | runtime by default, per-variable | only where you set `static: true` |

**Explicit environment variables are the ones to write new code against.** They landed in 2.63, and the docs state plainly that they become the default in SvelteKit 3, where *"the `$env/*` modules, along with `$app/environment`, will be removed."* Variables are declared once in `src/env.ts` and imported by name:

```ts
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
	STRIPE_SECRET_KEY: { description: 'Stripe secret key' },
	DATABASE_URL: { schema: v.pipe(v.string(), v.url()) },
	PUBLIC_BASE_URL: { public: true, static: true }
});
```

Enable with `kit.experimental.explicitEnvironmentVariables: true`. Four things worth knowing before you commit to it, all read from kit 2.70.2's source rather than the docs:

- **Omitting `schema` already means "required, non-empty string"** (`types/index.d.ts:2364`), and validation runs for every declared variable **at app start** (`core/env.js:189-199`, invoked from `Server.init()`). Config that is wrong kills the process at boot rather than at the first request that needs it. The corollary bites: declaring a variable that only your test machine has makes production refuse to start.
- **`static` is per-variable and defaults to `false`** (`types/index.d.ts:2352-2358`), so the build-time-versus-runtime choice stops being all-or-nothing.
- **The flag is app-wide and hard.** With it on, every generated `$env/*` module body is a bare `throw` (`core/env.js:122`, `:150`). There is no incremental path — the whole app converts in one commit or it does not run.
- **A non-static private variable is a snapshot, not a live read.** Kit generates `export const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY` (`core/env.js:246-250`), captured when that module first loads, from an object populated inside `Server.init()`. Import it before init and the export is `undefined` — permanently, and with no error, because the boot validation ran against the source object and not against your captured copy.

That last point is the practical argument for the composition root doing this and nothing else doing it: **one importer, and it loads late.** It is also why `vitest` needs care — `set_env` has exactly one caller (`runtime/server/index.js:66`), so under a test runner it never fires and those exports read `undefined`. A test that transitively imports the composition root gets undefined config and stays green.

### Boot work belongs in `init`, not in module scope

`hooks.server.ts` may export an `init` function (`ServerInit`, `types/index.d.ts:970`), and kit awaits it inside `Server.init()` at `runtime/server/index.js:141` — **after** private env is populated at `:63`. That ordering is guaranteed by construction, which is the thing module-scope code cannot claim:

```ts
// src/hooks.server.ts
export const init: ServerInit = async () => {
	await runMigrations();
	await warmCaches();
};
```

Anything that must happen once per process and needs configuration goes here. Module-scope initialisation happens to work when the module is only reachable through hooks or a route — both load after init — but that is a property of your import graph, not of the framework, and nothing tests it.

**One composition root per entry point once the graphs diverge.** The web process needs the enqueue side of the queue; the worker needs consumers. Start with one shared module, and split it the day one entry point is constructing clients the other never uses.

**A second entry point cannot use SvelteKit's env modules at all.** `$env/*` and `$app/env/*` are both Vite virtual modules supplied by the build, so a worker started with `node worker.js` or `bun worker.ts` fails to *import* any file that reads one — the same `Cannot find module` shown above, at import time. Its root reads `process.env` / `Bun.env` directly. This is the one place the two roots genuinely cannot share code, and it is another reason config stops at the root: everything below it takes plain values and does not care which entry point read them.

## Per-process vs per-request

This is the line that decides where a dependency is built, and getting it wrong is the classic multi-tenant bug.

**Per-process** — built once, shared by every request, held at module scope. Connection pools, SDK clients, the assembled services, config. Verified across three requests to one `node build/index.js`: a module-level `bootedAt` identical each time, a counter reading 2 → 4 → 6, an in-memory array growing 1 → 2 → 3. Long-lived and shared is exactly what these want.

**Per-request** — built per request, never at module scope. The current user, a database transaction, a request-scoped logger, anything derived from a header. The same measurement is the hazard here: state at module scope outlives the request and is visible to the next user.

The safe division: **module scope holds machinery, arguments carry identity.** A service that takes `(input, { store })` and receives the actor as part of `input` is safe under any concurrency; one that reads the current user from a module variable is a data leak waiting for traffic.

Request-scoped values reach a service the same way every time:

```ts
// src/hooks.server.ts — resolve once per request
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');
	event.locals.user = token ? await validateSession(token) : null;
	return resolve(event);
};
```

```ts
// transport reads locals and passes it inward
export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const input = parse(await request.formData());
		await orders.create({ ...input, actorId: locals.user.id });
	}
};
```

The service takes `actorId` as data. It has no opinion about cookies, and the worker can pass a system actor.

### Resolving a value once per request

When several callers in one request need the same derived value — the current user, the active tenant — an unexported `query` is a request-scoped memo. Kit keys a query by its serialized argument and caches it for the life of the request, so the work happens once however many callers ask:

```ts
// src/lib/remote/orders.remote.ts
const currentUser = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Unauthorized');
	return locals.user;
});

export const listOrders = query(async () => {
	const user = await currentUser();
	return orders.listFor(user.id);
});

export const orderCount = query(async () => {
	const user = await currentUser();
	return (await orders.listFor(user.id)).length;
});
```

Measured: one request calling both exported queries ran `currentUser` **once**; the next request ran it again. It is per-request, so the shared-state hazard above does not apply to it.

It is still transport, though — it lives in a `.remote.ts`, so no non-HTTP caller can use it, and what it produces still travels inward as plain data rather than being read from inside the domain.

## Dev rebuilds the composition root

A module-level singleton is **not** stable under `vite dev`. Measured with a logging constructor, four requests to one dev server:

| after | boot id | in-memory state |
|---|---|---|
| cold start | `r7m9ei` | accumulating |
| touch a module the root **imports** | `ioeihb` | **reset** |
| touch the root **itself** | `rx099n` | **reset** |
| touch a route that imports the root | `rx099n` | continued |

Three constructions, three discarded instances, nothing disposing them. For a fake that is lost state; for a database pool or a Redis connection it is a leaked connection on every save, until the dev server runs out.

The fix that works is a `globalThis` singleton — `import.meta.hot` is undefined in SvelteKit's SSR module graph, so a `dispose` hook there does nothing:

```ts
// src/lib/server/composition.ts
function build() {
	return { orders: createOrdersService({ store: drizzleOrdersStore, queue: jobQueue, now: () => new Date() }) };
}

const key = Symbol.for('app.composition');
const g = globalThis as unknown as Record<symbol, ReturnType<typeof build>>;
g[key] ??= build();

export const { orders } = g[key];
```

Verified on the same four-touch sequence: **one** construction, one boot id, state accumulating across all four requests including both invalidating touches. In production the module is evaluated once per process either way, so this costs nothing there.

## `getRequestEvent()` is a boundary tool

`getRequestEvent()` from `$app/server` returns the current `RequestEvent` without threading it through. Measured: it works at arbitrary call depth inside a service, and still works after an `await` where `AsyncLocalStorage` exists (it does on Node; environments without it require a synchronous call).

That reach is precisely why it belongs at the boundary rather than in the domain. Using it inside a module ring costs two things:

- **Portability.** The module can no longer be imported outside SvelteKit at all — `Cannot find module '$app/server'`, at import time. The second caller that justified the layering cannot load the file.
- **Legibility.** The dependency vanishes from the signature. A function typed `(id: string) => Promise<Order>` that silently needs a session is a function whose tests will not tell you so.

Use it in hooks, in `+server.ts`, in remote functions, and in helpers those call directly — reading the session, the client IP, the request id — then pass what you extracted inward as plain data.

## What not to build

- **A DI container library.** The graph in an app this shape is a dozen objects assembled in one file. A container adds a registry, a resolution order and a lifetime vocabulary to a problem that a function call already solved.
- **An interface per class.** Ports exist where a second implementation exists ([modules.md](modules.md)).
- **A repository wrapping a repository.** A query builder is already an abstraction over SQL; the port exists to hide *which* one, not to add a second layer of the same idea.
