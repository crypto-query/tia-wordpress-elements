---
name: storybook-svelte
description: Storybook 10 with Svelte 5 and SvelteKit — Svelte CSF (defineMeta, Story, template snippets), $app/* mocking, play functions and the Vitest addon. Use when installing or upgrading Storybook, writing or fixing .stories.svelte files, mocking SvelteKit modules in a story, or running story tests.
version: 2.1.0
scope: integration
distribution: author-only
---

# Storybook + Svelte

Verified against **storybook 10.5.7**, **@storybook/sveltekit 10.5.7** and **@storybook/addon-svelte-csf 5.1.2**, installed by `create-storybook@latest` into a fresh SvelteKit 2.70 / Svelte 5.56 / Vite 8 / TypeScript 6 scaffold, then built, type-checked, and exercised in both places a story runs: `storybook dev` in a real browser, and `@storybook/addon-vitest` with Vitest 4.1 in Playwright Chromium.

Two story formats coexist in one project. **Svelte CSF** (`.stories.svelte`, the `@storybook/addon-svelte-csf` addon) is what the CLI scaffolds and what snippets and composed components want; **CSF 3** (`.stories.ts`) is the portable format the rest of Storybook is built around. Svelte CSF is the default choice and has real holes — [svelte-csf.md](references/svelte-csf.md) lists them, and every one is a reason to write that single story in CSF 3 instead.

Svelte sits in Storybook's **community framework** tier. Essentials, a11y, autodocs, doc blocks and the Vitest addon all work; CSF Next (`definePreview` / `preview.meta` factories), manifests and the MCP docs toolset are React-first and not available here in 10.5.

## Where to look

| File | Read it for |
|---|---|
| [setup.md](references/setup.md) | what the CLI installs and writes, framework adapters, Svelte compiler options, version floors, the ESM-only rules, `@types/node`, upgrades, global CSS |
| [svelte-csf.md](references/svelte-csf.md) | `defineMeta`, the five ways to fill a `Story`, `template` snippets, typing, `exportName`, the legacy `Template` flag, what the format cannot do |
| [stories.md](references/stories.md) | args, argTypes, parameters, decorators, tags, autodocs, globals, actions, source snippets — in both formats |
| [sveltekit.md](references/sveltekit.md) | which `$app/*` modules work, the full `parameters.sveltekit_experimental` API, link handling, mocking everything else |
| [testing.md](references/testing.md) | play functions, `storybook/test`, `sb.mock`, the Vitest addon wiring, tag filters, a11y test modes, CI, portable stories |
| [mcp.md](references/mcp.md) | `@storybook/addon-mcp` on a Svelte project — the five tools that do work, the three that don't, and how to wire it up |
| [troubleshooting.md](references/troubleshooting.md) | the exact errors and log lines this stack produces, and what each one means |

## Working rules

**Fetch the docs page as markdown instead of recalling an API.** Append `.md` to any docs URL and pass `?renderer=svelte&language=ts` — `https://storybook.js.org/docs/writing-stories/play-function.md?renderer=svelte&language=ts` returns the Svelte-flavoured page with its snippets intact. The page index is `https://storybook.js.org/llms.txt`; older versions answer at `/docs/9/<path>.md`. Skip `llms-full.txt` — it is ~1.6 MB and many of its Svelte blocks are truncated mid-snippet, with the `<Story>` tags silently dropped. For the Svelte CSF addon itself the authority is its repo README, not the docs site.

**Let the CLI own installation and upgrades.** `npm create storybook@latest` detects SvelteKit vs Svelte+Vite, picks the framework package, installs the addon set and writes a working Vitest project. `storybook add <addon>`, `storybook upgrade` and `storybook doctor` cover the rest; automigrations do the mechanical parts of a major bump. Hand-assembling `.storybook/` reproduces work the CLI does correctly — [setup.md](references/setup.md) records exactly what it writes so you can audit rather than rebuild it.

**Put mocks where the format expects them.** `sveltekit_experimental` is a **parameter** on a meta or a story, never a key in `.storybook/main.ts`. Everything that is not a `$app/*` module — a `$lib` helper, a package, a data loader — is `sb.mock(import('...'))` in `.storybook/preview.ts`, which is the only place mocks may be registered.

**Prove a story in both environments.** Every story is already a render test, and `play` turns it into an interaction test: `vitest --project=storybook` runs them headless, the sidebar runs them per story. The two disagree in both directions — a bare-component decorator wraps in `storybook dev` and silently drops the wrapper *and* the args under the runner, while `setContext` in a decorator passes under the runner and throws in the browser. A green test run and a correct-looking canvas are two separate facts; anything structural about how a story renders needs both.

**Storybook's agent tooling is half-available here.** `@storybook/addon-mcp` installs and serves its dev and testing tools on a Svelte project — story-writing instructions, previews, changed stories, and `run-story-tests`. The docs toolset needs manifests, which are React-only, so `get-documentation` and friends are absent; `storybook ai setup` and the official plugin's setup skill (`storybookjs/mcp`, marketplace `storybook@storybook`) also gate on React + Vite. [mcp.md](references/mcp.md) has the verified tool list.

## Corrections to common assumptions

Training data is thick with Storybook 6–8 and with `addon-svelte-csf` v4, a different API on Svelte 4. Ordered by how often each one bites:

- **`defineMeta` lives in `<script module>`.** There is no `Meta`, `Template` or `storiesOf` component any more; calling `defineMeta` from an instance `<script>` fails. The v4 `<Template>` API survives only behind the addon's `legacyTemplate: true` option, which is a migration crutch, not a target.
- **Test utilities come from `storybook/test`,** not `@storybook/test`. Storybook 9 folded the packages into core: `@storybook/addon-essentials`, `-interactions`, `-actions`, `-controls`, `-viewport` no longer exist; actions are `storybook/actions`, viewport `storybook/viewport`, theming `storybook/theming`.
- **`play` receives `canvas` and `userEvent` on its context** — `play={async ({ args, canvas, userEvent }) => …}`. `within(canvasElement)` still works, but `within(canvas)` throws: `canvas` is a query object, not an element.
- **A Svelte decorator must return `{ Component }`.** `decorators: [() => Wrapper]`, the bare form the docs show first, works in `storybook dev` but under `@storybook/addon-vitest` renders the story's own component with no props at all — the wrapper disappears and every arg reverts to its default. `() => ({ Component: Wrapper, props })` behaves the same in both. Types only half-help: CSF 3 rejects the bare form and accepts the object form, while in Svelte CSF `svelte-check` rejects a wrapper either way.
- **`setContext` inside a decorator throws `set_context_after_init`** in the browser, though the docs show that pattern; it passes under the runner. Provide context from a wrapper component the story renders instead.
- **`Story` ignores `render`.** Custom rendering is a `{#snippet template(args, context)}`, passed as `{template}`, or hoisted to the meta as `render: template`. Passing a `render` function to `<Story>` has no effect.
- **Events are props.** Svelte 5 spies are `args: { onclick: fn() }` / `{ onsubmit: fn() }`; there is no `on:click` arg and no `createEventDispatcher` bridging.
- **`tags: ['autodocs']`, not `parameters.docs.autodocs`;** `initialGlobals`, not `globals`, in `.storybook/preview.ts`. Tags are also how the Vitest addon includes, excludes and skips stories.
- **CSF Next is not available for Svelte.** `defineMain`, `definePreview`, `preview.meta`, `meta.story` and the `.test` method are React-first; the Svelte-flavoured CSF docs do not mention them at all in 10.5. Write CSF 3 objects or Svelte CSF, and expect this to move — upstream plans to make factories the default in Storybook 11.
- **`StoryContext<typeof Component>` is a type error** inside a `template` snippet, though the addon README shows it. The context is parameterised by the args type: `{#snippet template(args: Args, context: StoryContext<Args>)}`.
- **The `<!-- @component -->` comment never reaches autodocs.** Svelte docgen emits per-prop descriptions only — there is no component-description path in the framework — so a component blurb has to be `parameters.docs.description.component` or an MDX page. Prop JSDoc *does* land, including on a `Props` interface.
- **`composeStories` fails silently on Svelte CSF.** A `.stories.svelte` module composes to `{}`, so a portable-stories test built on one runs nothing and reports success. CSF 3 composes, but its `sveltekit_experimental` mocks did not follow it out of the Vitest addon.
- **`mount()` inside `play` throws in Svelte CSF** (`SB_PREVIEW_API_0012 MountMustBeDestructuredError`), because the addon wraps the play function and the destructuring check cannot see through it. Write that story in CSF 3.
- **Top-level `await` in a component needs `experimental.async`,** set wherever the Vite config passes Svelte compiler options — `svelte.config.js` is ignored whenever `sveltekit()` or `svelte()` already receives inline options, and Storybook, the runner and the app all follow that same rule.
- **`@storybook/svelte-vite` and `@storybook/sveltekit` are frameworks; `@storybook/svelte` is the renderer.** Import `Meta` / `StoryObj` / `Preview` types from the framework package. `svelteOptions` in `main.ts` was removed years ago.
- **No `.storybook/vitest.setup.ts` is required.** The plugin injects its own setup file and adds the project-annotations one whenever your `setupFiles` do not already call `setProjectAnnotations` — so a preview-level parameter reaches the runner with no setup file at all, even though the docs still show `setupFiles: ['./.storybook/vitest.setup.ts']`. Keep one only for per-test setup beyond `preview.ts`.
- **The Svelte CSF addon's published peer range stops at Storybook `^10.4.0-0`,** so installing it alongside 10.5.x warns (and fails under strict peer resolution). The addon works. The broadened range has sat merged-but-unpublished upstream since July 2026 — override or ignore the warning rather than downgrading.

## Related skills

- **svelte-sveltekit** — Svelte 5 and SvelteKit themselves: runes, snippets, `$app/*`, and the Svelte MCP server plus `svelte-autofixer`
- **playwright-cli** — driving the running Storybook in a real browser when a story needs visual confirmation
- **typescript** — typing `Args`, `ComponentProps` and the story objects
- **tailwind-css** — the global stylesheet that `.storybook/preview.ts` has to import for stories to look like the app
