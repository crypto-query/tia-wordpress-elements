---
title: "Second entry points"
summary: "Adding a non-HTTP process — worker, cron, CLI — that shares the domain code: its own build, one image with two commands, and the operational questions that follow."
verified_against: "svelte 5.56.9, @sveltejs/kit 2.70.2, vite 8.2.1, Node 26.7"
---

# Second entry points

A second entry point is the caller that pays for the layering: a process started by something other than an HTTP request, importing the same `src/lib/server/modules/*` the app imports. Usually a queue worker; the same shape covers a cron runner, a CLI, or a one-off backfill.

Before building one, check that you need a process rather than a route. A job that runs on a schedule and finishes in a second is served fine by a `+server.ts` your platform's scheduler hits with a shared secret. A second process earns its keep when work is long-running, retried, rate-limited, or must survive a web deploy.

## `vite build` does not see it

SvelteKit builds the route graph — routes and everything they import. Nothing in that graph imports `src/worker`, so nothing pulls it in. Verified: after a full `vite build`, no trace of the worker's code appears anywhere in `build/`.

So the second entry point needs its own build or its own runner. Three options, all measured on the same entry importing `$lib/server/modules/orders/service`:

| Approach | Result |
|---|---|
| `node --experimental-strip-types src/worker/index.ts` | **fails** — `ERR_MODULE_NOT_FOUND`. Node strips types but does not apply tsconfig `paths`, so `$lib` does not resolve |
| `bun run src/worker/index.ts` | **works** — bun honours tsconfig `paths` |
| second `vite build`, alias configured | **works** — emitted `build-worker/index.js` (0.67 kB) that runs under plain `node` |

The alias is the crux: `$lib` is a tsconfig path that the Vite plugin also implements, so whatever runs the worker has to resolve it too. A bundled build is the portable answer:

```ts
// vite.worker.config.ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	build: {
		ssr: true,
		outDir: 'build-worker',
		emptyOutDir: true,
		target: 'node22',
		rollupOptions: { input: 'src/worker/index.ts', output: { entryFileNames: 'index.js' } }
	}
});
```

```json
{
  "scripts": {
    "build": "vite build && vite build --config vite.worker.config.ts",
    "start": "node build",
    "start:worker": "node build-worker/index.js"
  }
}
```

Both builds resolve `$lib` to the same sources, so the shared code is identical in each output.

Remember the portability rule this depends on: the modules being shared must be free of `$app/*` and `$env/*` value imports, or the worker build will not resolve them ([SKILL.md](../SKILL.md)).

## The worker's own shape

Plumbing only. No domain logic lives here — a handler that grows rules has put them where the web app cannot reach them.

```
src/worker/
├── index.ts              entry: connect, register, wait, shut down cleanly
├── register.ts           queue + job name → handler
└── handlers/
    ├── process-order.ts  reads job.data → calls orders service
    └── send-invoice.ts   reads job.data → calls billing service
```

```ts
// src/worker/handlers/process-order.ts
import { orders } from '$lib/server/composition';
import type { Job } from 'bullmq';

export async function processOrder(job: Job<{ orderId: string }>) {
	await orders.fulfil(job.data.orderId, { actorId: 'system' });
}
```

A handler is the same duties as any caller ([callers.md](callers.md)): parse `job.data`, establish the actor, call one service, and decide return-versus-throw. **Return means done, throw means retry.**

Type the job payloads once, in infrastructure, and share them with the enqueue side so both processes agree:

```ts
// src/lib/server/infrastructure/queue/job-types.ts
export type Jobs = {
	'process-order': { orderId: string };
	'send-invoice': { invoiceId: string };
};
```

That file is the contract between the two processes. Changing a payload shape is a deploy-ordering problem — jobs enqueued by the old web process are still in the queue when the new worker starts — so add fields optionally and remove them a release later.

## Shut down cleanly

The deploy-time failure this shape introduces: a worker killed mid-job either loses the work or re-runs it. Close the consumer first so it stops accepting new jobs, let in-flight ones finish, then close the connections.

```ts
// src/worker/index.ts
const workers = register(connection);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
	process.once(signal, async () => {
		await Promise.all(workers.map((w) => w.close())); // stop taking work, drain in-flight
		await connection.quit();
		process.exit(0);
	});
}
```

Make handlers idempotent anyway. A worker that dies without draining will re-run its job, and "already done" must be a success ([callers.md](callers.md)).

## One image, two commands

The two processes are the same repository, built into the same image, started differently.

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build            # produces build/ and build-worker/

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/build-worker ./build-worker
COPY --from=build /app/node_modules ./node_modules
# no CMD — the orchestrator supplies it per service
```

```yaml
services:
  web:
    image: myapp
    command: node build
  worker:
    image: myapp
    command: node build-worker/index.js
    deploy: { replicas: 2 }
```

Split into two Dockerfiles only when the images genuinely diverge — the worker needing a system binary the web does not, say.

**Each image containing the shared library is correct, not waste.** Each container is self-contained: shared modules plus its own entry point. There is no third "common" image and no shared volume, and that is exactly what makes each independently deployable and scalable.

## Why not run the worker inside the web process

Because a consumer is a long-running loop and a web process should stay freely restartable. Co-hosting couples the lifecycles: restarting the web to ship a UI fix drops in-flight jobs, and you cannot scale them separately. At small scale co-hosting is a reasonable first step — just know that splitting later is a deployment change, not a code change, precisely because the domain modules never knew which process called them.

## The operational answers

- **State between the processes.** They share no memory. The queue carries the work, the database carries the truth, and that is the only channel — which is why the domain code has to be independent of the request in the first place.
- **Migrations.** Neither process. Run them as an explicit deploy step before the new containers start; migrating on boot races two containers against each other.
- **Environment.** Mostly identical, since both touch the same systems. The web additionally needs the request-facing values (public URLs, session secret). One env source, each container reading what it needs.
- **Connections.** Same configuration, separate pools — connections are per-process. Watch total database connections as worker replicas multiply, and put a pooler in front before raising the limit.
- **Scaling.** By replica count, independently. A queue hands each job to exactly one consumer across all replicas, so adding replicas adds parallelism with no code change.
- **Observability.** Give each process the same structured logger from infrastructure and tag it with the entry point, so one query covers both. SvelteKit's `instrumentation.server.ts` runs before app code on adapters that support it — that covers the web process only; the worker sets up its own.
