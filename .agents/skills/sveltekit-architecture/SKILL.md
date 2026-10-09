---
name: sveltekit-architecture
description: Layering the server side of a SvelteKit app above the route level — domain modules under $lib/server, ports and adapters, dependency injection, and second entry points such as a worker or CLI. Use when deciding where server-side logic belongs, extracting it out of a fat route, load function or remote function, wiring dependencies into a service, or adding a non-HTTP caller.
version: 1.3.0
scope: architecture
distribution: author-only
---

# SvelteKit architecture

Every claim here was run against **svelte 5.56.9** / **@sveltejs/kit 2.70.2** / **vite 8.2.1** on Node 26.7, in a throwaway `sv create` app — not quoted from a docs page. Where a claim is a measurement, the measurement is beside it. The worked example is one codebase: the domain module, all four callers and the worker typecheck together at 0 errors / 0 warnings, the service test passes with no database, and both builds run.

Neither upstream nor the community ships an architecture skill: `sveltejs/ai-tools` has two (`svelte-code-writer`, `svelte-core-bestpractices`) and the largest community pack has sixteen, all of which mirror the docs by API surface. Nothing covers where code goes. That gap is what this skill is for, so don't re-investigate it.

## The gate: the second caller

Layers are bought, not free. The thing that pays for them is a **second caller** — a worker, a JSON endpoint, a cron entry, a CLI — invoking the same logic the page already invokes. One caller and the layers are ceremony: a `+page.server.ts` that queries the database directly is the correct architecture for most routes, and staying there is a decision, not a debt.

So the default is flat, and you **promote** a domain into the shape below when its second caller appears. Promote the one domain, not the app. A codebase where `orders/` is fully layered and everything else is a direct query is healthy, not inconsistent.

## The rings

Four rings and one direction of travel. **A ring may import inward; nothing imports outward.**

| Ring | Holds | Knows about |
|---|---|---|
| **transport** | `+page.server.ts`, `+server.ts`, form actions, `hooks.server.ts`, `*.remote.ts`, worker handlers | HTTP, jobs, sessions — and the module ring |
| **module** | one folder per domain concept: `service.ts`, its **ports**, `schema.ts`, `types.ts`, tests | its own ports and plain libraries. No protocol, no vendor |
| **infrastructure** | **adapters** implementing those ports, plus the clients they wrap: db, queue, mail, vendor SDKs | the vendor, and the port it satisfies |
| **shared** (`$lib`) | client-safe components, types, pure helpers, schemas the client validates | nothing server-side |

A **port** is an interface a module declares for something it needs — `store.ts` for persistence, `gateway.ts` for an outside vendor. An **adapter** implements it (`store.drizzle.ts`), and a **fake** implements it for tests (`store.memory.ts`). The module depends on the interface it declared; the concrete thing is plugged in from outside. That inversion is what the whole shape buys.

> Two collisions worth naming once. SvelteKit's `adapter-node` is a *deployment target*, unrelated to a port adapter. And a "service" in your container orchestrator is a running process, not `service.ts`.

## Where to look

| File | Read it for |
|---|---|
| [modules.md](references/modules.md) | the anatomy of a domain module — service, port, adapter, fake, schema — naming, file-by-file, and how it gets tested without mocking machinery |
| [wiring.md](references/wiring.md) | how a service gets its dependencies: parameter injection, factories, the **composition root**, per-process vs per-request, and what `getRequestEvent()` costs you |
| [callers.md](references/callers.md) | the transport ring in detail: load, actions, `+server.ts`, remote functions, hooks and worker handlers — the duties every boundary owes, and what `App.Locals` and the `transport` hook carry across |
| [entry-points.md](references/entry-points.md) | adding a second entry point: its own build, one image two commands, containers, migrations, scaling |
| [refactoring.md](references/refactoring.md) | promoting an existing flat app one domain at a time, in an order where every step ships |

## Working rules

**A domain module must import clean outside SvelteKit.** This is the whole layering discipline reduced to one runnable check, and it fails loudly. A service that reaches for `$app/server` cannot be *imported* by a non-Kit entry point at all — measured, running the worker entry directly:

```
error: Cannot find module '$app/server' from '.../modules/orders/service.ts'
```

`$app/*` is a virtual module the Vite plugin supplies; outside the build it does not exist. So the failure is module resolution at import time, not a runtime error at call time — the second caller can't even load the file. `$env/*` fails identically, measured on a service reading `$env/static/private`, which is why config belongs at the composition root. Check it statically before you write the second caller:

```sh
grep -rn '\$app/\|\$env/\|@sveltejs/kit' src/lib/server/modules/   # want: no value imports
```

Type-only imports are free (`import type { RequestEvent }` is erased). The rule is about values.

**That grep does not follow imports, and a helper defeats it.** Measured on a real codebase: moving every `$env` read behind a `requireEnv(name)` helper one directory away turned the check green while the module ring's dependency on `$env` was completely unchanged — a worker still could not import those files, and the invariant the check exists to protect was still being violated. The failure mode is worse than no check, because green now means "nobody wrote the string here" rather than "these modules are portable". If you want the real answer, import a module ring file from a plain `node`/`bun` script and see whether it loads; the grep is a fast pre-filter, not the gate.

**Which env module you read matters as much as where you read it.** `$env/static/private` inlines its values into the build output, so it puts literal secrets in the artifact — and explicit environment variables (`src/env.ts` + `$app/env/private`) are what SvelteKit 3 replaces all of `$env/*` with. Both are in [wiring.md](references/wiring.md).

**`error()` is the same leak with no warning.** `@sveltejs/kit` is a real package, so a domain module importing `error` resolves fine outside Kit — and then throws an object nobody catches. Measured in a plain worker process:

```
error() threw: HttpError {"status":404,"body":{"message":"gone"}}
```

A 404 is an answer to an HTTP request. Domain code raises a domain error; the transport ring maps it to `error()`, `fail()` or a job retry — [callers.md](references/callers.md) has the mapping.

**`$lib/server` is enforced by `vite build`, and by nothing else.** The build refuses the import and prints the whole chain:

```
Cannot import $lib/server/secrets.ts into code that runs in the browser…
 src/routes/+page.svelte imports
  $lib/shared/util.ts imports
   $lib/server/secrets.ts
```

Two holes measured on that same violation. `svelte-check` reports **0 errors, 0 warnings** — the type gate is blind to the boundary, so a green `check` says nothing about it. And **`TEST=true` in the environment disables the guard entirely**: with it set the build succeeded and the literal `sk_live_…` landed in `.svelte-kit/output/client/_app/immutable/nodes/2.*.js`, a chunk browsers download. Kit does that so Vitest can import server modules; a CI job that exports `TEST=true` for the whole pipeline therefore ships server code to the client. Scope that variable to the test command.

**Module-level state in `$lib/server` is per-process, shared by every user.** Three requests to one `node build`: `bootedAt` identical, a module counter reading 2 → 4 → 6, an in-memory array growing 1 → 2 → 3. That is exactly what a composition root wants (wire the graph once) and exactly what user data must never touch. In `vite dev` it is not even per-process — editing the composition root or anything it imports rebuilds the singleton with nothing disposing the old one, which leaks a connection per save until you pin it to `globalThis`. Both measurements, and the fix, are in [wiring.md](references/wiring.md).

**A `.remote.ts` file is transport, so it lives outside `$lib/server`.** Placing one under `$lib/server` fails the build, because the component imports it by design. It belongs beside the other callers and calls *into* the module ring; the body is stripped from the client bundle either way (verified: the service's source text is absent from the client output).

**`vite build` compiles the route graph, not `src/`.** A second entry point is invisible to it — nothing in the route graph imports `src/worker`, so nothing pulls it in (verified: no trace of the worker in `build/`). It needs its own build or runner. [entry-points.md](references/entry-points.md).

## Corrections to common assumptions

Ordered by how often each one produces broken code:

- **Ports are for things with a second implementation.** A fake counts as the second. Everything else — the logger, a date helper, a pure formatter — is imported directly. An interface with exactly one implementation and no test double is a file that costs a hop and buys nothing.
- **`getRequestEvent()` is not a way to skip dependency injection.** It works, at any call depth, and survives an `await` where `AsyncLocalStorage` exists (both measured). That reach is the hazard: it lets transport enter the domain silently and pins the module to the web entry point. Use it at the boundary, pass the result inward.
- **A remote function is not a shared core.** A `+server.ts` can import and call a `query`, and it works — which is why it is the first reuse people reach for. But the guard inside that query then decides the endpoint's response, and no non-HTTP caller can import the file at all. Two callers share a *service*, never a transport function ([callers.md](references/callers.md)).
- **A schema under `$lib/server` cannot validate on the client.** `preflight` needs the component to import it, and the build refuses. A schema the client validates belongs in the shared ring; one only the server validates stays in the module ([modules.md](references/modules.md)).
- **The layered shape is per-domain, not per-app.** Promote `orders/` because it grew a worker; leave `marketing/` as a direct query. The gate is applied one domain at a time.
- **`+page.server.ts` is not a layer.** It is transport that happens to run on the server. Business logic living there is un-callable by anything but that one page — which is fine until the second caller appears, and is the thing you extract when it does.
- **A monorepo is not the first move.** One repo, one `src/lib/server`, two entry points covers this whole shape. Reach for packages when something genuinely ships separately.
- **Duplicated shared code across two built images is correct.** Each image holds the domain modules plus its own entry point, which is what makes each independently deployable. There is no third "common" image to build.
- **`svelte.config.js` may not be where the adapter lives.** In the current `sv create` template the adapter is passed to the `sveltekit()` plugin in `vite.config.ts`; editing a hand-written `svelte.config.js` had no effect until the plugin option changed. Read the template you actually have before configuring a second build.

## Related skills

- **svelte-sveltekit** — the framework surface this sits on: routing, load, form actions, remote functions, hooks, adapters. It also owns the **client** half of architecture — state ownership, context as request-scoped injection, and what may live in a shared `.svelte.ts` — which is why none of that is here
- **typescript-design-patterns** — the shapes inside a module: registries, state machines, request-scoped state
- **drizzle** — the persistence adapter most of these ports end up wrapping
- **effect** — an alternative wiring model: services and layers, with the runtime at the request boundary
- **better-auth** — auth as a bought module rather than a hand-rolled one
