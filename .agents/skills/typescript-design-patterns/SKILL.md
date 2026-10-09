---
name: typescript-design-patterns
description: Gang of Four patterns in Svelte 5 and TypeScript — which dissolve into runes and language features, which the framework already ships, and which still earn their keep. Use when reaching for a named pattern, designing state shared across components, or reviewing a hand-rolled store, registry, event bus or undo stack.
version: 1.0.0
scope: architecture
distribution: author-only
---

# TypeScript Design Patterns in Svelte

Verified against **svelte 5.56.9** / **@sveltejs/kit 2.70.2**. The classical catalogues — [refactoring.guru's TypeScript examples](https://refactoring.guru/design-patterns/typescript) among them — write all 23 patterns as abstract classes with inheritance hierarchies, because that is the 1994 vocabulary. Svelte 5 and modern TypeScript absorbed most of them. Porting the class diagram literally is the mistake this skill exists to prevent.

Every pattern gets one of three verdicts:

- **Dissolved** — a language or rune feature already does the job. Writing the classical structure adds indirection and buys nothing.
- **Shipped** — Svelte or SvelteKit implements this pattern for you. Hand-rolling it means maintaining a worse copy and losing SSR correctness.
- **Earns its keep** — the classical structure is still the right answer, in the shape given.

## The verdict table

Creational — *how objects get made*:

| Pattern | Verdict | Reach for this instead |
|---|---|---|
| [Abstract Factory](references/creational.md#abstract-factory) | Earns its keep | A `Record<Kind, () => Product>` registry, keyed by a union |
| [Builder](references/creational.md#builder) | Dissolved | An options object with defaults; `satisfies` to check it |
| [Factory Method](references/creational.md#factory-method) | Dissolved | A function returning a discriminated-union member |
| [Prototype](references/creational.md#prototype) | Dissolved | `structuredClone`, spread, `$state.snapshot` |
| [Singleton](references/creational.md#singleton) | **Shipped, with a trap** | A module instance is *process-scoped* and leaks across SSR requests — `createContext` for request scope |

Structural — *how objects are composed*:

| Pattern | Verdict | Reach for this instead |
|---|---|---|
| [Adapter](references/structural.md#adapter) | Dissolved | Structural typing — write the mapping function, skip the class |
| [Bridge](references/structural.md#bridge) | Dissolved | Generics plus an injected implementation object |
| [Composite](references/structural.md#composite) | Dissolved | A component importing itself, or a self-referencing snippet |
| [Decorator](references/structural.md#decorator) | Shipped | `{@attach}` for behaviour, a wrapper component for markup |
| [Facade](references/structural.md#facade) | Dissolved | A `.svelte.ts` module exporting a few functions |
| [Flyweight](references/structural.md#flyweight) | Dissolved | A `Map` cache plus `$state.raw` to skip proxying |
| [Proxy](references/structural.md#proxy) | Shipped | `$state` *is* a `Proxy`; `$derived` gives you laziness |

Behavioral — *how responsibility is shared*:

| Pattern | Verdict | Reach for this instead |
|---|---|---|
| [Chain of Responsibility](references/behavioral.md#chain-of-responsibility) | Shipped | `sequence()` composes `handle` hooks |
| [Command](references/behavioral.md#command) | Earns its keep | An object with `do`/`undo`, for undo stacks only |
| [Iterator](references/behavioral.md#iterator) | Dissolved | Generators and `[Symbol.iterator]()` |
| [Mediator](references/behavioral.md#mediator) | Dissolved | One class with `$state` fields, handed out through context |
| [Memento](references/behavioral.md#memento) | Shipped | `$state.snapshot`, the `snapshot` page export, the `transport` hook |
| [Observer](references/behavioral.md#observer) | Shipped | `$state` and `$derived`; `createSubscriber` to bridge external sources |
| [State](references/behavioral.md#state) | Earns its keep | A discriminated union plus `$derived`, for anything past three states |
| [Strategy](references/behavioral.md#strategy) | Dissolved | A callback prop; a `Snippet` prop when the variation is markup |
| [Template Method](references/behavioral.md#template-method) | Dissolved | A `children` snippet, or `+layout.svelte` |
| [Visitor](references/behavioral.md#visitor) | Dissolved | `switch` over a discriminated union with an exhaustive `never` |

*Interpreter, GoF's 23rd, is omitted — for a real grammar, reach for a parser library rather than hand-rolling an expression tree.*

## Where to look

| File | Read it for |
|---|---|
| [selection.md](references/selection.md) | problem → pattern, and the checks that say you need no pattern at all |
| [creational.md](references/creational.md) | the 5 creational patterns, with the Singleton SSR trap in full |
| [structural.md](references/structural.md) | the 7 structural patterns, attachments, wrapper components, caching |
| [behavioral.md](references/behavioral.md) | the 11 behavioral patterns, state machines, undo stacks, external sources |

## Working rules

**Scope shared state to the request.** Top-level `$state` in a `.svelte.ts` module lives on the module, and a server process serves every user from one module instance — so one visitor's data reaches the next. `createContext` attaches state to the component tree, which is built per request. Module scope is safe only where a process serves exactly one user: the browser. This single distinction decides Singleton, Mediator, Observer and Flyweight, and [creational.md](references/creational.md#singleton) works it through.

**Spend the pattern on variation you can name.** A Strategy with one implementation is a function with extra steps; a Factory that always returns the same class is a constructor call. Name the second case before building the seam — if you cannot, write the direct code and let the seam arrive with the requirement.

**Prefer the framework's implementation.** A shipped pattern already handles SSR, teardown and batching. Hand-rolled event buses and stores lose exactly those, and lose them silently.

**Derive, don't synchronise.** A pattern that keeps two values in step with an `$effect` is reimplementing `$derived` badly. Effects are for reaching outside Svelte — DOM, canvas, network, third-party libraries.

## Corrections to common assumptions

Training data is saturated with Svelte 4 stores, class-diagram ports of GoF, and advice that predates runes:

- **A module-level singleton leaks between users under SSR.** It is fine in a client-only app and unsafe the moment the server renders. `createContext` is the request-scoped answer, and the Svelte docs make this the headline reason context exists.
- **`export let count = $state(0)` does not work across modules.** The compiler rewrites every reference in the *declaring* file only, so an importer receives a signal object rather than a number. Export a container you mutate (`export const counter = $state({ count: 0 })`) or export accessor functions.
- **`createContext` replaced the `setContext`/`getContext` pair** in 5.40. It returns a typed `[get, set]` tuple and needs no string key, which removes both the key collisions and the `unknown` return.
- **Pass a getter into context, not a value.** `setSession(new Session(data.user))` reads `data.user` once and holds the first navigation's value forever; `new Session(() => data.user)` keeps the read live. The compiler stays quiet — `svelte-check` and the autofixer catch it as `state_referenced_locally`.
- **Stores are the Svelte 4 Observer.** A class with `$state` fields does the same job with no `subscribe` contract, no `$` prefix and no manual teardown. `svelte/store` remains only for the RxJS-style interop it was always good at.
- **`$state` is already a `Proxy`.** Arrays and plain objects are proxied recursively, so a hand-written access-logging Proxy over reactive state fights the runtime. Wrap the object *before* handing it to `$state`.
- **Class instances are not proxied.** Reactivity comes from `$state` on the *fields*, so a ported GoF class whose fields are plain properties renders once and never updates.
- **`SvelteMap` and `SvelteSet` are shallow.** The collection is reactive; the values inside are not. A Flyweight cache of mutable objects needs `$state` on the objects too.
- **Snippets replaced slots**, so Template Method and Strategy carry markup as a typed `Snippet<[T]>` prop rather than a named slot.
- **`{@attach}` replaced `use:` actions** as the Decorator seam. Attachments compose on one element, take reactive arguments and clean up by returning a function; `fromAction` wraps a library action that still ships as one.
- **A `.svelte.ts` file is a module, not a component.** It gets runes, and it gets no lifecycle — `$effect` there needs an `$effect.root` and a matching teardown call.

## Related skills

- **typescript** — discriminated unions, `satisfies`, branded types, exhaustive `never`, the strictness flags these patterns assume
- **svelte-sveltekit** — the runes, snippets, context and hooks APIs themselves
- **codebase-design** — deep modules and where a seam belongs, before you pick which pattern fills it
