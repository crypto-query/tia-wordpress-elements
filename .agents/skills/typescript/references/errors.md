# Errors and validation

Two questions, answered separately: how a failure travels back to the caller, and how untrusted data becomes a typed value.

## Outcome unions vs `throw`

**Expected failures return an outcome union.** A bad email, a bot submission, a store that is down — the caller must handle these, so they belong in the return type where the compiler can enforce it. A caller that forgets a case fails to compile. [types.md](types.md) has the shape and the exhaustiveness pattern.

**Unexpected failures throw.** A missing webhook secret, a malformed request body — nothing downstream can recover, so a route throws `error(401, …)` and lets SvelteKit render it.

The line is *can the caller do something specific about it*, not *how bad is it*. A 401 is severe and thrown; a rejected honeypot submission is trivial and returned.

A generic `Result<T, E>` is the same idea with the cases fixed at two. Name the cases when the caller branches on more than success/failure — a named union says at the call site that rejection and invalidity are different things, where `Result<string, Error>` does not. Reach for a shared `Result` alias only once several modules genuinely need the same two-case shape.

**`neverthrow`, `Effect`, and `fp-ts` each need approval before adoption.** A tagged union plus `switch` costs nothing and needs no library. Effect in particular is an architecture rather than a utility — it wants the whole call graph.

### Catching

`catch` binds `unknown` under `strict`, so narrow before touching it. When the error is not inspected, omit the binding entirely — the cleanest form, and valid since TypeScript 4.0:

```ts
try {
    await store.save(record);
} catch {
    return { kind: "failed" };
}
```

When you do need it, prefer a library-supplied guard over `instanceof`, which fails across realms and for anything thrown that is not an `Error`:

```ts
catch (err) {
    if (isHttpError(err)) throw err;              // re-throw what the framework owns
    throw error(400, { message: "Bad request" });
}
```

## Validation

Parse at the boundary and derive the type from the schema. Both valibot and zod implement [Standard Schema](https://standardschema.dev), so a function can accept either by taking the `StandardSchemaV1` interface rather than a concrete schema type. When a repo uses more than one, both resolve everywhere and nothing warns you when you reach for the wrong one — match whatever the surrounding directory already imports.

### valibot

Schemas compose from functions rather than methods, which is what makes them tree-shakeable:

```ts
import * as v from "valibot";

export const EmailSchema = v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.nonEmpty("Please enter your email address"),
    v.email("Please enter a valid email address")
);

export type Email = v.InferOutput<typeof EmailSchema>;
```

`v.pipe` runs transforms and validations in order, so the schema is both validator and normaliser. Importing one schema into the client component and the server service alike is what keeps the canonical `trim().toLowerCase()` form identical in the form gate, every write, and every lookup.

`InferOutput` is the post-transform type; `InferInput` is what the schema accepts. They differ whenever a `pipe` transforms — take `InferOutput` for anything downstream of parsing.

### zod

Same shapes, method-chained:

```ts
export const planSchema = z.object({
    items: z.array(z.object({ id: z.string(), title: z.string() }))
});

export type PlannedItem = z.infer<typeof planSchema>["items"][number];
```

`z.infer` is zod's `InferOutput`. Indexing into the inferred type — `["items"][number]` — derives the element type without declaring it separately.

### `parse` vs `safeParse`

Both exist in both libraries, and the choice mirrors the throw/return split above:

```ts
const result = v.safeParse(EmailSchema, candidate);
if (!result.success) {
    return { kind: "invalid", message: result.issues[0]?.message ?? "…" };
}
const email = result.output;
```

`safeParse` returns a discriminated union — use it when the failure is an outcome the caller handles. `parse` throws, which suits a webhook route where any malformed payload collapses to one 400. The `issues[0]?.` guard is there because index access is **unchecked** ([strictness.md](strictness.md)), even though `issues` is non-empty by contract.

## Typing an untyped boundary

`await request.json()` and `await res.json()` both return `any`, and so does an untyped SDK response. The value is genuinely unknown, and the fix is to parse it rather than assert it:

```ts
const payload = await request.json();
const { id, action } = v.parse(WebhookSchema, payload);
```

Casting instead (`as Payload`) produces a type the compiler trusts and the runtime does not, and the error then surfaces somewhere unrelated. Annotating the intermediate as `unknown` helps — it forces the parse rather than permitting the member access.

This is reliably the largest source of findings when typed linting is switched on: `no-unsafe-assignment` and `no-unsafe-member-access` cluster around unparsed `json()` results.
