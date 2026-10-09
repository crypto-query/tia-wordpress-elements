# Args, parameters, decorators, tags, docs

The story surface both formats share. Svelte CSF passes these as props on `<Story>` or keys in `defineMeta`; CSF 3 puts them on the story object or the default export. Every one of them merges **global → meta → story**, with the narrower level winning.

## CSF 3, for the stories Svelte CSF cannot express

```ts
// Button.stories.ts
import type { Meta, StoryObj } from '@storybook/sveltekit';   // or @storybook/svelte-vite
import { fn, expect } from 'storybook/test';
import Button from './Button.svelte';

const meta = {
  component: Button,
  tags: ['autodocs'],
  args: { onclick: fn() },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'primary', label: 'Save' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(args.onclick).toHaveBeenCalled();
  },
};
```

`satisfies Meta<typeof Component>` is what makes `args` type-check against the component's props. Story names come from the export name unless a `name` property overrides them.

## Args

Args are props. In Svelte 5 that includes event handlers — `onclick`, `oninput`, `onsubmit` — so a spy is `args: { onclick: fn() }` and never an `on:click` entry.

Args compose: spread another story's args (`args: { ...Primary.args, label: 'Other' }`), or import a child component's stories into a parent's file to reuse their data. In Svelte CSF, children are markup between the tags rather than an arg.

## argTypes

Automatically inferred from the component when `docgen` is on: prop names, types, defaults, and JSDoc descriptions written on the props or on a `Props` interface. Write them by hand to shape Controls or document what docgen can't see:

```ts
argTypes: {
  size:  { control: 'select', options: ['sm', 'md', 'lg'] },
  color: { control: 'color' },
  label: { control: 'text', description: 'Visible button text' },
  onclick: { action: 'clicked' },
}
```

## Parameters

Static metadata addons read. The ones that come up: `layout: 'centered' | 'fullscreen' | 'padded'`, `backgrounds`, `viewport`, `a11y`, `docs`, `test`, `sveltekit_experimental` ([sveltekit.md](sveltekit.md)), `codePanel`.

Component descriptions are a parameter, because the `<!-- @component -->` comment never reaches docgen:

```ts
parameters: { docs: { description: { component: 'Primary call to action.' } } }
```

## Decorators

A Svelte decorator returns `{ Component, props }`. The renderer mounts that component and passes the story into it as children. Global decorators live in `.storybook/preview.ts`, per-file ones on the meta, per-story ones on the story.

```svelte
<!-- MarginDecorator.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>
<div style="margin: 3rem">{@render children()}</div>
```

```ts
decorators: [() => ({ Component: MarginDecorator })]
decorators: [(story, { parameters }) => ({
  Component: MarginDecorator,
  props: { size: parameters.smallMargin ? 'small' : 'medium' },
})]
```

**Always the object form.** The bare `decorators: [() => MarginDecorator]` that the docs show first renders correctly in `storybook dev` and breaks under `@storybook/addon-vitest`, in both story formats: the wrapper is absent from the canvas *and* the component renders with its default props, so every arg silently disappears. The renderer's `prepareStory` treats a value with no own enumerable keys — which is what a compiled Svelte component is — as "no decorator returned", and falls back to `{ Component: context.component }` with no props at all.

Type-checking catches half of that. In `.stories.ts` the bare form is an error (`Type 'Component<…>' has no properties in common with type 'SvelteStoryResult<any, any, string>'`) and the object form is clean. In `.stories.svelte`, `defineMeta` parameterises `SvelteStoryResult` with the story component's own props, so **any** wrapper fails `svelte-check` — `Property 'children' is missing in type '$$ComponentProps'` — however it is written, while running correctly in both environments. Typing the wrapper's props does not help.

**Provide context from a wrapper, not from the decorator body.** `setContext` called inside the decorator function — the pattern the Svelte docs show — throws `set_context_after_init` in the browser and takes the whole story down, while passing under the runner. Put the `setContext` call in the wrapper component instead, where it runs during that component's initialisation:

```svelte
<!-- ThemeDecorator.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';
  let { children } = $props();
  setContext('theme', 'dark');
</script>
{@render children()}
```

Wrapping inside a `template` snippet (Svelte CSF) or a `render` function (CSF 3) avoids the decorator pipeline altogether, reads the same to Controls, and stays the simplest option for a one-file layout wrapper.

## Tags

Tags organise, filter and test. `tags` on the preview applies globally, on the meta to a file, on a story to itself; a leading `!` removes an inherited one.

```ts
tags: ['autodocs', 'stable']      // meta
tags: ['!stable', 'experimental'] // story: drops stable, adds experimental
```

Built-in tags: `autodocs` generates the docs page, `dev` shows a story in the sidebar, `test` includes it in test runs (both are implicit unless removed with `!dev` / `!test`), `manifest` controls inclusion in the AI manifests (React-only today), `test-fn` marks CSF-factory tests. Custom tags are free-form and are what the Vitest addon's `include` / `exclude` / `skip` filters match on.

## Autodocs and MDX

`tags: ['autodocs']` builds a docs page per component from the meta, argTypes and stories. Global opt-in is `tags: ['autodocs']` in `.storybook/preview.ts` — the old `docs: { autodocs: true }` in `main.ts` is gone.

For prose beyond that, write an `.mdx` file next to the stories and pull the real stories into it with the doc blocks — `Meta`, `Story`, `Canvas`, `Controls`, `ArgTypes`, `Source`, `Primary`, `Stories`, `ColorPalette`, `IconGallery`, `Typeset`. All of them work on Svelte. `codePanel: true` adds a source panel outside the docs page; the Svelte CSF addon supplies the snippet it shows.

## Globals and toolbars

`initialGlobals` in `.storybook/preview.ts` sets the starting value of a global (theme, locale, a11y manual mode); `globals` on a meta or story pins it for that scope. The toolbar control is declared in `globalTypes`. In Storybook 9+ the preview key is `initialGlobals` — a plain `globals` key at the preview level is the pre-9 spelling.

## Actions

Args matching `parameters.actions.argTypesRegex` — or, better, explicit `fn()` args — log to the Actions panel automatically. `fn()` from `storybook/test` is preferable to a regex because the same spy is then assertable in `play`.

## Play functions

See [testing.md](testing.md); the short version is that `play` receives `{ args, canvas, canvasElement, userEvent, parameters, globals, step, mount }` and every `userEvent` and `expect` call must be awaited so the Interactions panel can step through them.
