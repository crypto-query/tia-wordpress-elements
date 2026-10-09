# Setup, packages and upgrades

Everything below is what `create-storybook@latest` (10.5.7) actually produced in a fresh SvelteKit scaffold, plus the version constraints declared by the packages themselves.

## Installing

```bash
npm create storybook@latest        # pnpm create storybook@latest / yarn create storybook
```

It detects the project, picks `@storybook/sveltekit` or `@storybook/svelte-vite`, installs the addon set, writes `.storybook/`, wires a Vitest project, adds `storybook` / `build-storybook` scripts, and offers to download the Playwright Chromium binary. Two prompts matter: the onboarding tour (skip it for a minimal setup) and the feature set — `--features docs test a11y` picks the recommended set unattended, `--yes` clears the rest.

`npx sv add storybook` is a thin wrapper: it runs `create-storybook@latest --skip-install --no-dev` through the Svelte CLI and then adds **`@types/node`**. That dependency is not cosmetic — see [the type-check gap](#the-type-check-gap) below.

Adding anything later goes through the CLI too: `npx storybook add @storybook/addon-a11y`, `npx storybook add @storybook/addon-vitest`, `npx storybook add @storybook/addon-mcp`. The `add` command installs the package *and* registers it in `main.ts`.

## What lands in the project

```jsonc
// package.json devDependencies, as written by the CLI
"storybook": "^10.5.7",
"@storybook/sveltekit": "^10.5.7",     // or @storybook/svelte-vite
"@storybook/addon-svelte-csf": "latest",
"@storybook/addon-vitest": "^10.5.7",
"@storybook/addon-a11y": "^10.5.7",
"@storybook/addon-docs": "^10.5.7",
"@chromatic-com/storybook": "latest",
"vitest": "latest", "playwright": "latest",
"@vitest/browser-playwright": "latest", "@vitest/coverage-v8": "latest"
```

```ts
// .storybook/main.ts — ESM only, no require, no CJS presets
import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|ts|svelte)'],
  addons: [
    '@storybook/addon-svelte-csf',
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
  ],
  framework: '@storybook/sveltekit',
};
export default config;
```

The `svelte` extension in the `stories` glob is what makes `.stories.svelte` files indexable — a manual install that copies a React glob finds no stories and reports an empty sidebar.

```ts
// .storybook/preview.ts
import type { Preview } from '@storybook/sveltekit';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },   // 'todo' | 'error' | 'off'
  },
};
export default preview;
```

This is also where global CSS goes — `import '../src/app.css'` — plus `initialGlobals`, global `decorators`, `tags`, and every `sb.mock()` registration.

The Vitest project is written into the **existing `vite.config.ts`** for SvelteKit (not a separate `vitest.config.ts`), as a `test.projects` entry: `storybookTest({ configDir })` from `@storybook/addon-vitest/vitest-plugin`, browser mode on, `provider: playwright({})` from `@vitest/browser-playwright`. [testing.md](testing.md) covers it. A `test` key in `vite.config.ts` merges into every Vitest config that extends that file, so a project that also has its own unit tests should move `test` into a `vitest.config.ts` — that is Storybook's own answer to isolating story tests from the rest.

## Framework packages

| Package | Use when | Peer requirements |
|---|---|---|
| `@storybook/sveltekit` | any SvelteKit app | `svelte ^5`, `vite ^5–^8` |
| `@storybook/svelte-vite` | Svelte without Kit | `svelte ^5`, `vite ^5–^8`, `@sveltejs/vite-plugin-svelte ^2–^7` |

`@storybook/svelte` is the *renderer* underneath both; you never name it in `framework`, and story types come from the framework package. Only `@storybook/sveltekit` mocks `$app/*` and handles `<a href>` clicks — a SvelteKit app pointed at `svelte-vite` fails on the first Kit import.

Framework options, both packages:

```ts
framework: {
  name: '@storybook/sveltekit',
  options: {
    docgen: true,        // default; false skips prop extraction and speeds up builds
    builder: { /* Vite builder options */ },
  },
}
```

Turning `docgen` off kills automatic argTypes, so Controls and autodocs go blank unless `argTypes` are written by hand.

## Svelte compiler options

Stories are compiled by the same `vite-plugin-svelte` the app uses, and **`svelte.config.js` is ignored whenever the Vite config already passes options to `sveltekit()` or `svelte()`** — the plugin says so in the dev log. Recent SvelteKit scaffolds do exactly that (they set `compilerOptions.runes` inline and ship no `svelte.config.js`), so compiler options for stories belong in `vite.config.ts`:

```ts
plugins: [
  sveltekit({
    compilerOptions: {
      // whatever the scaffold already wrote here, plus:
      experimental: { async: true },   // components with top-level `await`
    },
    adapter: adapter(),
  }),
],
```

A component using top-level `await` fails to compile without `experimental.async`, in `storybook dev` and under the Vitest runner alike; the same flag in a `svelte.config.js` has no effect on either while the inline options exist. With the flag on, an async component renders in both, and the story needs no `<svelte:boundary>` of its own — a `play` function reaches the resolved DOM through `findBy*`.

## Version floors

Storybook 10 requires **Node 20.19+ or 22.12+**, npm 10+ / pnpm 9+ / yarn 4+, TypeScript 4.9+, Vite 5+, Vitest 3+, and **Svelte 5+** (Storybook 9 dropped Svelte 4). The manager UI targets Chrome 131+, Firefox 136+, Safari 18.3+.

Storybook 10 is ESM-only: `.storybook/main.ts` and every preset must be valid ESM. A CommonJS `main.cjs`, a `require()` inside a preset, or an addon that only ships CJS will fail to load.

`@storybook/addon-svelte-csf` needs Svelte 5, Vite 5+ and `@sveltejs/vite-plugin-svelte` 4+, and **does not support Webpack at all** since v5. Its published peer range (5.1.2, March 2026) stops at `storybook ^10.4.0-0`, so pairing it with 10.5.x produces a peer warning — npm and strict pnpm complain, the addon works. The widened range was merged upstream in July 2026 and is still unreleased, so check whether a newer 5.x exists before working around the warning.

## The type-check gap

`create-storybook` writes `import path from 'node:path'`, `import { fileURLToPath } from 'node:url'` and a `__dirname` shim into `vite.config.ts`. Without `@types/node` those four lines fail `svelte-check` and `tsc`:

```
ERROR "vite.config.ts" "Cannot find name 'node:path'. … Try `npm i --save-dev @types/node`"
ERROR "vite.config.ts" "Cannot find name '__dirname'. Did you mean 'dirname'?"
```

Install `@types/node` (this is exactly what `sv add storybook` does for you). Vite 8 additionally warns that `__dirname` is unsupported by the native config loader; replacing the shim with `import.meta.dirname` silences it and still needs `@types/node` for the type.

## Upgrading

```bash
npx storybook@latest upgrade   # bumps every Storybook package, then runs automigrations
npx storybook doctor           # duplicate deps, incompatible addons, version mismatches
```

- **8 → 9 first, then 9 → 10.** The 9 jump is where packages consolidated (`@storybook/test` → `storybook/test`, essentials into core, `experimental-addon-test` → `@storybook/addon-vitest`) and where Svelte 4 support ended.
- **9 → 10** is a maintenance release: ESM-only distribution, the Node bump, CSF Next in preview. Most projects need nothing beyond the automigrations.
- **`test-runner` → `@storybook/addon-vitest`** is the one optional migration worth taking on a Vite project; the test-runner is the Webpack-era fallback.
- Debugging a broken upgrade: `storybook build` gives more legible errors than `storybook dev`, and removing every addon outside the `@storybook` namespace isolates a lagging community addon fastest.

## Publishing

`storybook build` emits a static site to `storybook-static/`. Chromatic (`@chromatic-com/storybook`, installed by default) hosts it, runs visual tests, and — for React projects — publishes the MCP docs server alongside.
