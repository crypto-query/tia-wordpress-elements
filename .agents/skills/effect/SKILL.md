---
name: effect
description: Effect 4 in a SvelteKit backend — services and layers, ManagedRuntime at the request boundary, typed errors mapped to error()/fail()/redirect(), Schema validation, testing. Use when writing or reviewing Effect code, wiring Effect into a server route, hook or form action, or migrating from Effect 3.
version: 1.0.0
scope: integration
distribution: author-only
---

# Effect

Effect 4 renamed most of the API surface a model reaches for first, and training data is saturated with 3.x. On 14 August 2026 npm `latest` is **3.22.1** while `rc` is **4.0.0-rc.109**, with stable targeted at Q3/Q4 2026 — so `install effect` and `install effect@rc` give you two different libraries, and `Effect.catchAll` compiles on one and does not exist on the other. Check `node_modules/effect/package.json` before writing a line.

**v4 ships its own agent documentation inside the package**: `node_modules/effect/AGENTS.md` (394 lines, identical to `CLAUDE.md`) plus `node_modules/effect/ai-docs/` (76 runnable examples) and the full `src/`. v3 ships none of it. That local copy is the authority on the core API and costs no network — this skill deliberately does not restate it.

Everything below was run against effect 4.0.0-rc.109 and 3.22.1 on SvelteKit 2.63 / Svelte 5.56 / Vite 8 / TypeScript 6.0.3.

## Where to look

| File | Read it for |
|---|---|
| [sveltekit.md](references/sveltekit.md) | the whole integration: the runtime singleton, the **boundary** helper, load / actions / `+server.ts`, config, HMR, testing |
| [services.md](references/services.md) | `Context.Service`, writing layers by hand, wiring dependencies, per-request services |
| [errors.md](references/errors.md) | **failure** vs **defect**, the `catch*` family, `Cause`, what each one does and does not swallow |
| [versions.md](references/versions.md) | the v3↔v4 rename map, package consolidation, how to tell which version you are on |

## Working rules

**Read `node_modules/effect/AGENTS.md` first on v4.** It is upstream's own agent doc, it matches the installed version exactly, and it settles core-API questions that this skill does not cover — `Effect.gen` vs `Effect.fn`, `Schema`, resources, batching, observability. Its examples in `ai-docs/*.ts` are real compiled files you can read and run. Reach for Context7 or `effect.website` only for what is not in the package.

**Effect is server-only. Put it under `$lib/server/` or in a `.server.ts` file.** SvelteKit enforces that boundary at build time; importing a service module from a shared file pulls the whole runtime into the client bundle.

**One `ManagedRuntime` per process, held on `globalThis`.** A module-level runtime is rebuilt every time Vite re-evaluates its module, and nothing disposes the old one. [sveltekit.md](references/sveltekit.md) has the measured evidence and the singleton.

**Pin the error channel to `never` before running.** A boundary helper typed `Effect<A, never, AppServices>` makes the compiler name any failure you forgot to map, instead of letting it reach `runPromise` as a rejected promise. This is the single highest-value pattern in the integration.

**Write `Effect.gen` and `Effect.fn("name")`, then attach behaviour with combinators.** Upstream's own rule, and it keeps stack traces and spans intact. Do not `.pipe` an `Effect.fn` — pass the combinators as extra arguments to it.

**The gate is `svelte-check`, not `tsc`.** Effect's inference does most of its work in the error and services channels, and a plain `tsc` invocation skips `.svelte` files entirely. Run your project's check script.

## Corrections to common assumptions

Ordered by how often each one bites when writing v4 with v3-trained reflexes. Every v3/v4 claim here was checked against both installed packages, not against release notes:

- **`Effect.catchAll` does not exist in v4 — it is `Effect.catch`.** The most frequent single mistake. `catchTag` and `catchTags` keep their names; the full family is in [errors.md](references/errors.md).
- **Services are `Context.Service` only.** `Context.Tag`, `Context.GenericTag`, `Effect.Tag` and `Effect.Service` are all gone in v4. Note the argument order flipped: `Context.Service<Self, Shape>()("id")`, where v3 wrote `Context.Tag("id")<Self, Shape>()`.
- **There is no auto-generated `.Default` layer.** v3's `Effect.Service` produced one and wired `dependencies` for you. In v4 you write `static readonly layer = Layer.effect(this, this.make)` yourself and wire dependencies with `Layer.provide`. The convention is `layer`, not `Default` or `Live`.
- **`@effect/platform` is not a v4 package.** Platform, rpc and cluster were merged into core as `effect/unstable/http`, `effect/unstable/rpc`, `effect/unstable/cluster`. Everything in `effect/unstable/*` may break in a minor. On v3 you install `@effect/platform` separately and its version is unrelated to core's (`0.97.1` against `effect@3.22.1`); in v4 every ecosystem package shares one version number.
- **`Effect.either` is `Effect.result`, and the `Either` module is `Result`.** Failure and success tags are `_tag: "Failure" | "Success"`.
- **Prefer `Schema.TaggedError` over `Data.TaggedError` — but `Data.TaggedError` is not deprecated.** Both exist and both work in v4. Upstream's guidance is `Schema.TaggedError` because the error is then serializable and usable across a wire boundary. Reach for `Data.TaggedError` when you want no schema.
- **`Schema.Defect` is a function call in v4.** Write `cause: Schema.Defect()`. In v3 it is a plain schema value with no parentheses — a silent source of "No overload matches this call".
- **SvelteKit's `error()` and `redirect()` become defects inside an Effect, and that mostly works.** They throw, so Effect classes them as defects rather than typed failures. Measured consequences: `Effect.catch` does *not* swallow them, `Effect.retry` does *not* re-run them, `runPromise` rejects with the original object so `isRedirect`/`isHttpError` still hold at the boundary — but `Effect.catchCause` silently swallows them. Prefer returning a typed error and mapping it at the boundary; [sveltekit.md](references/sveltekit.md) has the evidence for each.
- **`Config` reads `process.env`, which not every adapter populates.** Bridge SvelteKit's own env instead with `ConfigProvider.fromEnvRecord(env)` from `$env/dynamic/private`.
- **`FiberRef` and `Micro` are gone in v4.** `FiberRef` became `Context.Reference` (see the `References` module); `Micro` has no v4 replacement.
- **`Runtime<R>` the type is gone; the `Runtime` module is not.** It now holds only process-lifecycle helpers. Use `Context<R>` for services and `ManagedRuntime` to run things.

## Related skills

- **svelte-sveltekit** — the framework side: `+page.server.ts`, hooks, form actions, adapters
- **typescript** — strictness, the `svelte-check` gate, and how the error channel interacts with `noUncheckedIndexedAccess`
