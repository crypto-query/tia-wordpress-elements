# Failures, defects and the `catch*` family

Effect splits things that go wrong into two kinds, and almost every mistake in this area comes from not knowing which one you are holding.

- A **failure** is expected and typed. It lives in the `E` channel of `Effect<A, E, R>`, the compiler tracks it, and the caller is expected to handle it: a row that was not found, a payment declined, a rate limit hit.
- A **defect** is unexpected and untyped. A raw `throw`, a bug, a broken invariant. It is not in the type, and it travels until something at the top catches it.

The rule of thumb matches the one you would apply without Effect: if the caller can do something specific about it, make it a failure. If nothing downstream can recover, let it be a defect.

## Declaring failures

```ts
import { Schema } from "effect"

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.Number
}) {}

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect()
}) {}
```

`Schema.Defect()` is a function call in v4 — the v3 spelling `Schema.Defect` without parentheses produces a "No overload matches this call" error that names the wrong thing entirely.

Raise one with `return yield* new NotFound({ id })`. The `return` matters: it tells TypeScript control flow stops there.

`Data.TaggedError` also exists in v4 and is not deprecated. Prefer `Schema.TaggedError` — it gives you an encodable error, which is what lets the same error cross an RPC or HTTP boundary — and use `Data.TaggedError` when the error carries fields no schema describes.

A `_tag` is what `catchTag` dispatches on, so every error type needs one. Use a distinct tag per failure mode rather than one `AppError` with a `kind` field; the compiler can only enforce exhaustiveness over the former.

## What catches what

Measured against a typed failure and a raw `throw`, both arms of every row:

| Combinator | Typed failure | Defect |
|---|---|---|
| `Effect.catch` | caught | **passes through** |
| `Effect.catchTag` / `catchTags` | caught, narrowed by `_tag` | passes through |
| `Effect.catchDefect` | **passes through** | caught |
| `Effect.catchCause` | caught | caught |

`Effect.catch` is v4's name for what v3 called `Effect.catchAll`. `catchAll` does not exist in v4.

`catchTags` takes a record keyed by tag and is the exhaustive form — prefer it to a chain of `catchTag` calls once there is more than one failure to handle, because adding a new failure to a service then breaks the routes that must handle it.

`catchCause` catching everything is exactly why it is dangerous in a web handler: it swallows interrupts and framework control-flow throws along with genuine bugs. See [sveltekit.md](sveltekit.md) for what that does to a redirect.

The rest of the family narrows rather than broadens: `catchIf` and `catchFilter` select by predicate, `catchReason`/`catchReasons` handle tagged errors that carry a tagged `reason` field, and `catchNoSuchElement` handles the failure that `Option`-style lookups produce.

## Moving between the two channels

- `Effect.orDie` converts a typed failure into a defect — verified: the resulting cause has no failures and one defect. Use it when a failure is genuinely unrecoverable at this layer and you would rather not thread it through every signature.
- `Effect.result` moves the failure into the success channel as a `Result`, so you can branch on it as data. This is v4's `Effect.either`:

  ```ts
  const r = yield* Effect.result(todos.byId(404))
  if (r._tag === "Failure") { /* r.failure is the typed error */ }
  ```

  Tags are `"Success"` and `"Failure"`, and the payload fields are `value` and `failure`.

## Inspecting a `Cause`

`runPromiseExit` gives you an `Exit` whose failure side is a `Cause` — v4 flattened it into a list of *reasons* (fail, die, interrupt) rather than v3's nested tree.

```ts
const exit = await Effect.runPromiseExit(program)
if (Exit.isFailure(exit)) {
  Cause.hasFails(exit.cause)    // any typed failures?
  Cause.hasDies(exit.cause)     // any defects?
  Cause.squash(exit.cause)      // the single most relevant thrown value
  Cause.pretty(exit.cause)      // formatted, for logs
}
```

`Cause.squash` is the one to reach for when bridging to code that expects a thrown value — it returns the original object, which is why a framework's own error survives a round trip through Effect.

## At the boundary

`runPromise` rejects with the error itself, not a wrapper: a typed `NotFound` arrives as a `NotFound` instance with its `_tag` intact, and a raw `throw new Error("raw throw")` arrives as that same `Error` with its message. Convenient, but do not rely on it — a rejected promise has lost the type information that made the failure worth declaring. Map failures explicitly and keep the boundary's error channel pinned to `never`.

## Retries

`Effect.retry` re-runs on typed failures only. Measured: a typed failure under `retry({ times: 3 })` ran 4 times; a defect under the same wrapper ran once. So a bug does not get hammered three more times, and a genuinely transient failure needs to be a *typed* failure for a retry policy to see it. Compose the schedule with `Schedule` for backoff, and narrow with `Effect.retry({ while: ... })` so a `NotFound` is not retried alongside a timeout.
