# Selection

From a problem to a pattern — and first, to whether you need one.

## Do you need a pattern at all

Answer these before reaching for any structure:

1. **Can you name the second case?** A seam built for variation that does not yet exist has to guess the axis, and guesses about future variation are usually wrong. One implementation means write the direct code.
2. **Is the variation data or behaviour?** Data varies through props and unions. Only behaviour needs a strategy, a command or a state object.
3. **Would a function do?** Most GoF patterns are a single-method interface with a class around it. In TypeScript that method is a function type, and the class is packaging.
4. **Is it already shipped?** Observer, Memento, Chain of Responsibility, Proxy and Decorator exist in Svelte and SvelteKit. Check the [verdict table](../SKILL.md#the-verdict-table) before writing one.

Passing all four means the pattern is carrying real weight. Failing any means the direct code is the better answer today, and the seam can arrive with the second requirement — a refactor the compiler will guide.

## Problem → pattern

**State and communication:**

| The problem | Reach for |
|---|---|
| Two sibling components need the same data | Lift to the nearest common parent; pass props down |
| Many components across a subtree need it | [Mediator](behavioral.md#mediator) — one class in `createContext` |
| The data comes from the request (user, session, tenant) | [Singleton, request-scoped](creational.md#singleton) — context, never a module |
| Client-only preference (theme, sidebar) | [Singleton, process-scoped](creational.md#singleton) — a module instance |
| A value should survive reload or be shareable | URL search params — no pattern needed |
| A value should survive back-navigation only | [Memento](behavioral.md#memento) — the `snapshot` page export |
| Something outside Svelte must drive reactivity | [Observer](behavioral.md#observer) — `createSubscriber` |

**Behaviour and flow:**

| The problem | Reach for |
|---|---|
| One job, several interchangeable algorithms | [Strategy](behavioral.md#strategy) — a callback prop |
| The variation is markup, not logic | [Strategy](behavioral.md#strategy) — a `Snippet<[T]>` prop |
| An object behaves differently by mode, and modes are constrained | [State](behavioral.md#state) — a discriminated union |
| Actions must be undoable | [Command](behavioral.md#command) — `do`/`undo` pairs on a stack |
| Requests pass through ordered, optional steps | [Chain of Responsibility](behavioral.md#chain-of-responsibility) — `sequence()` |
| A fixed skeleton with pluggable steps | [Template Method](behavioral.md#template-method) — `children` and snippet props |
| One operation over a closed set of node types | [Visitor](behavioral.md#visitor) — `switch` with an exhaustive `never` |

**Construction and composition:**

| The problem | Reach for |
|---|---|
| Pick a component or handler from a runtime key | [Abstract Factory](creational.md#abstract-factory) — a `Record` registry |
| Many optional construction parameters | [Builder](creational.md#builder) — an options object with defaults |
| Ordered construction where steps narrow the type | [Builder](creational.md#builder) — a fluent chain, genuinely |
| Copy a configured object | [Prototype](creational.md#prototype) — `structuredClone($state.snapshot(x))` |
| An external shape does not match yours | [Adapter](structural.md#adapter) — a mapping function, schema-validated at trust boundaries |
| Add behaviour to an element | [Decorator](structural.md#decorator) — `{@attach}` |
| Add markup around content | [Decorator](structural.md#decorator) — a wrapper component |
| A tangle of modules needs one entry point | [Facade](structural.md#facade) — a module with a few exports |
| A part-whole tree | [Composite](structural.md#composite) — a self-importing component |
| Two dimensions of variation multiplying | [Bridge](structural.md#bridge) — inject the implementation |
| Many near-identical expensive objects | [Flyweight](structural.md#flyweight) — a `Map` cache |

## Signals you picked wrong

- **An `$effect` keeps two values in step.** That is `$derived` — see the **svelte-sveltekit** skill on why effects are an escape hatch.
- **An interface has one implementation and one caller.** Inline it.
- **A factory returns the same class every time.** That is `new`.
- **An event bus lives in a module.** Process-scoped on the server, so events cross users; and the emit/listen pair is untyped. Use context and a class.
- **A class hierarchy mirrors a set of statuses.** A discriminated union gives exhaustiveness the hierarchy cannot.
- **A wrapper class exists to satisfy an interface.** Structural typing already satisfies it — pass the object.
