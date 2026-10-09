# Troubleshooting

The failures this stack actually produces, keyed by what you see.

## `SB_PREVIEW_API_0012 (MountMustBeDestructuredError)`

Raised by any `play={async ({ mount }) => …}` in a **Svelte CSF** file, even though the destructuring is correct. The addon wraps every play function in a delegating closure, and Storybook's source-level check for `{ mount }` sees the wrapper instead. The error text blames transpilation targets, which is a red herring here. Move that one story to a `.stories.ts` CSF 3 file, where `mount` works.

## `SB_SVELTE_CSF_PARSER_EXTRACT_SVELTE_0009 (IndexerParseError)`

The Svelte CSF indexer could not parse a `.stories.svelte` file. Usual causes: `defineMeta` called outside `<script module>`, a `<Story>` without `name` or `exportName`, or v4 `<Meta>` / `<Template>` syntax without `legacyTemplate: true`. The message names the file; the story never reaches the sidebar.

## `no Svelte config found … using default configuration`, repeated per story file

Recent SvelteKit scaffolds keep their configuration in the `sveltekit()` plugin options in `vite.config.ts` and ship no `svelte.config.js`, and the lookup runs once per stories file. Harmless on its own — but it means compiler options reach stories only through those inline plugin options. Adding a `svelte.config.js` does not help and does not silence it either: the plugin then logs `svelte.config.js is ignored when options are passed via your Vite config` and keeps ignoring the file. Compiler options go in `vite.config.ts` — see [setup.md](setup.md#svelte-compiler-options).

## `Failed to fetch dynamically imported module: …stories.ts`

The story module never compiled. Under the Vitest runner this appears as a failed suite with zero tests; in the browser Storybook shows its generic "configuration issue" panel with the same sentence. The real error is above it in the terminal, printed by Vite — most often a Svelte compile error, such as the one about `await` needing the `experimental.async` compiler option. Read the Vite output, not the Storybook panel.

In CI with no compile error in sight, the same message means resource exhaustion instead: `test.isolate: false` or `--shard=i/n`.

## `Vitest failed to find the current suite`

Vite optimised a dependency in the middle of the run — look for `✨ new dependencies optimized:` just before the error. Add those specifiers to `optimizeDeps.include` on the Storybook test project, copied verbatim from the imports that pulled them in. An entry that cannot resolve aborts the whole run before any test executes.

## `set_context_after_init`

`setContext` ran outside a component's initialisation — almost always a decorator that calls it in its own function body, as the Svelte docs show. It throws in `storybook dev` and passes under the runner. Move the call into the wrapper component ([stories.md](stories.md#decorators)).

## Peer dependency warnings for `@storybook/addon-svelte-csf`

Its published range (5.1.2) tops out at `storybook ^10.4.0-0`, so 10.5.x warns on npm and fails strict pnpm resolution. The compatibility fix is merged upstream and unpublished. The addon works with 10.5 — install with the resolution overridden, or pin the warning away, rather than downgrading Storybook.

## `svelte-check` / `tsc` fails on `vite.config.ts`

```
Cannot find name 'node:path'. … Try `npm i --save-dev @types/node`
Cannot find name '__dirname'. Did you mean 'dirname'?
```

`create-storybook` writes Node built-in imports and a `__dirname` shim into the Vite config without adding `@types/node`. Install it. (`npx sv add storybook` does this for you; the Storybook CLI does not.) Vite 8 also warns that `__dirname` is unsupported by its native config loader — swap in `import.meta.dirname`, which still needs `@types/node` for its type.

## Type error on a `template` snippet's context

```
Type 'StoryContext<Args>' is not assignable to type 'StoryContext<Component<…>>'
```

`StoryContext` takes the **args** type: `context: StoryContext<Args>`. The addon README's `StoryContext<typeof MyComponent>` does not compile.

## `svelte-check` rejects a decorator

```
Type 'Component<…>' has no properties in common with type 'SvelteStoryResult<any, any, string>'
```

A bare component was returned. Return `{ Component: Wrapper }` ([stories.md](stories.md#decorators)).

```
Property 'children' is missing in type '$$ComponentProps' but required in type '$$ComponentProps'
```

A correctly written decorator in a `.stories.svelte` file: `defineMeta` types the decorator's `Component` against the story component's props, which no wrapper satisfies. The story runs fine in both environments; typing the wrapper does not silence it.

## The sidebar is empty, or `.stories.svelte` files are ignored

`stories` in `.storybook/main.ts` must include the `svelte` extension — `'../src/**/*.stories.@(js|ts|svelte)'` — and `@storybook/addon-svelte-csf` must be in `addons`. A glob copied from a React project matches nothing here.

## A `$app/*` import explodes

Either the framework is `@storybook/svelte-vite` on a SvelteKit project (only `@storybook/sveltekit` provides the mocks), or the module is server-only (`$env/*/private`, `$service-worker`) and cannot render client-side at all. See [sveltekit.md](sveltekit.md).

## `sveltekit_experimental` seems to do nothing

It is a **parameter**, on a meta or a story. In `.storybook/main.ts` it is inert. `$app/state` mocks additionally need SvelteKit 2.12+; components on the older store API need the `stores` key instead of `state`.

## Controls are empty, or props show no descriptions

`docgen` may be off in the framework options, in which case argTypes must be written by hand. Otherwise: docgen reads prop-level JSDoc, including on a `Props` interface, but emits **no component description** — the `<!-- @component -->` comment is dropped, so a component blurb has to go in `parameters.docs.description.component`.

Controls are also inert in a story using `asChild`, which renders its children instead of the component and never passes args.

## "Save from Controls" is missing

Editing args in the UI and saving them back as a new story is CSF-3-only; the Svelte CSF addon does not support it.

## A `composeStories` test passes without running anything

Portable stories accept CSF 3 exports only, and a `.stories.svelte` module composes to `{}` with no error — every story you meant to test is simply absent. Use the Vitest addon, which is built on portable stories and does handle Svelte CSF, or write that story as `.stories.ts`. Kit mocks come with their own caveat there: [testing.md](testing.md#portable-stories).

## A decorator does not wrap, and args stop arriving — but only under the runner

The bare `decorators: [() => Wrapper]` form. In `storybook dev` it wraps correctly; under `@storybook/addon-vitest` the wrapper's markup is absent and the component renders with its **default props** — a story with `args={{ label: 'Zed' }}` shows the default label — in both story formats. Return `{ Component: Wrapper }` instead, which behaves identically in both environments ([stories.md](stories.md#decorators)).

## A story behaves differently in the browser and under Vitest

Both directions happen, so neither environment is the authority on its own. Check that `.storybook/preview.ts` carries the decorator, parameter or `sb.mock` the story depends on, since that is the file the runner applies. The runner also uses Playwright Chromium rather than the dev browser, so animation timing and fonts differ — prefer `findBy*` queries over fixed waits. The two known structural divergences are decorator return values and `setContext`, both above.

## Storybook 10 refuses to start after an upgrade

ESM-only: `.storybook/main.ts` and every preset must be valid ESM, and Node must be 20.19+ or 22.12+. Run `npx storybook doctor` for duplicate or mismatched packages, try `storybook build` for a more legible stack than `storybook dev`, and temporarily drop non-`@storybook` addons to find one that has not caught up.

## Chunk-size warnings during `storybook build`

Expected. The manager and docs bundles are large; the warning is Vite's default 500 kB threshold, not a fault in the project.
