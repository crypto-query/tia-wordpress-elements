# Styling generated components

What belongs in a `class` attribute, and what belongs to the component. The token layer under all of this is [theming.md](theming.md).

## The order to reach in

1. **A built-in variant** — `variant="outline"`, `size="sm"`. Read the component's `tv()` block for the keys it actually has.
2. **A semantic token** — `bg-primary`, `text-muted-foreground`, `border-border`. These follow the theme into dark mode and into every restyle.
3. **`class` for layout** — `mx-auto`, `max-w-md`, `mt-4`, `grid-cols-3`. `cn()` merges it over the component's own classes, so it wins conflicts.
4. **A new variant in the component source** — a key added to its `tv()` block, for a treatment used repeatedly. `update` overwrites this.

```svelte
<Button variant="outline" size="sm">Click me</Button>
<Card.Root class="mx-auto max-w-md">…</Card.Root>
```

Reaching past a variant to reproduce it by hand — `class="border-input hover:bg-accent border bg-transparent"` for what `variant="outline"` already does — is the change that silently stops tracking the theme.

## Colors come from tokens

Use `bg-primary` / `text-primary-foreground`, `text-muted-foreground`, `text-destructive`. Raw palette classes (`bg-blue-500`, `text-gray-600`, `text-emerald-600`) pin a color to one theme and one mode.

For status and deltas, reach for a `Badge` variant or `text-destructive`; when the design genuinely needs a success or warning color, add the token pair to the theme rather than the class — [theming.md](theming.md) has the two-step recipe.

**Semantic tokens already carry dark mode**, so `bg-background text-foreground` needs no `dark:` companion. Writing `bg-white dark:bg-gray-950` re-implements the token layer and drifts from it.

## Spacing and sizing

- **`gap-*` on a flex or grid container**, not `space-y-*` / `space-x-*`. A vertical stack is `flex flex-col gap-4`. (Generated source still uses `space-y-2` in a couple of places; the rule is for markup you write.)
- **`size-*` when width and height match** — `size-10`, not `w-10 h-10`.
- **`truncate`**, not `overflow-hidden text-ellipsis whitespace-nowrap`.

## Conditional classes go through `cn()`

```svelte
<script lang="ts">
  import { cn } from "$lib/utils";
  let isActive = $state(false);
</script>

<div class={cn("flex items-center", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
```

`cn()` is `clsx` + `tailwind-merge`, so later conflicting utilities replace earlier ones instead of both landing in the class list. A template literal skips that merge and leaves `p-2 p-4` for the cascade to arbitrate.

## Overlays stack themselves

`Dialog` `AlertDialog` `Sheet` `Drawer` `Popover` `Tooltip` `HoverCard` `DropdownMenu` `ContextMenu` `Menubar` `Select` and `NavigationMenu` all ship their own `z-50` on content and overlay. Let them — a hand-written `z-[999]` on one of them fights the layer stack instead of joining it.

## Icons

**Import from the configured `iconLibrary`.** Read it from `components.json`: `lucide` → `@lucide/svelte`, `tabler` → `@tabler/icons-svelte`, `hugeicons`, `phosphor`, `remixicon`. Generated components import from it, so assuming `@lucide/svelte` breaks a project set to anything else.

**Let the component size the icon.** 33 generated components carry a rule shaped like `[&_svg:not([class*='size-'])]:size-4`, tuned per component and per size — `Button` at `size="xs"` sizes its icon to `size-3`. The `:not()` guard means a `size-*` of your own *replaces* the component's choice rather than agreeing with it, so pass one only when a different size is the point.

**`data-icon` is what produces the spacing.** `data-icon="inline-start"` or `"inline-end"` on the icon drives `has-data-[icon=…]` padding on the parent:

```svelte
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>
<Button>
  Next
  <ArrowRightIcon data-icon="inline-end" />
</Button>
```

Exactly five components read it — `Button`, `Badge`, `Toggle`, `ToggleGroup.Item` and `Tabs.Trigger` — and on `Button` only the text sizes (`default` `xs` `sm` `lg`) have padding rules to adjust. On `size="icon"` and its siblings, and inside a `DropdownMenu.Item` or a sidebar row, the attribute is inert; those size their icons and set their own gaps.

**Pass icons as components, not string keys.** `let { Icon }: { Icon: Component } = $props()` and `<Icon />`, so the bundler sees the import and the type checker sees the prop.
