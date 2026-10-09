# Input components

Checkbox, RadioGroup, Switch, Toggle, ToggleGroup, Select, Combobox, Slider, PinInput, RatingGroup. The binding model and form wiring are in [state.md](state.md); this is what is specific to each. Verified against bits-ui 2.18.1.

## Checkbox

`Checkbox.Root` renders a `<button role="checkbox">`, not an `<input>` — the input appears only when you give it a `name`. `checked` is a plain `boolean`; the third state is its own bindable `indeterminate` prop with its own `onIndeterminateChange`.

```svelte
<script lang="ts">
	import { Checkbox, Label, useId } from 'bits-ui';
	let checked = $state(false);
	const id = useId();
</script>

<Checkbox.Root {id} bind:checked name="terms">
	{#snippet children({ checked, indeterminate })}
		<span aria-hidden="true">{indeterminate ? '–' : checked ? '✓' : ''}</span>
	{/snippet}
</Checkbox.Root>
<Label.Root for={id}>Accept the terms</Label.Root>
```

`Checkbox.Group` (+ `Checkbox.GroupLabel`) collects child checkboxes into a bindable `string[]` of the checked `value`s, and submits them under one `name`. `disabled`, `required` and `readonly` set on the group cascade to its items.

## RadioGroup

`RadioGroup.Root` holds the `value`; each `RadioGroup.Item` has a `value` and exposes `{ checked }` to its `children` snippet. The group is one tab stop, arrow keys move within it, and focus selects — except while the group is still empty, where the arrows move focus and Space commits. That is the correct radio behaviour, so let it stand rather than intercepting the keys. `orientation` picks the arrow-key axis, `loop` wraps, and `readonly` (`2.7`) keeps it focusable but fixed.

## Switch and Toggle

`Switch` is `Root` + `Thumb` with `checked`, and reads as a switch to assistive tech. `Toggle` is a single pressed/unpressed button (`pressed`, `onPressedChange`) — use it for a formatting-style control, not for a boolean setting. `ToggleGroup` adds the `type` discriminant and `value`.

## Select and Combobox

Same engine: Combobox is Select with a text input on the front. Both need the `type` discriminant. The full structure is worth keeping straight:

```svelte
<script lang="ts">
	import { Select } from 'bits-ui';
	const items = [
		{ value: 'a', label: 'Ada' },
		{ value: 'b', label: 'Grace' }
	];
	let value = $state('');
</script>

<Select.Root type="single" bind:value {items}>
	<Select.Trigger>
		<Select.Value placeholder="Pick one" />
	</Select.Trigger>
	<Select.Portal>
		<Select.Content>
			<Select.ScrollUpButton>↑</Select.ScrollUpButton>
			<Select.Viewport>
				{#each items as item (item.value)}
					<Select.Item value={item.value} label={item.label}>
						{#snippet children({ selected })}
							{item.label}
							{selected ? '✓' : ''}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
			<Select.ScrollDownButton>↓</Select.ScrollDownButton>
		</Select.Content>
	</Select.Portal>
</Select.Root>
```

- **`Select.Value`** (`2.18`) renders the selected item's label, or the `placeholder` when there is none, and carries `data-placeholder` for styling the empty state. Its `children` / `child` snippet gives `{ selection, placeholder, disabled }`, where `selection` is discriminated on `type` and includes a `setValue` for building a clear button. Before `2.18` you rendered the label yourself — that older shape still works.
- **`items`** on `Select.Root` is the `{ value, label, disabled? }[]` behind closed-trigger typeahead and browser autofill. Item components cannot serve that purpose because they may not be mounted, so pass `items` even though you also render `Select.Item`s. Single-select only.
- **`Select.Viewport`** is what the scroll buttons measure against, so `min-height` / `max-height` belong on it. Skip the viewport and the scroll buttons have nothing to work with.
- `allowDeselect` lets a click on the chosen item clear it; `loop` wraps keyboard navigation; `scrollAlignment` picks `"nearest"` or `"center"`.
- **Combobox** adds `Combobox.Input`, plus `inputValue` on the root for pushing a value in from outside, and `clearOnDeselect` on the input. Filtering is yours — Bits UI does not filter the item list for you.

## Slider

`Root` `Range` `Thumb` `Tick` `ThumbLabel` `TickLabel`, with the `type` discriminant deciding `number` vs `number[]`. Render thumbs and ticks from the snippet props rather than counting by hand:

```svelte
<script lang="ts">
	import { Slider } from 'bits-ui';
	let value = $state([25, 75]);
</script>

<Slider.Root type="multiple" bind:value min={0} max={100} step={5}>
	{#snippet children({ thumbItems, tickItems })}
		<Slider.Range />
		{#each thumbItems as thumb (thumb.index)}
			<Slider.Thumb index={thumb.index} />
		{/each}
		{#each tickItems as tick (tick.index)}
			<Slider.Tick index={tick.index} />
			<Slider.TickLabel index={tick.index}>{tick.value}</Slider.TickLabel>
		{/each}
	{/snippet}
</Slider.Root>
```

- `thumbItems` / `tickItems` (`2.1`) carry `{ value, index }`. The older `thumbs` / `ticks` arrays are deprecated and give you the index alone, which is why labels are awkward with them.
- `onValueCommit` fires once on release — the callback to send to a server, while `onValueChange` fires on every movement.
- `step` accepts an array of discrete values, in which case `min` and `max` default to that array's bounds.
- `thumbPositioning` already defaults to `"contain"`, which keeps thumbs inside the track by measuring them on the client. `trackPadding` (`2.1`) reserves the same space in percentages instead, so it renders correctly on the server — but only once you also set `thumbPositioning="exact"`, otherwise the measuring path is still the one in charge.
- `autoSort` (default on) keeps a multiple slider's values ordered as thumbs cross.

## PinInput

One real `<input>` behind a row of styled cells. `maxlength` is required, and the `children` snippet is where the cells come from:

```svelte
<script lang="ts">
	import { PinInput, REGEXP_ONLY_DIGITS } from 'bits-ui';
	let value = $state('');
</script>

<PinInput.Root
	bind:value
	maxlength={6}
	name="code"
	pattern={REGEXP_ONLY_DIGITS}
	onComplete={() => console.log('done')}
>
	{#snippet children({ cells })}
		{#each cells as cell, i (i)}
			<PinInput.Cell {cell}>
				{cell.char}
				{#if cell.hasFakeCaret}<span class="caret"></span>{/if}
			</PinInput.Cell>
		{/each}
	{/snippet}
</PinInput.Root>
```

`REGEXP_ONLY_DIGITS`, `REGEXP_ONLY_CHARS` and `REGEXP_ONLY_DIGITS_AND_CHARS` are exported for the `pattern` — plain strings such as `"^\\d+$"`, not `RegExp` objects. `pasteTransformer` cleans pasted text (strip spaces or dashes) before it lands. `onComplete` fires when the last cell fills. `inputRef` (`2.18`) is bindable when you need to focus it yourself.

## RatingGroup

Stable since `2.10` — the export lost its `unstable_` prefix, so `RatingGroup` is the import name.

```svelte
<script lang="ts">
	import { RatingGroup } from 'bits-ui';
	let value = $state(3);
</script>

<RatingGroup.Root bind:value max={5} allowHalf name="score">
	{#snippet children({ items })}
		{#each items as item (item.index)}
			<RatingGroup.Item index={item.index}>
				{item.state === 'active' ? '★' : item.state === 'partial' ? '⯨' : '☆'}
			</RatingGroup.Item>
		{/each}
	{/snippet}
</RatingGroup.Root>
```

Each item reports `state` as `"active" | "partial" | "inactive"`, so half ratings need no arithmetic of yours. `hoverPreview` previews the value under the pointer, `min` sets a floor, `readonly` renders a display-only rating, and `aria-valuetext` accepts a `(value, max) => string` for the announced text.

## Labelling

None of these carry an accessible name on their own. Pair `Label.Root` with the control's `id` (`useId()` generates one), or put `aria-label` on the control. An icon-only trigger with no label is silent to a screen reader, and nothing in Bits UI warns about it.
