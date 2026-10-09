# Anatomy

How a Bits UI component is put together: **parts**, **delegation**, and **refs**. Verified against bits-ui 2.18.1.

## Parts

Every component is a namespace of parts you compose yourself. There is no monolithic `<Dialog>` — you assemble `Dialog.Root`, `Dialog.Trigger`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Description`, `Dialog.Close`. Each part renders one element and forwards the rest of its props to it.

Twelve `Root`s render **no element at all** — they are pure context providers, so a `class` or `style` on them lands nowhere. Style the `Trigger` and the `Content` instead. Reading each root's template at 2.18.1, the element-less set is `AlertDialog`, `Combobox`, `ContextMenu`, `DateField`, `DatePicker`, `Dialog`, `DropdownMenu`, `LinkPreview`, `Popover`, `Select`, `TimeField` and `Tooltip`, plus `Menubar.Menu`. Every other `Root` — `Accordion`, `Tabs`, `Collapsible`, `Avatar`, `Checkbox`, `RadioGroup`, `Slider`, `Toolbar`, `ScrollArea`, `Command`, `Menubar` and the rest — takes styling normally.

Mostly that follows the popup rule, with one asymmetry worth remembering: the **range** variants break it. `DateRangeField.Root`, `TimeRangeField.Root` and `DateRangePicker.Root` each render a wrapping `<div>` where their single-value siblings render nothing.

```svelte
<script lang="ts">
	import { Dialog } from 'bits-ui';
</script>

<Dialog.Root>
	<Dialog.Trigger>Open</Dialog.Trigger>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content>
			<Dialog.Title>Title</Dialog.Title>
			<Dialog.Description>Description</Dialog.Description>
			<Dialog.Close>Close</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
```

### The roster

Every part exported by each namespace, from the installed package's `exports.d.ts`. A name absent here does not exist — reach for `child` delegation instead of inventing one.

| Namespace | Parts |
|---|---|
| `Accordion` | Root Item Header Trigger Content |
| `AlertDialog` | Root Trigger Portal Overlay Content Title Description Action Cancel |
| `AspectRatio` | Root |
| `Avatar` | Root Image Fallback |
| `Button` | Root |
| `Calendar` | Root Header PrevButton Heading NextButton MonthSelect YearSelect Grid GridHead GridRow HeadCell GridBody Cell Day |
| `Checkbox` | Root Group GroupLabel |
| `Collapsible` | Root Trigger Content |
| `Combobox` | Root Input Trigger Portal Content ContentStatic Viewport Item Group GroupHeading Separator Arrow ScrollUpButton ScrollDownButton |
| `Command` | Root Input List Viewport Empty Loading Group GroupHeading GroupItems Item LinkItem Separator |
| `ContextMenu` | Root Trigger Portal Content ContentStatic Item Group GroupHeading Separator CheckboxItem CheckboxGroup RadioGroup RadioItem Sub SubTrigger SubContent SubContentStatic Arrow |
| `DateField` | Root Label Input Segment |
| `DatePicker` | Root Label Input Segment Trigger Portal Content ContentStatic Close Arrow Calendar Header PrevButton Heading NextButton MonthSelect YearSelect Grid GridHead GridRow HeadCell GridBody Cell Day |
| `DateRangeField` | Root Label Input Segment |
| `DateRangePicker` | same as `DatePicker`, minus `Portal` and `ContentStatic` |
| `Dialog` | Root Trigger Portal Overlay Content Title Description Close |
| `DropdownMenu` | same parts as `ContextMenu` |
| `Label` | Root |
| `LinkPreview` | Root Trigger Portal Content ContentStatic Arrow |
| `Menubar` | Root Menu Trigger Portal Content ContentStatic Item Group GroupHeading Separator CheckboxItem CheckboxGroup RadioGroup RadioItem Sub SubTrigger SubContent SubContentStatic Arrow |
| `Meter` | Root |
| `NavigationMenu` | Root List Item Trigger Content Link Indicator Viewport Sub |
| `Pagination` | Root PrevButton NextButton Page |
| `PinInput` | Root Cell |
| `Popover` | Root Trigger Portal Overlay Content ContentStatic Close Arrow |
| `Progress` | Root |
| `RadioGroup` | Root Item |
| `RangeCalendar` | same as `Calendar` |
| `RatingGroup` | Root Item |
| `ScrollArea` | Root Viewport Scrollbar Thumb Corner |
| `Select` | Root Value Trigger Portal Content ContentStatic Viewport Item Group GroupHeading ScrollUpButton ScrollDownButton |
| `Separator` | Root |
| `Slider` | Root Range Thumb ThumbLabel Tick TickLabel |
| `Switch` | Root Thumb |
| `Tabs` | Root List Trigger Content |
| `TimeField` | Root Label Input Segment |
| `TimeRangeField` | Root Label Input Segment |
| `Toggle` | Root |
| `ToggleGroup` | Root Item |
| `Toolbar` | Root Button Link Group GroupItem |
| `Tooltip` | Provider Root Trigger Portal Content ContentStatic Arrow · plus `Tooltip.createTether()` |

Non-component exports: `BitsConfig`, `Portal`, `IsUsingKeyboard`, `mergeProps`, `useId`, `getBitsConfig`, `computeCommandScore`, `REGEXP_ONLY_DIGITS`, `REGEXP_ONLY_CHARS`, `REGEXP_ONLY_DIGITS_AND_CHARS`.

### The one-part components

`AspectRatio` (`ratio`), `Button` (renders `<button>`, or an `<a>` when given `href`), `Label` (`for`), `Meter` (`value` `min` `max`), `Progress` (`value` `min` `max`, with `value={null}` for indeterminate), `Separator` (`orientation`, and `decorative` to hide it from assistive tech). `Avatar` is three parts, with `loadingStatus` and `delayMs` on `Root` deciding when `Fallback` shows.

## Delegation

`child` hands you the props and lets you render the element. Reach for it to swap the element itself, attach a Svelte `transition:`, apply a scoped-style class, or pass the props on to your own component. Attachments do not need it — see below.

```svelte
<Accordion.Trigger>
	{#snippet child({ props })}
		<button {...props} class="my-trigger">Toggle</button>
	{/snippet}
</Accordion.Trigger>
```

Rules that decide whether it works:

- **Spread `props` on exactly one element.** They carry the ARIA attributes, the event handlers, the id the component registered, and the attachment that populates `ref`.
- **Pass your own attributes to the part, not to the delegated element.** `id`, `onclick`, `data-*` go on `<Accordion.Trigger id="x" onclick={…}>`; they arrive merged inside `props`. An `id` set on the delegated element instead still leaves `bind:ref` working, but the part goes on publishing the id it generated — so every `aria-labelledby`, `aria-controls` and `aria-describedby` pointing at this element now points at nothing.
- **Children passed outside the snippet are ignored** when `child` is present.
- **`Accordion.Trigger` loses its `type="button"`** under delegation: it is the one part that writes `type` onto its own element rather than into `props`. Put `type="button"` on your button, or a trigger inside a form submits it.
- **Floating content needs two levels** — see [overlays.md](overlays.md).

The merge is `mergeProps`, which is also exported for your own components:

- event handlers **chain** in argument order, and the chain stops at the first `event.defaultPrevented` — calling `preventDefault()` is the documented way to suppress Bits UI's own handler,
- non-handler functions chain without the cancel,
- `class` merges through `clsx`,
- `style` merges object-or-string forms, later winning,
- symbol keys — which is how Svelte carries attachments — are **overwritten**, not chained.

## Refs and attachments

Parts expose `ref` as a bindable prop. Bind to it rather than to `bind:this` — `bind:this` on a part gives you the component instance, not the element.

```svelte
<script lang="ts">
	import { Accordion } from 'bits-ui';
	let triggerRef = $state<HTMLButtonElement | null>(null);
</script>

<Accordion.Trigger bind:ref={triggerRef}>Toggle</Accordion.Trigger>
```

`ref` is `null` until mount. Underneath it is a **Svelte attachment** keyed by `createAttachmentKey()` and shipped inside `props`, which is the whole reason `bind:ref` survives `child` delegation: spread `props` and the attachment comes with it. Nothing looks the element up by id.

The same channel is open to you. Bits UI parts forward unknown props onto their element, and `mergeProps` preserves symbol keys, so `{@attach}` works on a part exactly as it does on an element — this is what the Svelte `^5.33` peer range was raised for:

```svelte
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Attachment } from 'svelte/attachments';

	const autoResize: Attachment<HTMLElement> = (node) => {
		const observer = new ResizeObserver(() => reflow(node));
		observer.observe(node);
		return () => observer.disconnect();
	};
</script>

<Dialog.Content {@attach autoResize}>…</Dialog.Content>
```

Each `{@attach}` gets a fresh symbol, so yours and the library's coexist. Prefer this to `bind:ref` plus an `$effect` when the work is per-element setup and teardown. Aim it at a part that renders an element: on one of the twelve element-less `Root`s the attachment simply never runs, with nothing logged.

## Wrapper components

Wrapping a part is the normal way to carry your own styling. The type helpers keep the wrapper's surface honest:

| Helper | Removes | Use when |
|---|---|---|
| `WithoutChild<T>` | `child` | your wrapper renders the element and takes children |
| `WithoutChildren<T>` | `children` | your wrapper supplies the inner structure |
| `WithoutChildrenOrChild<T>` | both | your wrapper owns the whole subtree |
| `WithElementRef<T, El>` | — adds `ref?: El \| null` | your own component should expose `bind:ref` |

```svelte
<script lang="ts">
	import { Dialog, type WithoutChildrenOrChild } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		title,
		children,
		...restProps
	}: WithoutChildrenOrChild<Dialog.ContentProps> & {
		title: string;
		children?: Snippet;
	} = $props();
</script>

<Dialog.Content bind:ref {...restProps}>
	<Dialog.Title>{title}</Dialog.Title>
	{@render children?.()}
</Dialog.Content>
```

Prop types live on the namespace: `Dialog.RootProps`, `Dialog.ContentProps`, `Select.ItemProps`, and so on. Import the namespace as a value and use it in type position — the parts and their prop types share it.

## Portals and global defaults

`Portal` moves content out of its DOM position; `to` accepts a selector or an element, `disabled` renders in place. Most overlay namespaces expose their own `*.Portal` wrapping the standalone one.

`BitsConfig` sets defaults for everything beneath it and nests, each level inheriting and overriding selectively:

```svelte
<script lang="ts">
	import { BitsConfig } from 'bits-ui';
	let { children } = $props();
</script>

<BitsConfig defaultPortalTo="#overlays" defaultLocale="de">
	{@render children?.()}
</BitsConfig>
```

Resolution order: the part's own prop → nearest `BitsConfig` → ancestor `BitsConfig` → built-in default (`document.body`, `"en"`). `getBitsConfig()` reads the resolved config from inside a descendant component.

## Small utilities

- `useId()` — the same id generator the components use, for wiring your own `for` / `aria-*` pairs.
- `new IsUsingKeyboard()` — a shared reactive `current` boolean, true while the user is driving with the keyboard. Use it to show affordances only for keyboard users.
