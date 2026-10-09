# Composition

Which item to reach for, and how its parts fit together. Read alongside [styling.md](styling.md), which governs the `class` attributes on them.

## Imports and barrels

Each component is a folder with an `index.ts` barrel, under the `ui` alias from `components.json` (usually `$lib/components/ui`). **Most barrels export each part twice** — the short name and a prefixed alias — so `Card.Header` and `CardHeader` are the same component.

```ts
import * as Dialog from "$lib/components/ui/dialog";   // multi-part: Dialog.Root, Dialog.Content, Dialog.Title
import { Button } from "$lib/components/ui/button";    // single-component folder
import { Toaster } from "$lib/components/ui/sonner";   // the one whose export is renamed
```

Sixteen folders hold a single component and take a named import: `aspect-ratio` `badge` `button` `checkbox` `input` `label` `progress` `separator` `skeleton` `slider` `sonner` `spinner` `switch` `textarea` `toggle`, plus `data-table` (which exports `createSvelteTable`, `FlexRender`, `renderComponent`, `renderSnippet` rather than a component). Everything else is namespace-imported.

**`calendar` and `range-calendar` break both halves of that rule** — no prefixed aliases, and no `Root`. Each ships its root as `Root as Calendar` / `Root as RangeCalendar`, so the root is `<Calendar.Calendar>` and `Calendar.Root` is a type error. Four more barrels have no `Root` either: reach for `Field.Field`, `Form.Field`, `Chart.Container` and `Resizable.PaneGroup`.

Read the aliases out of `components.json` rather than hardcoding `$lib/` — and after adding an item by registry URL, rewrite its imports to match, because third-party items carry their author's paths.

## Which item

| Need | Reach for |
|---|---|
| Action | `Button`; `ButtonGroup` for a joined set |
| Text entry | `Input`, `Textarea`, `InputOTP`; `InputGroup` when an icon, button or hint sits inside the control |
| Choice | `Select` (dropdown), `Combobox` (searchable), `NativeSelect` (no JS), `RadioGroup` (few, always visible), `ToggleGroup` (2–7, inline) |
| Boolean | `Switch` for settings, `Checkbox` for forms |
| Number in a range | `Slider` |
| Date | `Calendar`, `RangeCalendar`, or the date-picker composition below |
| Form layout | `Field`; `Form` when validating with sveltekit-superforms — see [forms.md](forms.md) |
| Data | `Table`, `DataTable` (TanStack), `Card`, `Badge`, `Avatar`, `Item` |
| Navigation | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination` |
| Overlay | `Dialog`, `AlertDialog`, `Sheet`, `Drawer`, `Popover`, `HoverCard`, `Tooltip` |
| Menu | `DropdownMenu`, `ContextMenu`, `Menubar` |
| Feedback | `Alert`, `Progress`, `Skeleton`, `Spinner`, `Empty`, `svelte-sonner` for toasts |
| Command palette | `Command`, or `Command.Dialog` for the modal form |
| Charts | `Chart` (LayerChart) |
| Layout | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`, `AspectRatio` |
| Keys | `Kbd`, `Kbd.Group` |

## Parts that need their group

`Select.Group` `DropdownMenu.Group` `ContextMenu.Group` `Menubar.Group` `Command.Group` are not decorative wrappers — `Select.Group` carries the content padding (`p-1`), and the group is what an `aria-labelledby` heading attaches to. Put every `Item`, `Label` and `Sub` inside one.

```svelte
<Select.Content>
  <Select.Group>
    <Select.GroupHeading>Fruit</Select.GroupHeading>
    <Select.Item value="apple">Apple</Select.Item>
  </Select.Group>
</Select.Content>
```

## Overlays

| Situation | Component |
|---|---|
| Focused task needing input | `Dialog` |
| Confirming something destructive | `AlertDialog` |
| Side panel of details or filters | `Sheet` |
| Mobile-first bottom panel | `Drawer` (vaul-svelte) |
| Small contextual content on click | `Popover` |
| Preview on hover | `HoverCard` |
| Label on hover | `Tooltip` — wrap the app once in `Tooltip.Provider` |

**`Dialog`, `Sheet`, `Drawer` and `AlertDialog` each need a Title.** `Dialog.Content` takes its `aria-labelledby` from the id `Dialog.Title` registers, so omitting it ships an unnamed `role="dialog"` with no warning. `class="sr-only"` keeps it out of sight.

`Dialog.Content` already renders its own Portal and Overlay; `Select.Content` its own Portal. Configure with `portalProps`, not by wrapping.

**Open an overlay from its own `Trigger`**, which wires the ARIA attributes and the focus return; `bind:open` on the Root is the programmatic route when there is no trigger element. A `Button` as the trigger goes through the `child` snippet, so the trigger's props land on the button instead of nesting one inside the other:

```svelte
<Popover.Trigger>
  {#snippet child({ props })}
    <Button {...props} variant="outline">Open</Button>
  {/snippet}
</Popover.Trigger>
```

## Full compositions

Reaching for a subset and filling the gap with `div`s is the common miss. `Card` has seven parts, `Empty` six:

```svelte
<Card.Root>
  <Card.Header>
    <Card.Title>Team members</Card.Title>
    <Card.Description>Manage your team.</Card.Description>
    <Card.Action><Button variant="ghost" size="icon-sm"><EllipsisIcon /></Button></Card.Action>
  </Card.Header>
  <Card.Content>…</Card.Content>
  <Card.Footer><Button>Invite</Button></Card.Footer>
</Card.Root>

<Empty.Root>
  <Empty.Header>
    <Empty.Media variant="icon"><FolderIcon /></Empty.Media>
    <Empty.Title>No projects yet</Empty.Title>
    <Empty.Description>Get started by creating one.</Empty.Description>
  </Empty.Header>
  <Empty.Content><Button>Create project</Button></Empty.Content>
</Empty.Root>
```

`Alert` follows the same shape — `Alert.Root` with `Alert.Title`, `Alert.Description` and an optional `Alert.Action`, `variant="destructive"` for errors.

Three more that get truncated: `Tabs.Trigger` belongs inside `Tabs.List`, never directly in `Tabs.Root`; `Avatar.Root` always gets an `Avatar.Fallback` for when the image fails; `Sidebar` needs `Sidebar.Provider` around it.

## Dates

`Calendar` renders inline. **A date picker is a composition, not an item** — there is no `date-picker` to `add`, only a docs page for the `Popover` + `Calendar` shape:

```svelte
<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline">
        {date ? date.toDate(getLocalTimeZone()).toLocaleDateString() : "Select date"}
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-auto overflow-hidden p-0" align="start">
    <Calendar.Calendar type="single" bind:value={date} captionLayout="dropdown"
      maxValue={today(getLocalTimeZone())} onValueChange={() => (open = false)} />
  </Popover.Content>
</Popover.Root>
```

Values are `@internationalized/date` objects, not `Date` — `let date = $state<CalendarDate | undefined>()`, imported from the package bits-ui already drags in. `Calendar` takes `type="single" | "multiple"`; `RangeCalendar` takes neither, binding `{ start, end }` instead.

## Pending state

`Button` has no `isLoading` or `isPending`. Compose it:

```svelte
<Button disabled>
  <Spinner data-icon="inline-start" />
  Saving…
</Button>
```

## Toasts

```svelte
<script lang="ts">
  import { toast } from "svelte-sonner";
</script>
```

`toast.success(…)`, `toast.error(…)`, and `toast(msg, { action: { label: "Undo", onClick } })`. Mount `Toaster` from the `sonner` folder once in the root layout — the import comes from your UI folder, the `toast` function from `svelte-sonner` itself.

## Wrapper components

A Select is eleven parts, a Calendar eighteen. Assemble the tree once in your own `.svelte` file and call that everywhere, typed with `WithoutChildren` / `WithoutChild` / `WithoutChildrenOrChild` from the `utils` alias so the surface stays honest.

```svelte
<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  let { title, description, onConfirm, children } = $props();
  let open = $state(false);
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Trigger>{@render children?.()}</AlertDialog.Trigger>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description>{description}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => { onConfirm?.(); open = false; }}>Confirm</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
```

`AlertDialog.Action` does not close the dialog on its own — set `open = false` yourself, as above.
