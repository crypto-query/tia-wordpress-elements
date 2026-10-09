# Versions and the upgrade path

Which release breaks what, and which move is actually open. `package.json` holds the installed versions; what is cached here is what no file in the repo records.

| Line | Released | Status |
|---|---|---|
| 5.9 | Aug 2025 | what a SvelteKit project runs today |
| 6.0 | 23 Mar 2026 | reachable — the upgrade worth doing |
| 7.0 | 8 Jul 2026 | held off by two ceilings |

## The two ceilings

A **ceiling** is a dependency whose supported range caps the TypeScript you can install. Both must lift before 7.0 is possible, and neither is about your code.

**typescript-eslint** publishes a peer range of `>=4.8.4 <6.1.0` and warns when it detects TypeScript 7. The blocker is upstream in ESLint: tsgo's type-information API is async and ESLint's parsers are synchronous, so this is not a version bump the plugin can ship. TypeScript 6.0.x sits inside the range.

**svelte-check** needs both compilers installed at once, because `svelte2tsx` uses the JS compiler API that 7.0 dropped and 7.1 restores. The documented setup is an npm alias:

```sh
bun add -d typescript@~6 @typescript/native@npm:typescript@7
```

`--tsgo` then selects the native compiler (svelte-check 4.4.0), or `--tsgo-experimental-api` (4.7.0); 4.7.4 fixed TypeScript 7 stable under that alias. Compare against the installed svelte-check before assuming any of those flags exist.

## What TypeScript 6.0 changes

6.0 is a bridge release: the same JS compiler, with deprecations aligned to what 7.0 removes outright. The deprecations arrive as **errors**, not warnings — TS5107 for a deprecated *value* (`target=ES5`), TS5101 for a deprecated *option* (`outFile`), each reading "will stop functioning in TypeScript 7". `"ignoreDeprecations": "6.0"` silences them and buys time; it does nothing in 7.0, where the options are gone.

Defaults that flip:

| Option | Was | Now | If it catches you |
|---|---|---|---|
| `strict` | `false` | `true` | TS7006 on an implicit `any` |
| `types` | every `@types/*` in scope | `[]` | TS2591 on a global that used to resolve |
| `noUncheckedSideEffectImports` | `false` | `true` | TS2882 on an unresolved bare import |
| `module` | `commonjs` | `esnext` | nothing — it unblocks `import.meta`, a TS1343 in 5.9 |
| `target` | `es5` | `es2025` | nothing — it widens `lib`, so no more TS2550 on `Object.entries` |
| `rootDir` | inferred | the config's directory | emit layout only |
| `libReplacement` | `true` | `false` | `@typescript/lib-*` overrides stop applying |

The first five rows were checked against 6.0.3 with an otherwise-empty config; `rootDir` and `libReplacement` come from the release notes. Only the top three can break you — the next two are permissive.

Removed or deprecated: `target: "es5"`, `downlevelIteration`, `moduleResolution: "node"` (node10) and `"classic"`, `module: "amd" | "umd" | "system" | "none"`, `baseUrl` as a resolution root, `outFile`, `esModuleInterop: false`, `allowSyntheticDefaultImports: false`, `alwaysStrict: false`, the `module` keyword for namespaces, and `assert` on import attributes (use `with`).

New: `--stableTypeOrdering`, matching 7.0's deterministic ordering at roughly 25% extra checking cost. Useful to flush out order-dependent inference before migrating; not something to leave on. It is absent from `tsc --help` but accepted in `tsconfig.json`.

Also new and easy to trip over: naming files on the command line while a `tsconfig.json` exists is **TS5112** in both 6.0 and 7.0, where 5.9 silently ignored the config. Reach for `-p`, or `--ignoreConfig` when you really mean one file.

### What to check before bumping

A SvelteKit config that already sets `strict`, `module` / `target: "esnext"`, `moduleResolution: "bundler"`, and `esModuleInterop: true` matches every flipped default and uses none of the removed options, so the jump is mostly free. The one that bites:

**`types` defaults to `[]`.** Neither the root `tsconfig.json` nor the generated `.svelte-kit/tsconfig.json` sets it, so ambient `@types/*` globals stop being auto-included. Anything imported by module specifier still resolves its own types; it is the *globals* that vanish. List them explicitly — `"types": ["bun"]` or whichever packages supply globals you rely on — and the error to expect if you miss one is TS2591.

## The upgrade recipe

1. `bun add -d typescript@~6 svelte-check@latest @typescript-eslint/eslint-plugin@latest @typescript-eslint/parser@latest`
2. Run the check script — read the deprecation errors before silencing anything.
3. Fix what it reports. Set `"types"` explicitly if ambient globals go missing.
4. Run lint — typescript-eslint accepts 6.0.x, so this should stay green.
5. Only if step 3 is too large to land at once: `"ignoreDeprecations": "6.0"`, with a note that it must come out before 7.0.

Stop there. 7.0 needs both ceilings lifted plus the dual-compiler alias, and the payoff is compile speed — a small project will not feel an 8–12× checking speedup.

## Speed levers available today

`svelte-check --incremental` (4.4.0) reuses a `.tsbuildinfo` between runs. `--tsgo` sits behind the same machinery and additionally needs `@typescript/native-preview` installed, which is a new dependency and so needs approval.
