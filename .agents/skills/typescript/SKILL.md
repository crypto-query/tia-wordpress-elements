---
name: typescript
description: TypeScript 5.9–7.0 — strictness, type modelling, error and validation shapes, type tests. Use when writing or reviewing .ts code, changing tsconfig or the ESLint TypeScript rules, or upgrading TypeScript.
version: 3.0.0
scope: integration
distribution: author-only
---

# TypeScript

Two majors shipped in 2026 — 6.0 on 23 March, 7.0 (the Go native port) on 8 July — so anything recalled as "TypeScript 5.x best practice" is two releases behind. Two **ceilings** hold a SvelteKit project on 5.9 today; `package.json` carries the installed version. Every sample and version claim in these files was run against a real compiler before being written down.

## Where to look

| File | Read it for |
|---|---|
| [versions.md](references/versions.md) | what 6.0 breaks, the two **ceilings**, the upgrade recipe, `--tsgo` / `--incremental` |
| [strictness.md](references/strictness.md) | the tsconfig chain, the `noUncheckedIndexedAccess` gap, typed linting and what it costs, the rules that replaced `ban-types` |
| [types.md](references/types.md) | discriminated unions, exhaustive `never`, branded types, predicates, assertions, `satisfies` / `NoInfer` / `const` params |
| [errors.md](references/errors.md) | outcome unions vs `throw`, schema validation, schema-derived types |
| [testing.md](references/testing.md) | `expectTypeOf`, `assertType`, `@ts-expect-error`, and what runs them |

## Working rules

**Hover before you assume.** The `LSP` tool answers what a symbol actually resolves to — `hover` for the inferred type and TSDoc, `goToDefinition` for where it comes from, `findReferences` before changing a signature. Reading a declaration file and inferring by hand gets generics, conditional types, and `satisfies` widening wrong; hovering does not. Reach for it whenever the type is the question.

**The gate is `svelte-check`, not `tsc`.** `.svelte` files carry types only `svelte2tsx` can see, so `svelte-check` is what actually type-checks a SvelteKit app. Run the check and lint loop in `AGENTS.md` rather than a compiler invocation of your own.

**A clean plain `tsc` is a false green.** `tsc --noEmit -p tsconfig.json` exits 0 while including **none** of the `.svelte` files in the project, so the components go unchecked and the exit code says nothing about them. Verify against the repo's own check script before believing a clean run.

**Derive types from schemas.** `v.InferOutput<typeof Schema>` and `z.infer<typeof Schema>` keep the parsed shape and the static type as one source of truth. A hand-written `type` beside a schema drifts silently.

**For docs beyond these files, use Context7** (`resolve-library-id` → `query-docs` on `microsoft/typescript`) or fetch `typescriptlang.org/docs/*`. Microsoft ships no TypeScript MCP server, and `typescriptlang.org` serves no `llms.txt` or `AGENTS.md` — the community `typescript-mcp` packages only wrap `tsgo --lsp`, which the built-in `LSP` tool already covers.

## Corrections to common assumptions

Training data is saturated with TypeScript 5.x, ESLint 8, and advice repeated far past the release that made it true. Ordered by how often each one bites:

- **Write `import type` and `export type`.** `verbatimModuleSyntax` and `isolatedModules` arrive inherited from the generated `.svelte-kit/tsconfig.json`. They are enforced, and re-declaring them in the root `tsconfig.json` is redundant.
- **Guard every index access.** `noUncheckedIndexedAccess` is not part of `strict`, so unless it is set explicitly `items[0]` types as `T` rather than `T | undefined` — the access is **unchecked** and the compiler will not ask for the guard. Write `items[0]?.x ?? fallback` anyway.
- **Relative imports are extensionless under `moduleResolution: "bundler"`.** It resolves `./y`; the `./y.js` form belongs to `node16` / `nodenext`.
- **ESLint config is flat.** `eslint.config.js` exports an array and imports plugins and parsers as modules. Add a rule by editing the relevant config object. The `plugin:`-prefixed `extends` strings exist only in eslintrc.
- **Ban a type with `no-restricted-types`.** `ban-types` was removed in typescript-eslint v8 and split four ways; configuring it now errors rather than lints. [strictness.md](references/strictness.md) has the full mapping.
- **A config spreading the `recommended` preset lints untyped, so type-aware rules stay silent.** `no-floating-promises`, `no-misused-promises`, and `await-thenable` need a program, and the untyped tier builds none — an unawaited promise passes lint. [strictness.md](references/strictness.md) has the recipe and the cost.
- **`enum` and `const enum` both compile; the *ambient* const enum is what breaks.** `declare const enum` fails with TS2748 under `verbatimModuleSyntax`, while `export const enum` and a plain `enum` are fine across files. A string-literal union is still the better default — it needs no runtime object — but "enums are banned in modern TypeScript" is folklore.
- **`satisfies` is TypeScript 4.9, not 5.x.** `const` type parameters are 5.0 and `NoInfer` is 5.4. All are long available; nothing needs a version check.
- **Barrel files are a bundler and cycle concern, not a universal ban.** The quoted "75% faster builds" is one Atlassian result on a very large frontend, not a property of `index.ts`. Judge by what the re-export pulls in.
- **TypeScript 6.0 is the open upgrade; 7.0 is ceilinged.** 7.0 waits on typescript-eslint's peer range and a dual-compiler alias for svelte-check — the ceilings are tooling, not code. [versions.md](references/versions.md) has both.

## Related skills

- **svelte-sveltekit** — Svelte 5 / SvelteKit 2 itself, including `.svelte.ts` rune modules, `app.d.ts` ambient types, and the MCP server
- **typescript-design-patterns** — which Gang of Four patterns dissolve into these type features, and which the framework already ships
- **supabase** — generated database types and typing queries against them
- **tailwind-css** — the other half of the lint config in `eslint.config.js`
