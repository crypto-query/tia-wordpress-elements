# Type modelling

Patterns that change what the compiler can prove. Ordinary generics, `Pick`/`Omit`, and the utility types are assumed — this file covers what is easy to get subtly wrong.

## Discriminated unions

The workhorse. Tag a union of shapes with a literal field and narrowing falls out of the tag check:

```ts
type ParseOutcome =
    | { kind: "ok"; value: number }
    | { kind: "empty" }
    | { kind: "invalid"; input: string; message: string };
```

`message` exists only on `invalid`, so reading it anywhere else is a compile error rather than a runtime `undefined`. Two rules make this work:

- **Discriminate on a literal type.** `{ ok: boolean }` narrows nothing; `{ kind: "invalid" }` narrows completely.
- **Keep the tag field name identical across members.** `kind` here; `status`, `type`, `_tag` are all fine — consistency within a union is what matters.

When to reach for this over `throw` is [errors.md](errors.md)'s subject.

## Exhaustiveness

Assigning the narrowed value to `never` turns "a union member was added" into a compile error at every switch that handles it:

```ts
function label(outcome: ParseOutcome): string {
    switch (outcome.kind) {
        case "ok":      return `Parsed ${outcome.value}`;
        case "empty":   return "Nothing to parse";
        case "invalid": return outcome.message;
        default: {
            const unreachable: never = outcome;
            return unreachable;
        }
    }
}
```

Without a `default`, a missing case surfaces only as "not all code paths return" — weaker, and silent when the return type already includes `undefined`. Write the `never` binding.

The lint-rule equivalent is `switch-exhaustiveness-check`, which needs typed linting — see [strictness.md](strictness.md).

## Branded types

Two `string` ids are mutually assignable, so the compiler cannot stop you passing an order id where a user id belongs. A brand adds a phantom property that exists only in the type system:

```ts
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
```

`unique symbol` rather than a string key (`{ __brand: B }`) keeps the marker off autocomplete and out of anything that enumerates keys. Construction goes through one checked door:

```ts
function toUserId(raw: string): UserId | null {
    return /^[0-9a-f-]{36}$/.test(raw) ? (raw as UserId) : null;
}
```

That single assertion is the point — it is the only cast, and it sits behind a real check. Brand the identifiers a wrong value would silently corrupt (user vs order, cents vs dollars, raw vs escaped HTML). Branding every string is noise.

## Type predicates

A predicate returns `value is T` and narrows the caller's binding:

```ts
function isSession(value: unknown): value is Session {
    return (
        typeof value === "object" && value !== null &&
        "userId" in value && typeof value.userId === "string"
    );
}
```

**A predicate is an unchecked promise to the compiler.** Nothing verifies that the body establishes `T`; one that checks two of five fields narrows to all five regardless. For anything crossing a real boundary — network, form data, database row — parse with a schema and let the type come out the other side ([errors.md](errors.md)).

TypeScript 5.5 infers predicates for simple filters, so this narrows with no annotation:

```ts
const emails = rows.map((r) => r.email).filter((e) => e !== null);   // string[]
```

Only when the callback is a single expression the compiler can follow. Anything longer still needs the explicit `is`.

## Assertion functions

`asserts value is T` narrows for the rest of the scope instead of returning a boolean:

```ts
function assertDefined<T>(value: T | null | undefined, label: string): asserts value is T {
    if (value === null || value === undefined) throw new Error(`${label} is missing`);
}
```

Two constraints produce confusing errors when missed: the function needs an explicit return-type annotation on the *declaration* (inference never produces `asserts`), and it must be a `function` — an arrow assigned to a `const` only works if that const is explicitly typed.

Assertions throw, so they belong where a missing value is a bug, not where it is an expected outcome.

## `satisfies`

Checks a value against a type without widening it (TypeScript 4.9). `as const` locks in literals but checks nothing, so a typo'd key survives; `satisfies` catches it while keeping `sameSite` as `"lax"` rather than widening to `string`:

```ts
export const COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
} as const satisfies CookieSerializeOptions;
```

| Form | Checked against the type | Literals kept |
|---|---|---|
| `const x: T = {...}` | yes | no |
| `const x = {...} as const` | no | yes |
| `const x = {...} satisfies T` | yes | yes |

`as const satisfies T` combines the last two and is the right default for a config object with a known shape.

## `NoInfer`

Stops an argument from contributing to inference (TypeScript 5.4):

```ts
function withFallback<T extends string>(values: T[], fallback: NoInfer<T>): T { /* … */ }

withFallback(["draft", "review"], "unknown");   // error, as intended
withFallback(["draft", "review"], "review");    // fine
```

Without `NoInfer`, `fallback` joins the inference and widens `T` to include `"unknown"`, so the mistake compiles.

**`NoInfer` alone is not enough — the constraint does half the work.** Written `<T>` rather than `<T extends string>`, the array widens `T` to `string` on its own, `"unknown"` is a perfectly good `string`, and the call compiles regardless. Verify the error actually appears rather than assuming the wrapper did something: a `NoInfer` that silently no-ops looks identical to one that works.

Reach for it when one parameter should define the type and another should merely conform — defaults, fallbacks, callback parameters.

## `const` type parameters

Infers literal types through a generic without the caller writing `as const` (TypeScript 5.0), moving the burden from every call site to the one declaration:

```ts
function defineStages<const T extends readonly string[]>(stages: T): T { return stages; }

const stages = defineStages(["draft", "review", "done"]);
type Stage = (typeof stages)[number];   // "draft" | "review" | "done"
```

Worth it for any API whose value is the literal union it produces.

## Template literal types

```ts
type StageEvent = `stage:${Stage}`;   // "stage:draft" | "stage:review" | "stage:done"
```

The union expands eagerly, so the size is the product of the parts. Two four-member unions is 16 and fine; four is thousands and slows the checker to a crawl. Keep the cross-product small, or take a plain `string` and validate at runtime.
