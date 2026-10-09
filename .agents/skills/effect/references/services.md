# Services and layers

Everything in an Effect backend is a service: the database, the mailer, the clock, the signed-in user. A service is an interface with an identifier; a `Layer` is the recipe that builds it; the runtime builds each layer once and hands the result to every effect that asks for it.

v4 collapsed v3's four ways of declaring one (`Context.Tag`, `Context.GenericTag`, `Effect.Tag`, `Effect.Service`) into a single `Context.Service`. Everything here was run against `effect@4.0.0-rc.109`.

## Declaring a service

The class form is the default. Note the argument order — type parameters first, identifier second, which is the reverse of v3's `Context.Tag`:

```ts
import { Config, Context, Effect, Layer } from "effect"

export class Settings extends Context.Service<Settings, {
  readonly prefix: string
}>()("app/Settings") {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return Settings.of({ prefix: yield* Config.string("PREFIX") })
  }))
}
```

The identifier is a runtime key and should be globally unique — upstream's convention is the package name plus the path to the file, `"myapp/db/Database"`. Two services sharing an identifier silently resolve to whichever layer was provided last.

`Settings.of(...)` is an identity function that exists to type-check the object against the declared shape. Use it — without it a missing method surfaces at the call site rather than in the layer.

Keep the shape an interface of methods returning effects. Methods, not effects-with-arguments-baked-in, are what make the service mockable.

## Attaching the layer to the class

Put the layer on the class as `static readonly layer`. That keeps the interface and its implementation in one file and gives every consumer one obvious name. v4's convention is `layer`, with suffixes for variants (`layerTest`, `layerInMemory`); v3's `Default` and `Live` are gone.

There is a second form for services whose construction is itself an effect. `make` stores the constructor on the class, and — unlike v3's `Effect.Service` — does **not** generate a layer for you:

```ts
export class Logger extends Context.Service<Logger>()("app/Logger", {
  make: Effect.gen(function* () {
    const settings = yield* Settings
    return { log: (m: string) => Effect.log(`[${settings.prefix}] ${m}`) }
  })
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Settings.layer))
}
```

`Layer.provide` feeds `Settings` into the layer that needs it and keeps it *out* of the result — `Logger.layer` is a `Layer<Logger>`, and consumers never learn that `Settings` exists. Use `Layer.provideMerge` instead when you want both services exposed, and `Layer.mergeAll` to combine independent layers into the application layer.

Because dependencies are wired here, a service's consumers only ever mention the service itself. That is the whole point of the split: `Effect<Todo, NotFound, Todos>` says nothing about the database beneath it.

## Using a service

Prefer `yield*` in a generator. It makes the dependency visible at the point of use and keeps it in the effect's `R` channel:

```ts
const program = Effect.gen(function* () {
  const todos = yield* Todos
  return yield* todos.byId(1)
})
```

`Todos.use((t) => t.byId(1))` is the one-liner equivalent and is fine for a single call — upstream warns that it makes dependencies easy to lose track of, since the requirement appears in the return type without appearing in the body. `useSync` is the same for a callback that is not itself effectful. v3's static accessors (`Todos.byId(1)`) are gone; they erased generics and overloads.

## Writing the methods

Use `Effect.fn("Service.method")` for service methods. The name string feeds both the stack trace and a tracing span, so a failure deep in a layer names the method that produced it:

```ts
const byId = Effect.fn("Todos.byId")(function* (id: number) {
  const found = store.get(id)
  if (found === undefined) return yield* new NotFound({ id })
  return found
})
```

`return yield*` on the failure line is deliberate — it tells TypeScript the generator stops there, so the code below narrows correctly. Attach combinators by passing them as further arguments to `Effect.fn`, not by `.pipe`-ing its result.

## Services with a default: `Context.Reference`

A `Reference` is a service that does not need a layer because it has a default value. Use it for flags and ambient settings:

```ts
const Verbose = Context.Reference<boolean>("app/Verbose", { defaultValue: () => false })

// reads false with nothing provided; true under provideService
Effect.gen(function* () {
  if (yield* Verbose) yield* Effect.log("noisy")
})
```

Verified both ways: the effect runs with no layer at all and reads `false`, and `Effect.provideService(Verbose, true)` overrides it for that run. In v3 this was a class extending `Context.Reference<Self>()(id, opts)`; v4 makes it a plain function call with the value type as its parameter.

`FiberRef` is gone in v4 — anything that was a `FiberRef` is a `Reference` now.

## Request-scoped services

Long-lived services go in the application layer; anything that varies per request is provided at the call site with `Effect.provideService`. See [sveltekit.md](sveltekit.md) for the pattern. Putting a per-request value in the app layer freezes the first request's value for the process lifetime — a bug that never shows up in development, where you only ever make one request as one user.

## Dynamic, keyed resources

When you need one instance per tenant, connection or user rather than one per process, `LayerMap.Service` builds and caches layers by key instead of you hand-rolling a `Map` of runtimes. Upstream's example is `node_modules/effect/ai-docs/src/01_effect/05_resources/30_layer-map.ts`.
