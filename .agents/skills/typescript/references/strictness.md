# Strictness: tsconfig and lint rules

What `strict` does not cover, and what turning the rest on actually costs.

## The tsconfig chain

The root `tsconfig.json` extends `./.svelte-kit/tsconfig.json`, which `svelte-kit sync` regenerates on every check. Editing the generated file is pointless — read it for the current inherited set, and change behaviour in the root config instead.

What arrives **inherited** and should not be re-declared: `verbatimModuleSyntax`, `isolatedModules`, `noEmit`, `moduleResolution: "bundler"`, the `$lib` / `$app/types` aliases, and `rootDirs`. The root config owns `strict`, `checkJs`, and the rest.

A repo may hold more than one TypeScript project — a tooling or scripts directory with its own `tsconfig.json`, checked by plain `tsc`. Changes to the root config do not reach those; check what the repo's own scripts compile before assuming one config covers everything.

### What `verbatimModuleSyntax` demands

Type-only imports and re-exports must say so. This is enforced, not stylistic:

```ts
import type { Cookies } from "@sveltejs/kit";       // type-only
import { fetchUser, type User } from "./api";        // mixed, inline modifier
export type { UserRecord } from "./service";         // re-export of a type
```

A value import used only in type position emits a real runtime import. A type imported without `type` and then used as a value (`new`, enum member access) fails.

## The gap: `noUncheckedIndexedAccess`

It is not part of `strict` and the SvelteKit template does not add it, so unless it is set explicitly every index access is **unchecked**:

```ts
const items: string[] = ["a", "b"];
const item = items[10];   // types as string — it is undefined at runtime
```

Write the guard by hand:

```ts
issues[0]?.message ?? "Something went wrong."
```

Turning it on is a one-line change with an unbounded fix list — every array index, every `Record` lookup, every regex capture group becomes `T | undefined`. Worth doing deliberately, not as a drive-by.

Also outside `strict` and deserving the same deliberate treatment: `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`. `exactOptionalPropertyTypes` is the sharpest and the most disruptive.

## The lint config

A flat config that spreads `typescriptEslint.configs.recommended.rules` is on the **untyped** tier. Every rule needing the type checker is therefore absent:

| Rule | Catches |
|---|---|
| `no-floating-promises` | an async call whose promise is never awaited or handled |
| `no-misused-promises` | a promise passed where a boolean or void callback is expected |
| `await-thenable` | `await` on a non-promise, usually a forgotten call |
| `no-unnecessary-condition` | a check the types prove always true or always false |
| `no-unsafe-assignment` / `-call` / `-member-access` / `-return` / `-argument` | `any` leaking in from an untyped boundary |
| `switch-exhaustiveness-check` | a union member added without a matching case |

### Turning typed linting on

`@typescript-eslint/eslint-plugin` already ships the type-checked presets, so this needs **no new dependency** — append one block scoped to `**/*.ts`, leaving the existing `.svelte`-covering block on the untyped tier:

```js
{
    files: ["**/*.ts"],
    plugins: { "@typescript-eslint": typescriptEslint },
    languageOptions: {
        parser: typescriptParser,
        parserOptions: { projectService: true }
    },
    rules: { ...typescriptEslint.configs["recommended-type-checked"].rules }
}
```

`projectService: true` replaces the older `project: "./tsconfig.json"` and resolves each file against its nearest tsconfig, which is what lets one block cover several projects at once. ESLint now builds a program, so linting slows noticeably.

**Sort the findings before fixing them.** Enabling the preset on an established codebase produces three distinct classes, and treating them alike wastes a day:

- **Real bugs.** `no-base-to-string` is the one that earns its keep — `FormData.get()` returns `string | File`, so `String(form.get("email"))` turns an uploaded file into the literal `"[object File]"` and stores it. Fix the code.
- **Declarations to correct once.** `unbound-method` fires wherever an interface declares a method in shorthand form and callers destructure it — `App.Locals` declaring `getSession(): Promise<Session | null>` is the common SvelteKit case. Redeclaring it as a property, `getSession: () => Promise<Session | null>`, silences every call site at one line; `.bind()` at each call site is the wrong fix.
- **False positives to configure away.** `only-throw-error` flags `throw error(401, …)` and `throw redirect(303, …)`, because SvelteKit throws `HttpError` and `Redirect` and neither subclasses `Error`. Turn the rule off for routes.

Expect `require-await` to dominate the raw count; it is usually noise from `async` functions kept async for signature consistency. And note which rule tends *not* to fire: `no-floating-promises` is the one argued for first, yet a codebase that awaits conscientiously produces none — enable it to guard future code, not to clear a backlog, and say so when proposing it.

Two more cautions before enabling it:

- **`.svelte` files.** They run through `svelte-eslint-parser` with `@typescript-eslint/parser` nested inside, and typed linting over `svelte2tsx` output is undocumented. Scope the type-checked block to `**/*.ts` first.
- **Keep vendored and generated directories in `ignores`.** Any file a tsconfig excludes cannot be typed by the project service, which emits one fatal parse error per file — thousands of them if a dependency cache sits inside a project directory.

A rule earns its place by blocking a defect reachable from many files, not by encoding a style preference.

## Rules that no longer exist

`ban-types` was removed in typescript-eslint v8 and configuring it now errors. It split into:

| Replacement | Covers |
|---|---|
| `no-empty-object-type` | `{}` where it means "anything non-nullish" |
| `no-unsafe-function-type` | the bare `Function` type |
| `no-wrapper-object-types` | `String`, `Number`, `Boolean`, `Object` |
| `no-restricted-types` | your own banned-type list, configurable |

Also gone from v8: `no-throw-literal` (now `only-throw-error`) and `parserOptions.EXPERIMENTAL_useProjectService` (now plain `projectService`).
