# Type tests

## The type checker is already the runner

`expectTypeOf` and `assertType` do nothing at runtime. Vitest's typecheck mode does not execute them either — it reads the compiler's output. A failing assertion *is* a type error at the call site, which means the ordinary check step already runs your type tests: `svelte-check` covers the app project, and plain `tsc --noEmit` covers any separate project whose tsconfig includes its test files.

So put type assertions in the ordinary `.test.ts` file beside the runtime tests. There is no separate command to remember and no config to add. Adding `vitest --typecheck` would only change the reporting — errors surface as named failing tests rather than as check errors — and would need `typecheck.include` widened: it defaults to `**/*.{test,spec}-d.?(c|m)[jt]s?(x)`, so an ordinary `.test.ts` is never picked up.

The runtime gate is separate, and in a SvelteKit repo it is usually split into projects: a node project for `*.test.ts`, and a browser project that launches headless Chromium through Playwright for `*.svelte.test.ts`.

## `expectTypeOf`

```ts
import { expectTypeOf, test } from "vitest";
import type { ParseOutcome } from "./parse";

test("invalid outcomes carry a message", () => {
    expectTypeOf<Extract<ParseOutcome, { kind: "invalid" }>>()
        .toEqualTypeOf<{ kind: "invalid"; input: string; message: string }>();
});
```

The distinction that catches people out:

| Matcher | Passes when |
|---|---|
| `toEqualTypeOf<T>()` | the types are identical |
| `toExtend<T>()` | the type is assignable to `T` |

`toEqualTypeOf` is strict about optionality and about `any` — `expectTypeOf<any>().toEqualTypeOf<string>()` fails, which is the point when you are guarding a boundary against `any` creeping in.

Other forms worth knowing: `.parameters`, `.returns`, `.resolves` for promises, and `.toBeNever()` / `.toBeAny()` / `.toBeUnknown()` for the special types. `assertType<T>(value)` is the terse alternative when you only need "this expression is assignable to `T`".

## `@ts-expect-error`

Asserts that the next line *does* fail to compile:

```ts
// @ts-expect-error — an unbranded string must not pass as UserId
takesUserId("not-an-id");
```

It is self-cleaning, and that is what makes it usable as a test: when the error stops occurring, the directive itself raises **TS2578, "Unused '@ts-expect-error' directive"**. TS2578 is a full error rather than a warning, so it fails the check on its own — `--fail-on-warnings` has nothing to do with it, and it fails plain `tsc` equally. The practical consequence: widening a type can break the check in a file you did not touch. Prefer it over `@ts-ignore`, which sits silently forever once stale.

One more caution: a `@ts-expect-error` suppresses the *type* error, not the runtime one. Vitest's typecheck mode never executes the file, but `vitest run` does. Keep these lines inside a type-only assertion, or in a test body that never really calls through.

## What is worth type-testing

Compiling already proves most things. A type test earns its place where the type is the deliverable and a regression would be silent:

- **Branded types** — that the brand actually blocks the unbranded value (`@ts-expect-error` is the natural form)
- **Schema inference** — that `InferOutput<typeof Schema>` is still what consumers expect after a `pipe` changes
- **Generic helpers** — that inference produces the narrow type rather than a widened one; this is where `const` type parameters and `NoInfer` regress invisibly
- **Discriminated unions** — that narrowing on the tag reaches the member you expect

Skip them for plain function signatures and object shapes: any caller already fails to compile when those change, so the test adds a second place to update and catches nothing new.
