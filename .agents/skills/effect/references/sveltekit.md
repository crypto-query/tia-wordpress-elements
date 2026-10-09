# Effect in a SvelteKit backend

Upstream documents integration against Hono (`node_modules/effect/ai-docs/src/04_integration/10_managed-runtime.ts`) and nothing else. This file is the SvelteKit equivalent, built and run end to end on SvelteKit 2.63 with `effect@4.0.0-rc.109`.

The shape is always the same: **domain logic stays in services and returns typed failures; the route is a boundary that maps those failures to SvelteKit's own vocabulary and runs the effect.**

## Where the code lives

Effect belongs in `$lib/server/` or in a `.server.ts` file. SvelteKit refuses at build time to pull `$lib/server/` into client code, which is what keeps the runtime, your database layer and your secrets out of the browser bundle. A service imported from a plain `$lib/` module compiles fine and ships Effect to every visitor.

## The runtime singleton

`ManagedRuntime.make` builds the layer once and reuses the resulting services for every effect you run against it. Build it in one module and import that module everywhere.

The catch is Vite's dev server. Editing a module that the runtime **imports** re-evaluates the runtime module, and nothing disposes the old runtime — its connection pools and background fibers stay alive for the life of the dev process. Measured on the rig: three requests produced one layer build; touching a route file (an *importer* of the runtime) still one; editing a *service* file took it to two.

`import.meta.hot.dispose` does not fix this — `import.meta.hot` is `undefined` in SvelteKit's SSR module graph, so the callback never runs (verified: 2 builds, 0 disposes). Hold the runtime on `globalThis` instead, which survives re-evaluation:

```ts
// src/lib/server/runtime.ts
import { env } from "$env/dynamic/private"
import { ConfigProvider, Layer, ManagedRuntime } from "effect"
import { Todos } from "./services"

const ConfigLayer = ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))

const AppLayer = Layer.mergeAll(Todos.layer).pipe(Layer.provide(ConfigLayer))

const make = () => ManagedRuntime.make(AppLayer)

// Vite re-evaluates this module on HMR; a module-level runtime would be rebuilt
// and the old one never disposed. Keep one on globalThis instead.
const store = globalThis as typeof globalThis & { appRuntime?: ReturnType<typeof make> }

export const runtime = (store.appRuntime ??= make())
```

With that in place the same edit that previously rebuilt the layer leaves it at one build. Typing the store as `ReturnType<typeof make>` matters: `ManagedRuntime` is contravariant in its services, so a hand-written `ManagedRuntime<unknown, unknown>` annotation will not accept it.

The layer builds lazily on the first effect run, not at import — a server that has answered no requests has opened no connections.

## Configuration

`Config.string("DATABASE_URL")` reads through the default `ConfigProvider`, which reads `process.env`. That works on the node adapter and silently finds nothing on adapters where env arrives as a request-scoped object. Bridging `$env/dynamic/private` (as above) makes the same `Config` code portable, and keeps SvelteKit as the single place env is resolved.

`Config` failures surface as the layer's error type, which is why the runtime is typed `ManagedRuntime<Services, ConfigError>` — a missing variable fails the first request, not the process start.

## The boundary helper

Have every route run its effect through one helper whose error channel is pinned to `never`:

```ts
// src/lib/server/boundary.ts
import { Effect } from "effect"
import { runtime } from "./runtime"
import type { Todos } from "./services"

/** Every failure must be mapped before reaching here: E is pinned to never. */
export const run = <A>(effect: Effect.Effect<A, never, Todos>): Promise<A> =>
  runtime.runPromise(effect)
```

This turns "did I handle every failure?" into a compiler question. Handle every tag and the file checks clean; drop one and `svelte-check` names it exactly:

```
Argument of type 'Effect<Response, DatabaseError, Todos>' is not assignable to
parameter of type 'Effect<Response, never, Todos>'.
```

Both arms were measured — all tags handled gives 0 errors, one tag removed gives that error and nothing else. Without the pin, an unmapped failure is a rejected promise that SvelteKit renders as a generic 500.

As the app grows, replace `Todos` in that signature with a union of the services the runtime provides.

## Routes

### `+server.ts`

```ts
import { error, json } from "@sveltejs/kit"
import { Effect } from "effect"
import { run } from "$lib/server/boundary"
import { Todos } from "$lib/server/services"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = ({ params }) =>
  run(
    Effect.gen(function* () {
      const todos = yield* Todos
      const todo = yield* todos.byId(Number(params.id))
      return json(todo)
    }).pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.sync(() => error(404, `No todo ${e.id}`)),
        DatabaseError: () => Effect.sync(() => error(503, "Unavailable"))
      })
    )
  )
```

`Effect.catchTags` takes a record keyed by `_tag`, which is the exhaustive form — reach for it over chained `catchTag` calls once there is more than one failure.

### `load`

Identical shape; return data rather than a `Response`.

```ts
export const load: PageServerLoad = async ({ url }) => {
  const id = Number(url.searchParams.get("id") ?? 1)

  const todo = await run(
    Effect.gen(function* () {
      const todos = yield* Todos
      return yield* todos.byId(id)
    }).pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.sync(() => error(404, `No todo ${e.id}`)),
        DatabaseError: () => Effect.sync(() => error(503, "Database unavailable"))
      })
    )
  )

  return { todo: { id: todo.id, title: todo.title } }
}
```

Return plain data from `load`, not `Schema.Class` instances — SvelteKit has to serialise it to the client, and a class arrives there as a bare object with its methods gone.

### Form actions

Decode with `Schema`, translate a decode failure into `fail`, and run the write:

```ts
const CreateTodo = Schema.Struct({ title: Schema.NonEmptyString })

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData()
    const decoded = Schema.decodeUnknownExit(CreateTodo)({ title: form.get("title") })

    if (decoded._tag === "Failure") {
      return fail(400, { message: "Title is required" })
    }

    await run(Todos.use((t) => t.create(decoded.value.title)))
    redirect(303, "/")
  }
}
```

`Schema.decodeUnknownExit` returns an `Exit` instead of throwing, which keeps the validation branch ordinary control flow. Call `redirect` *after* the effect has finished, in the action itself — see below for why calling it inside is a different thing.

## What `error()` and `redirect()` do inside an Effect

They throw, so Effect classes them as **defects**, not typed failures. That is mostly what you want, and the consequences are worth knowing exactly. Each row was measured, with a control:

| You write | What happens | Control |
|---|---|---|
| `runPromise` on an effect that called `redirect()` | Rejects with the original `Redirect`; `isRedirect(e)` is `true` | `error(404)` likewise rejects with `HttpError`, `isHttpError(e)` is `true` |
| `Effect.catch(...)` around it | Does **not** swallow it — the redirect escapes | `Effect.catchCause(...)` **does** swallow it, returning the fallback |
| `Effect.retry({ times: 3 })` around it | Runs once | The same wrapper on a typed failure runs 4 times |
| `runPromiseExit` | `Cause.hasDies` is `true`, `hasFails` is `false`; `Cause.squash(cause)` returns the original object | — |

So `Effect.sync(() => error(404, ...))` inside a `catchTags` branch does reach SvelteKit as a real 404 — verified against a running server, not just a type-check.

The trap is `Effect.catchCause` and friends: anything that handles the whole `Cause` will eat a redirect and turn a navigation into a silent success. Keep `catchCause` out of route code, and prefer returning a typed failure from the domain and calling `error`/`redirect` at the boundary — that also keeps services testable without a framework in scope.

## Per-request services

Anything request-scoped — the signed-in user, a request id, a tenant — is a service you provide at the call site rather than in the app layer:

```ts
export class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()(
  "app/CurrentUser"
) {}

// in a route, with event.locals.user already resolved by a hook
await run(
  doTheWork.pipe(Effect.provideService(CurrentUser, { id: locals.user.id }))
)
```

`provideService` discharges `CurrentUser` from the effect's requirements, so what reaches `run` needs only the long-lived services the runtime holds. Putting a per-request value in the app layer instead would freeze the first request's value for the life of the process.

## Hooks and shutdown

`hooks.server.ts` is the place to dispose the runtime on shutdown:

```ts
const dispose = () => void runtime.dispose()
process.once("SIGINT", dispose)
process.once("SIGTERM", dispose)
```

This needs `@types/node` for `process` to type-check. It matters for adapters that run a long-lived process; on serverless adapters the process ends on its own and there is nothing to dispose.

## Testing

`@effect/vitest` shares v4's version number — install `@effect/vitest@rc` alongside `effect@rc`, and mismatched majors will not work. Test services against a layer, never against the app runtime:

```ts
import { it, expect } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { NotFound, Todos } from "../services"

const TestLayer = Todos.layer.pipe(
  Layer.provide(
    ConfigProvider.layer(ConfigProvider.fromEnvRecord({ DATABASE_URL: "memory://test" }))
  )
)

it.effect("returns a seeded todo", () =>
  Effect.gen(function* () {
    const todos = yield* Todos
    const todo = yield* todos.byId(1)
    expect(todo.id).toBe(1)
  }).pipe(Effect.provide(TestLayer)))

it.effect("fails with NotFound for a missing id", () =>
  Effect.gen(function* () {
    const todos = yield* Todos
    const result = yield* Effect.result(todos.byId(404))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(NotFound)
  }).pipe(Effect.provide(TestLayer)))
```

`Effect.result` moves the failure into the success channel so you can assert on it — this is v4's `Effect.either`. Swapping the config provider is usually enough to point a service at a test double; when it is not, give the service a second layer (`Todos.layerTest`) rather than mocking the module.
