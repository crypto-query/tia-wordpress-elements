# State and forms

How value and open state flow, and how a component reaches a form submission. Verified against bits-ui 2.18.1.

## Three ways to hold state

Every stateful part ships the same trio: a prop, a change callback, and bindability.

```svelte
<script lang="ts">
	import { Dialog, Accordion } from 'bits-ui';
	let open = $state(false);
	let section = $state('');
</script>

<!-- 1. uncontrolled: the component owns it, you only watch -->
<Dialog.Root onOpenChange={(o) => console.log(o)}>…</Dialog.Root>

<!-- 2. bound: your state is the source of truth -->
<Dialog.Root bind:open>…</Dialog.Root>

<!-- 3. function binding: you decide whether each write lands -->
<Accordion.Root
	type="single"
	bind:value={() => section, (next) => (section = next === section ? '' : next)}
>…</Accordion.Root>
```

The function binding is the veto point. Reach for it to guard a change (confirm before closing), transform it, debounce it, or mirror it into somewhere else. A plain `onValueChange` cannot refuse the change; a setter can simply not assign.

`onOpenChangeComplete` fires **after** the enter or exit animation settles, not when `open` flips. Use it to destroy content, reset a form, or restore focus once the surface is really gone. It exists on every animated surface: Dialog, AlertDialog, Popover, Tooltip, LinkPreview, Select, Combobox, Collapsible, DatePicker, DateRangePicker, and the three menus.

## The `type` discriminant

`Accordion`, `Select`, `Combobox`, `Slider`, `ToggleGroup` and `Calendar` take a **required** `type` of `"single"` or `"multiple"`. It is a discriminant, not a convenience: it types `value` as `string` vs `string[]` (`number` vs `number[]` for Slider, `DateValue` vs `DateValue[]` for Calendar).

Direct use typechecks cleanly. Wrapping is where it bites, because destructuring a bindable prop out of a discriminated union loses the correlation:

```svelte
<script lang="ts">
	import { Select, type WithoutChildren } from 'bits-ui';
	// Type 'string | string[] | undefined' is not assignable to type 'string[] | undefined'
	let { value = $bindable(), ...restProps }: WithoutChildren<Select.RootProps> = $props();
</script>

<Select.Root bind:value {...restProps}>…</Select.Root>
```

Two fixes, depending on whether the wrapper needs to stay polymorphic:

```svelte
<script lang="ts">
	import { Select, type WithoutChildren } from 'bits-ui';
	// pin it to one mode — no cast needed
	type Props = WithoutChildren<Extract<Select.RootProps, { type: 'single' }>>;
	let { value = $bindable(), ...restProps }: Props = $props();
</script>

<Select.Root bind:value {...restProps}>…</Select.Root>
```

```svelte
<script lang="ts">
	import { Select, type WithoutChildren } from 'bits-ui';
	// keep both modes — cast at the binding; callers still get the union
	let { value = $bindable(), ...restProps }: WithoutChildren<Select.RootProps> = $props();
</script>

<Select.Root bind:value={value as never} {...restProps}>…</Select.Root>
```

Only `Select.RootProps` exists — there is no `Select.SingleRootProps` to import, hence the `Extract`.

## Reading state inside the markup

Parts hand their state to the `children` snippet rather than exposing indicator sub-components. This is how you render a checkmark, a chevron, or a fallback:

```svelte
<Checkbox.Root>
	{#snippet children({ checked, indeterminate })}
		{indeterminate ? '–' : checked ? '✓' : ''}
	{/snippet}
</Checkbox.Root>
```

`Select.Item` and `Combobox.Item` give `{ selected, highlighted }`; menu items give `{ checked }`; `Select.Value` gives `{ selection, placeholder, disabled }`; content parts give `{ open }`. Anything you can style off a data attribute, style off the attribute instead — the snippet is for structure.

## Forms

Give a component a `name` and it renders a visually hidden input carrying the current value, so a plain HTML form or a SvelteKit action receives it with no extra wiring. That covers `Checkbox` (and `Checkbox.Group`), `RadioGroup`, `Switch`, `Select`, `Combobox`, `RatingGroup`, and the date/time fields. `PinInput.Root` renders a real input, so `name` lands on it directly.

`Slider` deliberately renders no hidden input — the value space is continuous and the shape is yours to choose. Render your own:

```svelte
<script lang="ts">
	import { Slider } from 'bits-ui';
	let range = $state([20, 80]);
</script>

<form method="POST">
	<Slider.Root type="multiple" bind:value={range}>
		<Slider.Range />
		<Slider.Thumb index={0} />
		<Slider.Thumb index={1} />
	</Slider.Root>
	<input type="hidden" name="min" value={range[0]} />
	<input type="hidden" name="max" value={range[1]} />
</form>
```

Alongside `name`, the form-shaped props are `required` (which sets both `aria-required` on the control and `required` on the hidden input), `disabled`, and `readonly` — the latter on Checkbox, RadioGroup, RatingGroup and the whole date/time family. A `readonly` control stays focusable and announced but refuses changes; a `disabled` one drops out of the tab order and submits nothing. Reach for `readonly` whenever the value still matters to the reader.

Validation state comes from the date/time family as `data-invalid` plus an `onInvalid` callback — see [dates.md](dates.md). For everything else, own the error message yourself and point at the control with `aria-describedby`.
