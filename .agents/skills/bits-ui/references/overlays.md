# Overlays

Dialog, AlertDialog, Popover, Tooltip, LinkPreview, DropdownMenu, ContextMenu, Menubar — and the content of Select, Combobox and DatePicker. Verified against bits-ui 2.18.1.

## The layer stack

Every popup `Content` is one element with several behaviours composed onto it. The same prop names recur across every namespace because they come from the same layers:

| Layer | Props |
|---|---|
| Escape | `escapeKeydownBehavior`, `onEscapeKeydown` |
| Dismissible | `interactOutsideBehavior`, `onInteractOutside`, `onFocusOutside` |
| Floating | `side` `sideOffset` `align` `alignOffset` `arrowPadding` `avoidCollisions` `collisionBoundary` `collisionPadding` `sticky` `hideWhenDetached` `updatePositionStrategy` `strategy` `dir` `customAnchor` |
| Presence | `forceMount` |
| Text selection | `preventOverflowTextSelection` |
| Focus scope | `trapFocus`, `onOpenAutoFocus`, `onCloseAutoFocus` |
| Scroll lock | `preventScroll` (`restoreScrollDelay` on dialogs only) |

`Dialog.Content` and `AlertDialog.Content` compose every layer **except** Floating — they are centred by your own CSS, so `side` and `align` do not exist on them. `Tooltip.Content` is the other exception: no focus scope and no scroll lock, because a tooltip never takes focus.

`*.Root` owns the open state: `open`, `onOpenChange`, `onOpenChangeComplete`. `*.Overlay` (Dialog, AlertDialog, Popover) takes only `forceMount`.

The defaults differ per component in ways that surprise people. Read from the installed 2.18.1 components:

| Content | `preventScroll` | `trapFocus` | `interactOutsideBehavior` |
|---|---|---|---|
| `Dialog` | `true` | `true` | `close` |
| `AlertDialog` | `true` | `true` | **`ignore`** |
| `Popover` | **`false`** | `true` | `close` |
| `DropdownMenu` | `true` | **`false`** | `close` |
| `ContextMenu` | `true` | `false` | `close` |
| `Menubar` | **`false`** | `false` | `close` |
| `*Menu.SubContent` | `false` | `false` | **`defer-otherwise-close`** |
| `Select` / `Combobox` | **`false`** | `true` | `close` |
| `Tooltip` | n/a | n/a | `close` |

## Dismissal

Two props, four values each:

```svelte
<Dialog.Content escapeKeydownBehavior="ignore" interactOutsideBehavior="close">
	<!-- ... -->
</Dialog.Content>
```

- Both accept `"close"`, `"ignore"`, `"defer-otherwise-close"`, `"defer-otherwise-ignore"`.
- The `defer-*` pair hands the decision to an ancestor Bits UI layer when there is one, and falls back to its own suffix when there is not. That is how a submenu inside a menu closes only itself on `Escape`.
- `onEscapeKeydown` / `onInteractOutside` / `onFocusOutside` run first; calling `preventDefault()` on the event cancels the behaviour for that one interaction.

## Focus and scroll

- `trapFocus` keeps Tab inside the content. Menus set it `false` — they manage a roving focus of their own instead.
- `onOpenAutoFocus` / `onCloseAutoFocus` fire with a cancellable event — `preventDefault()` then focus what you want. This is how you send focus to a specific field on open, or back to a non-trigger element on close.
- `preventScroll` locks the body. On dialogs, `restoreScrollDelay` postpones unlocking so an exit transition does not fight a re-appearing scrollbar; floating content does not accept it.

## Positioning

The floating layer is Floating UI. `side` / `align` are preferences that flip on collision unless `avoidCollisions={false}`. `customAnchor` takes a selector or an element and anchors the content somewhere other than the trigger. `updatePositionStrategy="always"` recomputes every frame — for content following a cursor.

Positioning happens on a **wrapper** element Bits UI renders around your content, marked `[data-bits-floating-content-wrapper]`. It carries the transform, the z-index, `min-width: max-content`, and the `--bits-floating-*` variables. Consequences worth knowing:

- The measurements you size against — anchor width, available height — are set as `--bits-floating-*` on the wrapper and re-exported under component-namespaced names on the content, so read them from the content. [styling.md](styling.md) lists them.
- A margin on your content shifts it away from the position the wrapper computed; use `sideOffset` / `alignOffset` instead.
- `data-side` and `data-align` land on the **content**, so direction-aware animations still key off the content element.

To position it yourself, use `*.ContentStatic` — the same layers minus Floating UI. It exists on Popover, Tooltip, LinkPreview, Select, Combobox, DatePicker, and all three menus (which also have `SubContentStatic`). Portalling static content re-introduces the positioning problem it was meant to avoid, so usually drop the portal with it.

## Delegating floating content

`child` on floating content is a **two-level** structure: the wrapper takes `wrapperProps` and stays unstyled, the inner element takes `props`.

```svelte
<script lang="ts">
	import { Popover } from 'bits-ui';
	import { fly } from 'svelte/transition';
</script>

<Popover.Root>
	<Popover.Trigger>Open</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:fly>Content</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
```

Non-floating content (`Dialog.Content`, `Dialog.Overlay`, `Accordion.Content`, `Collapsible.Content`) takes the one-level form: `{#snippet child({ props, open })}`.

## Nested dialogs

Dialogs stack, and each `Content` and `Overlay` reports where it sits:

- `data-nested` — this dialog has an open ancestor dialog. Hide its overlay to avoid stacking scrims.
- `data-nested-open` — this dialog has an open descendant. Scale or dim the parent with it.
- `--bits-dialog-depth` — 0 for the root, 1 for the first nested, and so on.
- `--bits-dialog-nested-count` — how many descendants are open right now, updating reactively.

## Tooltip

`Tooltip.Provider` is required. It owns the shared delay window, and a `Tooltip.Root` without one throws `Context "Tooltip.Provider" not found` at render. Wrap the app or a region:

```svelte
<script lang="ts">
	import { Tooltip } from 'bits-ui';
</script>

<Tooltip.Provider delayDuration={700} skipDelayDuration={300}>
	<Tooltip.Root>
		<Tooltip.Trigger>Hover</Tooltip.Trigger>
		<Tooltip.Portal>
			<Tooltip.Content>Tip</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
</Tooltip.Provider>
```

`delayDuration` is the wait before opening (700 ms); `skipDelayDuration` is the grace window in which moving to another trigger opens instantly (300 ms). Both are settable per `Tooltip.Root` too. Other Provider-level switches: `disableHoverableContent` (do not keep it open while the pointer is over the content), `disableCloseOnTriggerClick`, `ignoreNonKeyboardFocus`, `disabled`.

A safe polygon keeps the tooltip open while the pointer travels from trigger to content, so a hoverable tooltip stays reachable on the diagonal.

**Tethers** (`2.16`): one tooltip instance shared by triggers that do not sit in its subtree — the singleton pattern, and the fix for a trigger and its content living in different regions of the page.

```svelte
<script lang="ts">
	import { Tooltip } from 'bits-ui';
	type Action = { label: string; shortcut: string };
	const actions = Tooltip.createTether<Action>();
</script>

<Tooltip.Provider>
	<Tooltip.Trigger tether={actions} payload={{ label: 'Sync now', shortcut: 'S' }}>
		Sync
	</Tooltip.Trigger>

	<Tooltip.Root tether={actions}>
		{#snippet children({ payload })}
			<Tooltip.Portal>
				<Tooltip.Content>
					{payload?.label}
					<kbd>{payload?.shortcut}</kbd>
				</Tooltip.Content>
			</Tooltip.Portal>
		{/snippet}
	</Tooltip.Root>
</Tooltip.Provider>
```

`createTether<Payload>()` types both ends: each trigger supplies a `payload`, and the root's `children` snippet receives the active one along with `open` and `triggerId`. The tether object also exposes `open(triggerId)`, `close()` and `isOpen` for driving it yourself.

## Popover

`Popover.Trigger` takes `openOnHover` (`2.15`) with `openDelay` (700 ms) and `closeDelay` (300 ms) — a hover card without swapping to LinkPreview. `Popover.Overlay` (`2.14`) adds a scrim; it takes `forceMount` only.

## Menus

`DropdownMenu`, `ContextMenu` and `Menubar` share one part list and one behaviour set. `ContextMenu.Trigger` opens on right-click and anchors to the pointer; the other two anchor to the trigger.

```svelte
<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	let view = $state('list');
	let showHidden = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>Menu</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content>
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>View</DropdownMenu.GroupHeading>
				<DropdownMenu.RadioGroup bind:value={view}>
					<DropdownMenu.RadioItem value="list">
						{#snippet children({ checked })}
							{checked ? '•' : ''} List
						{/snippet}
					</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="grid">
						{#snippet children({ checked })}
							{checked ? '•' : ''} Grid
						{/snippet}
					</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.CheckboxItem bind:checked={showHidden}>
				{#snippet children({ checked })}
					{checked ? '✓' : ''} Show hidden
				{/snippet}
			</DropdownMenu.CheckboxItem>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>More</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.Item onSelect={() => {}}>Nested</DropdownMenu.Item>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
```

- Selection state comes through the `children` snippet (`{ checked }` / `{ selected }`) — render your own indicator from it.
- `Item` fires `onSelect` and closes the menu; keep it open with `closeOnSelect={false}` rather than by cancelling the event.
- A menu item that navigates is your own anchor via `child`; there is no `href` prop.
- `SubTrigger` takes `openDelay` (`2.13`) for the hover-open wait.
- `Menubar.Root` owns which menu is open through `value`; each menu is a `Menubar.Menu` with its own `value`.

## LinkPreview

A hover-only preview card: `Root` `Trigger` `Portal` `Content` `ContentStatic` `Arrow`, with `openDelay` / `closeDelay` on `Root`. The trigger is an anchor, so keyboard users reach the link without ever opening the card — put nothing in the preview that is not reachable another way.
