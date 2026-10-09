# Svelte CSF

`@storybook/addon-svelte-csf` 5.x. Files must end in `.stories.svelte`. The addon's README is the authority on this API; the docs site paraphrases it and its Svelte snippets are the ones the markdown pipeline mangles most.

## The meta

```svelte
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Button from './Button.svelte';
  import { fn } from 'storybook/test';

  const { Story } = defineMeta({
    component: Button,
    tags: ['autodocs'],
    args: { onclick: fn() },
    argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] } },
    parameters: { layout: 'centered' },
  });
</script>
```

`<script module>` is not optional — `defineMeta` called from an instance `<script>` fails. It takes everything a CSF 3 default export takes (`component`, `title`, `tags`, `args`, `argTypes`, `parameters`, `decorators`, `globals`, `beforeEach`, `render`) and returns `{ Story }`, which must be destructured. Omit `title` and Storybook derives the sidebar path from the file location.

## Filling a Story

Every `<Story>` needs `name` or `exportName`. All CSF story properties are props on it — `args`, `parameters`, `tags`, `globals`, `play`, `beforeEach` — with `render` the one exception: it is ignored.

**Args only.** Renders `component` from the meta with the args as props.

```svelte
<Story name="Primary" args={{ variant: 'primary', label: 'Save' }} />
```

**Children.** Content between the tags is forwarded to the component as its `children` snippet.

```svelte
<Story name="With text">I am the child of the meta component</Story>
```

**`asChild`.** The children *become* the story; the meta component is not rendered at all. Args and Controls are dead in this mode. A decorator still wraps such a story, and wraps it exactly once — the two compose.

```svelte
<Story name="Composed" asChild>
  <Card><CardBody><Button label="Buy" /></CardBody></Card>
</Story>
```

**Inline `template` snippet.** Composition that still reacts to args and Controls.

```svelte
<Story name="In a card" args={{ variant: 'ghost' }}>
  {#snippet template(args)}
    <Card><Button {...args} /></Card>
  {/snippet}
</Story>
```

**Shared / default `template`.** Declare the snippet once at the top level and pass it as a prop, or hoist it to the meta with `render:` so every story picks it up.

```svelte
<script module lang="ts">
  const { Story } = defineMeta({ component: Button, render: template });
</script>

{#snippet template(args)}
  <Card><Button {...args} /></Card>
{/snippet}

<Story name="Primary" args={{ variant: 'primary' }} />
<Story name="Ghost" args={{ variant: 'ghost' }} />
<Story name="Bare" args={{ variant: 'ghost' }} {template2} />   <!-- overrides the default -->
```

Always spread `{...args}` onto the component inside a template — that spread is what keeps Controls live.

Svelte's own constraint applies to the meta-level `render`: a snippet referenced from `<script module>` may not touch anything declared in the instance `<script>`, directly or through another snippet.

## Story context

The `template` snippet takes an optional second argument — the full story context (`name`, `id`, `args`, `parameters`, `globals`, `loaded`, …).

```svelte
{#snippet template(args, context)}
  <Wrapper theme={context.globals.theme}><Button {...args} /></Wrapper>
{/snippet}
```

## Typing

```svelte
<script module lang="ts">
  import { defineMeta, type StoryContext } from '@storybook/addon-svelte-csf';
  import type { ComponentProps } from 'svelte';
  import Button from './Button.svelte';

  const { Story } = defineMeta({ component: Button });

  type Args = ComponentProps<typeof Button>;
</script>

{#snippet template(args: Args, context: StoryContext<Args>)}
  <Button {...args} />
{/snippet}
```

`StoryContext` is parameterised by the **args type**, not the component type. `StoryContext<typeof Button>` — which the addon README shows — fails type-checking with a long `Component<Component<…>>` mismatch.

When `render` converts primitive args into snippets, the args type comes from the snippet passed to `render`, so declare it explicitly and omit what the component takes as a snippet:

```ts
type Args = Omit<ComponentProps<typeof Card>, 'children' | 'footer'> & {
  children: string;
  footer?: string;
};
```

```svelte
{#snippet template({ children, ...args }: Args)}
  <Card {...args}>
    {children}
    {#snippet footer()}{args.footer}{/snippet}
  </Card>
{/snippet}
```

## Export names

Each `<Story>` compiles to a named export derived from `name`, so `"my story!"` and `"My Story"` collide on `MyStory`. `exportName` fixes the variable explicitly, and is also what other files import when reusing a story.

```svelte
<Story exportName="PrimaryLoud" name="Primary!" />
```

## What Svelte CSF cannot do

Each of these is a reason to write that one story as CSF 3 in a `.stories.ts` file — the two formats sit side by side in the same project and the same sidebar.

- **`mount()` in `play`** throws `SB_PREVIEW_API_0012 (MountMustBeDestructuredError)`: the addon wraps the play function, so Storybook's destructuring detection never sees `{ mount }`.
- **Portable stories** — `composeStories` returns `{}` for a `.stories.svelte` module, silently, so a test built on one passes without running anything.
- **Save from Controls** — editing args in the UI and saving a new story is CSF-3-only.
- **`render` as a function** on a story; only snippets render.
- **args as children** — a `children` arg does nothing; pass children between the tags.

## Legacy v4 API

`<Meta>`, `<Template>` and slot-based stories survive only behind a feature flag:

```ts
addons: [{ name: '@storybook/addon-svelte-csf', options: { legacyTemplate: true } }],
```

It adds a transformation pass, slows the build, is explicitly not bullet-proof, and is expected to disappear in the next major. Use it to keep an old file compiling while migrating, not as a destination. The migration itself: `Meta` → `defineMeta` in `<script module>`; `Template` → children, `asChild`, or a `template` snippet; `autodocs` property → `tags: ['autodocs']`; slots → snippets.
