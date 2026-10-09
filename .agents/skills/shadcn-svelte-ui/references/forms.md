# Forms and inputs

Two layers ship, and they stack. **`Field`** is layout and state presentation; **`Form`** is validation wiring over sveltekit-superforms. Use `Field` alone for an unvalidated form, and `Form` around it when the form has a schema.

## Field is the layout system

`Field.Group` wraps a run of fields; `Field.Field` wraps one control with its label and description. This replaces the `div` + `space-y-4` shape entirely — the parts carry the gaps, the orientation modifiers, and the disabled/invalid styling.

```svelte
<script lang="ts">
  import * as Field from "$lib/components/ui/field";
  import { Input } from "$lib/components/ui/input";
</script>

<Field.Group>
  <Field.Field>
    <Field.Label for="email">Email</Field.Label>
    <Input id="email" type="email" />
    <Field.Description>We never share it.</Field.Description>
  </Field.Field>
</Field.Group>
```

Ten parts: `Field` `Set` `Legend` `Group` `Content` `Label` `Title` `Description` `Separator` `Error`, each also exported prefixed — `Field.FieldGroup` and `Field.Group` are one component, and the prefixed form is what the docs site writes. `Field.Field` takes `orientation="vertical" | "horizontal" | "responsive"` — `horizontal` for settings rows, `responsive` to switch at the `@md` container breakpoint. When the design has no room for a visible label, keep the `Field.Label` and give it `class="sr-only"` rather than dropping it for a `placeholder`.

Group related checkboxes, radios or switches in a `Field.Set` with a `Field.Legend`, not a `div` with a heading:

```svelte
<Field.Set>
  <Field.Legend variant="label">Preferences</Field.Legend>
  <Field.Description>Select all that apply.</Field.Description>
  <Field.Group class="gap-3">
    <Field.Field orientation="horizontal">
      <Checkbox id="dark" />
      <Field.Label for="dark" class="font-normal">Dark mode</Field.Label>
    </Field.Field>
  </Field.Group>
</Field.Set>
```

## Validation state takes two attributes

`data-invalid` on the `Field` styles the surround; `aria-invalid` on the control styles the control. Same split for disabled: `data-disabled` on the field, `disabled` on the control.

```svelte
<Field.Field data-invalid={!ok}>
  <Field.Label for="email">Email</Field.Label>
  <Input id="email" aria-invalid={!ok} />
  <Field.Error>Enter a valid email address.</Field.Error>
</Field.Field>
```

**Bind the boolean directly — the selectors are exact-match on purpose.** The field styles itself with `data-[invalid=true]`, and its label and title dim on `group-data-[disabled=true]/field`. Svelte serialises a non-boolean attribute whether the value is `true` or `false`, so `data-invalid={false}` renders `data-invalid="false"` — present in the DOM, and correctly inert against a `=true` selector. Bare-attribute syntax (`data-invalid`) is the always-on form; it renders `"true"`. Tailwind's `aria-invalid:` variant compiles to `[aria-invalid="true"]` and behaves the same way.

Both work across `Input` `Textarea` `Select` `NativeSelect` `Checkbox` `RadioGroup` `Switch` `Toggle` `InputOTP` `InputGroup` `Badge` `Button`, all of which carry `aria-invalid:` rules of their own.

**`Slider` is not among them.** It is the one control commonly listed as supporting validation that carries no `aria-invalid` rule at all — its only state styling is `data-disabled:opacity-50` — so `aria-invalid` on a `Slider` renders nothing. Put the invalid styling on the surrounding `Field` and the message in `Field.Error`.

`Field.Error` renders nothing when it has neither children nor messages, so it is safe to leave in the tree unconditionally. Given `errors={[{ message }, …]}` it renders a single line, or a bulleted list past one.

## InputGroup owns anything inside a control

An icon, hint, button or spinner that sits *within* the input's border is an `InputGroup` — not an `Input` with `pr-10` and an absolutely positioned `Button`.

```svelte
<InputGroup.Root>
  <InputGroup.Input placeholder="Search…" />
  <InputGroup.Addon align="inline-end">
    <InputGroup.Button aria-label="Search"><SearchIcon /></InputGroup.Button>
  </InputGroup.Addon>
</InputGroup.Root>
```

Six parts: `Root` `Input` `Textarea` `Addon` `Button` `Text`. Three things the shape depends on:

- **The control must be `InputGroup.Input` / `InputGroup.Textarea`.** A plain `Input` inside `InputGroup.Root` keeps its own border and padding.
- **`Addon` takes `align`** — `inline-start` (default) `inline-end` `block-start` `block-end`. The inline values also pull a nested button back into the padding; the block values run full width above or below.
- **Buttons inside are `InputGroup.Button`**, whose sizes are `xs` `sm` `icon-xs` `icon-sm` and whose default variant is `ghost`. A bare `Button size="icon"` is the wrong scale and misses the negative margin.

`InputGroup.Text` is for static hints and units; `Kbd` inside an addon gets its own radius treatment.

## Choosing a control

- Text → `Input`; multi-line → `Textarea`; verification code → `InputOTP`
- Dropdown of options → `Select`; searchable → `Combobox`; no-JS native → `NativeSelect`
- Boolean → `Switch` in settings, `Checkbox` in forms
- One of a few, always visible → `RadioGroup`
- One of 2–7, inline → `ToggleGroup`
- A number in a range → `Slider` — `type="single" | "multiple"`, binding a `number` or `number[]`
- A date → `Calendar` / `RangeCalendar`, or the date-picker composition in [composition.md](composition.md)

`ToggleGroup` replaces a hand-rolled loop of `Button`s with manual active state — it owns roving focus and the pressed attribute. `spacing` is a number (default `0`, meaning joined); pass `spacing={2}` for separated pills.

```svelte
<Field.Field orientation="horizontal">
  <Field.Title id="theme-label">Theme</Field.Title>
  <ToggleGroup.Root type="single" bind:value={theme} aria-labelledby="theme-label" spacing={2}>
    <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
    <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
  </ToggleGroup.Root>
</Field.Field>
```

`type="single" | "multiple"` is required — it is the Bits UI discriminant deciding whether `value` is a `string` or a `string[]`.

## Form is the superforms layer

The `form` item wires formsnap + sveltekit-superforms and installs both. Its parts are `Field` `ElementField` `Control` `Label` `Description` `FieldErrors` `Fieldset` `Legend` `Button`, each also exported as `FormField`, `FormControl`, … `Form.Field` takes the superform and a typed `name`, and hands its control the ids and ARIA wiring.

```svelte
<script lang="ts">
  import * as Form from "$lib/components/ui/form";
  import { Input } from "$lib/components/ui/input";
  const form = superForm(data.form);
  const { form: formData, enhance } = form;
</script>

<form method="POST" use:enhance>
  <Form.Field {form} name="email">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Email</Form.Label>
        <Input {...props} bind:value={$formData.email} />
      {/snippet}
    </Form.Control>
    <Form.Description>We never share it.</Form.Description>
    <Form.FieldErrors />
  </Form.Field>
  <Form.Button>Save</Form.Button>
</form>
```

`Form.ElementField` is the per-element variant for array fields. Error styling here keys on formsnap's `data-fs-error`, not on `data-invalid` — the two layers use different attributes, so don't hand-set `data-invalid` inside a `Form.Field`.
