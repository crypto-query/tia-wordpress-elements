---
title: "Promoting a flat app"
summary: "Moving one domain from routes-as-app into the layered shape, in an order where every step ships on its own, with a checkable criterion for each."
verified_against: "svelte 5.56.9, @sveltejs/kit 2.70.2, vite 8.2.1"
---

# Promoting a flat app

The starting point is normal and healthy: `+page.server.ts` files that query the database directly. You promote a domain when its **second caller** appears — a worker, an endpoint, a scheduled job that needs the same rules. Promote that one domain and leave the rest flat.

The order below matters because each step is a shippable commit and no step depends on the next one being done. A promotion abandoned after step 3 leaves the codebase better than it found it.

## 1. Find the surface

Before moving anything, learn what the domain actually touches.

```sh
grep -rn "orders\b" src/routes src/lib/server --include=*.ts | grep -v '\.test\.'
```

You are looking for every place that reads or writes this domain's tables, and every place that encodes one of its rules. Expect the rules to be duplicated in two or three routes already — that duplication is the evidence the promotion is worth doing, and the list of behaviours the service has to end up with.

**Done when:** you can name every file that touches the domain's tables.

## 2. Collect the queries into one file

Move the raw queries — unchanged, no interface, no rules — into `src/lib/server/modules/orders/store.drizzle.ts`. Routes now import functions from it instead of building queries inline.

This is the step that buys the most for the least, and it is worth doing even for a domain you never promote further: from here on, a schema change has one file to visit.

**Done when:** the grep from step 1 matches the domain's tables in `store.drizzle.ts` and nowhere else.

## 3. Extract the rules into a service

Now pull the decisions — validation beyond shape, status transitions, what-happens-next — out of the route handlers into `service.ts`, taking the store as an argument:

```ts
export async function markPaid(id: string, deps: { store: typeof drizzleOrdersStore }) { … }
```

Importing the concrete adapter's type is fine at this stage. The route becomes the duties and nothing else ([callers.md](callers.md)); when two routes had the same rule, they now call one function.

**Done when:** each affected route handler is parse, authorize, one service call, shape — and every rule the grep found lives in `service.ts`.

## 4. Declare the port

Replace `typeof drizzleOrdersStore` with an interface in `store.ts` — written from **what the service actually calls**, not from everything the adapter exports. A port derived from the adapter is the adapter with extra steps; a port derived from the service is the real dependency.

Then make the module portable, which is the property the whole exercise is for:

```sh
grep -rn '\$app/\|\$env/\|@sveltejs/kit' src/lib/server/modules/orders/   # want: no value imports
```

Anything this finds moves outward: config to the composition root, `error()` to the caller, `getRequestEvent()` to the boundary with the extracted value passed inward ([wiring.md](wiring.md)).

**Done when:** the grep is clean of value imports, and `store.ts` names no vendor type.

## 5. Write the fake and the first test

`store.memory.ts` implementing the same interface, then a test of the rule that was hardest to reach through the UI. That test is the proof the seam is real: if writing it needs module mocking, the dependency is not actually injected.

**Done when:** a service test runs with no database and no `vi.mock`.

## 6. Add the second caller

Only now is the second caller cheap. It supplies its own actor and its own dependencies, and reuses every rule.

**Done when:** the new caller contains no rule the first caller also contains.

## 7. Add a composition root last

If the dependency list is short, parameter injection at each call site is the end state — stop here. Introduce a composition root when a service has several stable dependencies and callers are all passing the same ones ([wiring.md](wiring.md)).

## Wrong turns

- **Renaming folders and calling it architecture.** Moving files into `modules/` while the service still imports the database client changes nothing. The dependency direction is the architecture; the folder is a label on it.
- **Designing the port first.** An interface written before the service that uses it describes a guess. Extract, then abstract.
- **Promoting the whole app in one branch.** A ten-domain refactor cannot be reviewed and cannot be abandoned halfway. One domain, one branch, one deploy.
- **Extracting a service for a single caller.** That is the gate ([SKILL.md](../SKILL.md)). "We might need a worker later" is not a second caller.
- **Keeping the old path alive.** Once the routes call the service, delete the inline queries. Two ways to do the same write is how the rules diverge again.
- **Extracting a "utils" module.** `utils.ts` collects things by having no home, which is the opposite of organising by concept. Every function belongs to a domain, to infrastructure, or to a genuinely pure shared helper.

## When the route is too big to move at once

Strangle it. Extract one operation into the service, point the route at it, ship. Then the next. The route shrinks a handler at a time and stays working throughout, which matters most for exactly the routes that are too frightening to rewrite.

Take the operation with the most duplication first, not the simplest one — it is where the rules have already drifted, and consolidating it is what makes the next extraction obvious.
