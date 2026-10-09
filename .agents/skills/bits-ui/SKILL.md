---
name: bits-ui
description: Bits UI 2.x — headless Svelte 5 primitives for dialogs, menus, selects, calendars and the rest, plus the data attributes you style them with. Use when building or reviewing anything imported from bits-ui, styling its parts, or migrating from Bits UI v0/v1.
version: 2.2.0
scope: integration
distribution: author-only
---

# Bits UI

Verified against **bits-ui 2.18.1**. Svelte `^5.33` and `@internationalized/date` are both hard peer dependencies — the date package installs whether or not you use a calendar. Features are tagged `2.x` at the point of use; check the installed version before reaching for one.

There is no 2.0.0 — the v2 line opens at **2.1.0**, because someone else had held 2.0.x on npm for years. Those two peer ranges are the entire v1 → v2 break, and the Svelte bump was taken to adopt attachments and `$props.id()`, which is why `{@attach}` works on any part that renders an element. That is also why the docs site ships no v2 migration guide: its migration page covers 0.x → 1.x and still applies.

## Where to look

| File | Read it for |
|---|---|
| [anatomy.md](references/anatomy.md) | the part roster for all 41 components, which element each part renders, `child` delegation, `ref` and attachments, `mergeProps`, `Portal`, `BitsConfig`, the `Without*` type helpers, wrapper components |
| [state.md](references/state.md) | `bind:`, function bindings, the required `type` discriminant and its wrapper-typing trap, `onXChangeComplete`, hidden inputs and form submission |
| [styling.md](references/styling.md) | the `data-*` vocabulary, `--bits-*` variables, enter/exit animation with `data-starting-style`, Svelte transitions via `forceMount` |
| [overlays.md](references/overlays.md) | the layer stack behind every popup, positioning, dismissal, focus, scroll lock, nested dialogs, `Tooltip.Provider` and tethers, menus, `ContentStatic` |
| [inputs.md](references/inputs.md) | Checkbox, RadioGroup, Switch, Toggle, Select, Combobox, Slider, PinInput, RatingGroup |
| [dates.md](references/dates.md) | `@internationalized/date`, the `placeholder` prop, fields and segments, validation, calendars and pickers |
| [navigation.md](references/navigation.md) | Tabs, Accordion, Collapsible, NavigationMenu, Pagination, Command, Toolbar, ScrollArea |

## Working rules

**Fetch the component's own page before writing its props.** Every component publishes a clean markdown API reference at `https://bits-ui.com/docs/components/<kebab-name>/llms.txt` — props, snippet props, data attributes and CSS variables, per part. The index of every page is `https://bits-ui.com/llms.txt`; the concatenated `docs/llms.txt` is ~1.9 MB, so fetch the single component instead. Prop sets are large, split across parts, and gain members every few minor releases, so recall is the least reliable source available. These reference files carry the model and the traps; that page carries the exact names. Where it is weakest is data attributes — ScrollArea's are documented under names the package never renders — so when a selector built from the docs matches nothing, read the rendered DOM and believe that instead.

**Write the wrapper component.** A Select is twelve parts, a Calendar fourteen. The API is verbose on purpose, and the intended shape is one wrapper per pattern in your own codebase — typed with `WithoutChildren` / `WithoutChild` / `WithoutChildrenOrChild` so its surface stays honest. Assembling the full part tree at every call site is the mistake the design expects you to avoid.

**Style from data attributes, structure from snippets.** Every element carries `data-<component>-<part>` plus state attributes that flip as the component moves. Anything expressible as a selector belongs in CSS; reach into a `children` snippet only when the state changes what elements exist.

**You still owe the accessible name.** Bits UI wires roles, ARIA relationships, focus management and keyboard interaction. It cannot name anything. `Dialog.Content` takes its `aria-labelledby` from whatever id `Dialog.Title` registered, so rendering no `Title` leaves the attribute off entirely — `<div role="dialog" aria-modal="true">`, unnamed, with no console warning in 2.18.1. Render a `Title`, and label icon-only triggers with `aria-label`.

**There is no official Bits UI skill, MCP server or `AGENTS.md`.** `bits-ui.com/llms.txt` is the official machine-readable surface; `/AGENTS.md` and `/llms-full.txt` 404, and the repo carries neither `AGENTS.md` nor `CLAUDE.md`. The nearest official skill is shadcn-svelte's (`bunx skills add huntabyte/shadcn-svelte`), which covers that registry's CLI and theming rather than these primitives. One community skill exists (`BetaHuhn/skills`) and repeats the `id`-breaks-`ref` claim corrected below. For search-style lookups Context7 indexes it as `/llmstxt/bits-ui_llms_txt`.

## Corrections to common assumptions

Training data is dense with Bits UI v0, which was a different library on Svelte 4, and with a few claims the current docs still repeat. Ordered by how often each one bites:

- **`asChild` is `child`, and `el` is `ref`.** Render delegation is `{#snippet child({ props })}` with `{...props}` spread on your element; `bind:ref` gets you the DOM node. Data that used to arrive through `let:` directives now arrives as snippet props.
- **Transition props are gone.** No `transition`, `transitionConfig`, `inTransition`. Animate with CSS off `data-state` / `data-starting-style`, or use `forceMount` plus `child` for a Svelte `transition:`.
- **Portalling is explicit.** Wrap content in `Dialog.Portal`, `Select.Portal`, `Popover.Portal`. v0 portalled by default and took a `portal={false}` opt-out; there is no `portal` prop now.
- **`type="single" | "multiple"` is required** on `Accordion`, `Select`, `Combobox`, `Slider`, `ToggleGroup` and `Calendar`. The old boolean `multiple` prop is gone, and `type` is the discriminant that decides whether `value` is a `string` or a `string[]`.
- **`Tooltip.Provider` is required.** A `Tooltip.Root` without one throws `Context "Tooltip.Provider" not found`.
- **Indicator parts do not exist.** No `Checkbox.Indicator`, `Select.ItemIndicator`, `RadioGroup.ItemIndicator`, `*Menu.CheckboxIndicator`. Render the mark yourself from the `children` snippet's `{ checked }` / `{ selected }`.
- **`Select.Value` is back as of `2.18`** — and the migration guide on the docs site still says it was removed, because that page describes v1. It renders the selected label or a `placeholder` and exposes `{ selection, placeholder, disabled }`.
- **A menu item that navigates is your own anchor** through `child`. `*Menu.Item` has no `href`. `Command.LinkItem` and `NavigationMenu.Link` are the two parts that do render anchors.
- **`*Menu.Label` is `*Menu.GroupHeading`.**
- **Slider reads `thumbItems` / `tickItems`** from its `children` snippet; the older `thumbs` / `ticks` arrays are deprecated and carry indices only.
- **`RatingGroup` needs no `unstable_` prefix** since `2.10`.
- **Checkbox `checked` is a plain `boolean`.** The third state is a separate bindable `indeterminate` prop, not `checked: 'indeterminate'`.
- **Seven parts render a `<button>` with no `type`**, so inside a `<form>` they submit it: `Dialog.Trigger`, `Dialog.Close`, `AlertDialog.Trigger`, `AlertDialog.Action`, `AlertDialog.Cancel`, `NavigationMenu.Trigger` and `Button.Root`. Pass `type="button"` yourself. Every other button part sets it.
- **A `child`-delegated element keeps `bind:ref` even with your own `id`** — `ref` rides in the spread `props` as a Svelte attachment, not an id lookup. What your `id` does break is the ARIA relationships keyed on the id the part registered, so pass `id` to the part.
- **`Popover.Content` does not lock body scroll** — its `preventScroll` defaults to `false`, where Dialog's defaults to `true`. `Select` and `Menubar` content also default to `false`.
- **`AlertDialog.Action` does not close the dialog** — combined with its missing `type`, a form inside one submits and stays open.
- **`ScrollArea.Content` was removed** in v1; the parts are `Root` `Viewport` `Scrollbar` `Thumb` `Corner`.

## Related skills

- **svelte-sveltekit** — Svelte 5 itself: runes, snippets, `transition:`, and the MCP server plus `svelte-autofixer`
- **tailwind-css** — the utility side of styling these parts, including `data-*` variants
- **shadcn-svelte-ui** — the component registry built on top of Bits UI, when you want opinionated components instead of primitives
