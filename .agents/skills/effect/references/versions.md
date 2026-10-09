# Versions: v3 and v4

## Where things stand

Measured on npm on 14 August 2026:

| dist-tag | version |
|---|---|
| `latest` | 3.22.1 |
| `rc` | 4.0.0-rc.109 |
| `beta` | 4.0.0-beta.107 |

v4 has been in beta since February 2026, tagged its first release candidate on 12 August 2026, and upstream targets stable for Q3/Q4 2026. `install effect` still gets you 3.x; v4 needs an explicit `effect@rc`.

**Which to adopt.** For a new backend, v4 — the migration is a rewrite of every service declaration and every `catchAll`, and doing it later costs more than starting there. For an existing v3 codebase, stay on v3 and migrate deliberately; upstream states the sweeping breaking changes are behind them and ships an agent-runnable migration guide. Either way, read `node_modules/effect/package.json` before writing code, because the two versions disagree about the names of the functions you will reach for first.

## Telling them apart in a checkout

The fastest signals, in order:

1. `node_modules/effect/AGENTS.md` exists → v4. v3 ships no agent docs.
2. `@effect/platform` in `package.json` → v3. In v4 that code is `effect/unstable/http`.
3. A `Context.Tag` or `Effect.Service` call anywhere in the source → v3.

## What v4 changed structurally

- **One version number for the ecosystem.** `effect`, `@effect/vitest`, `@effect/sql-*`, `@effect/platform-*` and the rest all release together on the same number, so `effect@4.0.0-rc.109` pairs with `@effect/vitest@4.0.0-rc.109`. In v3 they versioned independently — `@effect/platform@0.97.1` against `effect@3.22.1` — and compatibility was guesswork.
- **Package consolidation.** `@effect/platform`, `@effect/rpc` and `@effect/cluster` merged into core. Platform-specific, driver-specific and provider-specific packages stayed separate: `@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, `@effect/opentelemetry`, `@effect/atom-*`, `@effect/vitest`.
- **`effect/unstable/*`.** Modules under this path may break in a *minor* release; everything outside it follows strict semver. Currently unstable: `ai`, `cli`, `cluster`, `devtools`, `encoding`, `eventlog`, `http`, `httpapi`, `observability`, `persistence`, `process`, `reactivity`, `rpc`, `schema`, `socket`, `sql`, `workflow`. They graduate to top level as they stabilise. Budget for churn if a backend depends on `unstable/http` or `unstable/sql`.
- **In-package agent docs.** v4 ships `AGENTS.md`, an identical `CLAUDE.md`, 76 runnable examples in `ai-docs/`, and the full `src/` inside the published package. This is the best documentation available for the core API and it is already on disk.
- **A rewritten fiber runtime**, aggressive tree-shaking, and a much smaller floor — upstream quotes ~6.3 KB min+gzip for a minimal program, ~15 KB with Schema.

## Rename map

Checked by inspecting the declaration files of both installed packages rather than by reading release notes.

| v3 | v4 |
|---|---|
| `Effect.catchAll` | `Effect.catch` |
| `Effect.either` | `Effect.result` |
| `Either` module | `Result` module |
| `Context.Tag(id)<Self, Shape>()` | `Context.Service<Self, Shape>()(id)` |
| `Context.GenericTag<T>(id)` | `Context.Service<T>(id)` |
| `Effect.Tag`, `Effect.Service` | `Context.Service` |
| `Effect.Service`'s auto `.Default` layer | hand-written `static readonly layer` |
| `dependencies: [...]` option | `Layer.provide(...)` |
| `Context.Reference<Self>()(id, opts)` | `Context.Reference<T>(id, opts)` |
| `FiberRef` module | `Context.Reference` / `References` |
| `Runtime<R>` type | removed — use `Context<R>` |
| `Runtime.runFork(runtime)` | `Effect.runForkWith(services)` |
| `Schema.Defect` | `Schema.Defect()` |
| `Micro` module | removed, no replacement |
| `@effect/platform` | `effect/unstable/http` |
| `@effect/rpc`, `@effect/cluster` | `effect/unstable/rpc`, `effect/unstable/cluster` |

Unchanged and safe to keep using: `Effect.gen`, `Effect.fn`, `Effect.catchTag`, `Effect.catchTags`, `Effect.provideService`, `Layer.effect`, `Layer.provide`, `Layer.mergeAll`, `ManagedRuntime`, `Schema.TaggedError`, `Data.TaggedError`, `Config`, `Stream`.

`Cause` kept its name but changed shape: v3's nested tree became a flat list of reasons, so code that pattern-matched on `Cause.Die`/`Cause.Fail` nodes needs rewriting against `hasFails`, `hasDies`, `findDefect` and `squash`.

## Migrating

Upstream ships per-topic migration guides in the repository — `MIGRATION.md` indexes them, and `migration/services.md`, `migration/error-handling.md`, `migration/runtime.md`, `migration/schema.md` and `migration/cause.md` cover the changes most likely to touch a backend. The 4.0 release notes explicitly invite handing those files to a coding agent and reviewing the diff against your test suite.

Order that works: bump the version, fix every service declaration first (they gate everything else), then the `catchAll` calls, then imports moving out of `@effect/platform`, then `Cause` inspection. Type errors guide the whole process — there is no silent-behaviour-change class of failure here except in `Cause` handling.

## Beyond these files

For the core API on v4, read `node_modules/effect/AGENTS.md` and the examples in `node_modules/effect/ai-docs/`. For `Schema` specifically, upstream keeps a large dedicated guide at `packages/effect/SCHEMA.md` in the repository. For anything else, Context7 (`resolve-library-id` → `query-docs` on `Effect-TS/effect`) and `effect.website/docs`. Note there is no `llms.txt` at the site root; the repository's `LLMS.md` is the same document that ships as `AGENTS.md` in the package. Effect publishes no MCP server, and upstream ships no skill for *using* Effect — the `.agents/skills/` directory in its repository holds contributor tooling (`jsdocs`, `scratchpad`) for working on Effect itself.
