# Styling and animation

Bits UI ships almost no CSS. What it does ship is a **vocabulary**: a data attribute on every element, state attributes that flip as the component moves, and CSS variables carrying measurements you cannot compute yourself. Verified against bits-ui 2.18.1.

## The attribute vocabulary

Every rendered element carries `data-<component>-<part>` — `data-accordion-trigger`, `data-select-content`, `data-dialog-overlay`. That is a stable global selector: one rule reaches every instance without a class.

State attributes ride alongside. The recurring set, ordered by how often it appears in the source:

| Attribute | Values | On |
|---|---|---|
| `data-disabled` | present / absent | anything disableable |
| `data-state` | `open` / `closed`, `checked` / `unchecked` / `indeterminate`, `active` / `inactive` | disclosures, toggles, tabs |
| `data-orientation` | `horizontal` / `vertical` | groups, sliders, separators, menus |
| `data-value` | the item's value | items in a value-carrying group |
| `data-readonly` | present / absent | readonly-capable inputs |
| `data-invalid` | present / absent | date and time fields |
| `data-selected` | present / absent | select, combobox and calendar items |
| `data-highlighted` | present / absent | the keyboard-focused item in a list |
| `data-placeholder` | present / absent | a trigger or value with nothing chosen |
| `data-side` / `data-align` | resolved placement | floating content |
| `data-starting-style` / `data-ending-style` | present during a transition | animated surfaces |

Boolean attributes are present-or-absent, so the selector is `[data-disabled]`, never `[data-disabled="true"]`. In Tailwind that reads `data-disabled:opacity-50` and `data-[state=open]:rotate-180`.

Beyond that shared set each component adds its own — `data-status` on `Avatar.Root` (`loading` / `loaded` / `error`), `data-motion` on navigation-menu content, `data-bounded` and `data-position` on slider ticks, the day-cell family on calendars. Fetch `https://bits-ui.com/docs/components/<name>/llms.txt` rather than guessing which parts carry which.

## CSS variables

Measurements the component takes at runtime and hands back:

| Variable | Where |
|---|---|
| `--bits-<name>-anchor-width` / `-anchor-height` | floating content — the trigger's size, for matching a dropdown to its trigger |
| `--bits-<name>-content-available-width` / `-available-height` | floating content — space left before the viewport edge, for `max-height` |
| `--bits-<name>-content-transform-origin` | floating content — the origin to scale from, so the animation grows out of the trigger |
| `--bits-accordion-content-height` / `-width` | accordion content, for height animation |
| `--bits-collapsible-content-height` / `-width` | collapsible content |
| `--bits-dialog-depth` / `--bits-dialog-nested-count` | nested dialogs |
| `--bits-navigation-menu-viewport-width` / `-height` | navigation menu viewport |
| `--bits-scroll-area-thumb-width` / `-height`, `--bits-scroll-area-corner-width` / `-height` | scroll area |
| `--bits-pin-input-root-height` | pin input |
| `--bits-command-list-height` | command list |
| `--scrollbar-width` | `<body>`, only while a surface with `preventScroll` is open — unprefixed, and removed on close. Pad fixed elements with it so they do not jump when the scrollbar disappears |

`<name>` is the component: `--bits-select-anchor-width`, `--bits-popover-content-available-height`, `--bits-dropdown-menu-content-transform-origin`. Every floating component declares its own namespaced alias on the content element, each pointing at a generic `--bits-floating-*` variable set on the positioning wrapper. Either name resolves from the content; the namespaced one is what the docs use.

```css
[data-select-content] {
	width: var(--bits-select-anchor-width);
	max-height: var(--bits-select-content-available-height);
	transform-origin: var(--bits-select-content-transform-origin);
}
```

Height animation needs the measured variable, because `height: auto` cannot be transitioned:

```css
[data-accordion-content] {
	overflow: hidden;
	transition: height 200ms ease-out;
}
[data-accordion-content][data-state='open'] {
	height: var(--bits-accordion-content-height);
}
[data-accordion-content][data-state='closed'] {
	height: 0;
}
```

## Enter and exit animation

Content unmounts on close, so an exit animation needs the element to outlive the state change. Bits UI arranges that: on close it calls `getAnimations()` on the content element and waits for every one to finish before unmounting. That covers CSS animations and, since `2.17`, CSS transitions.

Two attributes drive it. On open, `data-starting-style` is present for one frame and then removed — transition away from it. On close, `data-ending-style` is present until the animation completes.

```css
[data-popover-content] {
	opacity: 1;
	transform: scale(1);
	transition:
		opacity 150ms ease,
		transform 150ms ease;
}
[data-popover-content][data-starting-style],
[data-popover-content][data-ending-style] {
	opacity: 0;
	transform: scale(0.96);
}
```

The keyframe form keys off `data-state` instead and is held open the same way:

```css
[data-popover-content][data-state='open'] {
	animation: fade-in 150ms ease-out;
}
[data-popover-content][data-state='closed'] {
	animation: fade-out 150ms ease-in;
}
```

**Put the animation on the element the part renders.** `getAnimations()` runs without `{ subtree: true }`, so an animation on an inner wrapper does not hold the unmount and the exit is cut off mid-flight — it reads as a snap. When a child has to animate, give the part's own element a transition as well.

Nothing in Bits UI consults `prefers-reduced-motion` — every animation you add is one you also have to disable.

## Svelte transitions

Svelte's `transition:` directive applies to elements, so it needs `forceMount` plus `child` — Bits UI keeps the element mounted and hands you `open` to gate on:

```svelte
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fly } from 'svelte/transition';
</script>

<Dialog.Content forceMount>
	{#snippet child({ props, open })}
		{#if open}
			<div {...props} transition:fly={{ y: 8 }}>Content</div>
		{/if}
	{/snippet}
</Dialog.Content>
```

Floating content adds the wrapper level — see [overlays.md](overlays.md). Wrap the pattern in a component once rather than repeating it at every call site.

Prefer the CSS route. It is fewer moving parts, it survives `child` delegation, and since `2.17` it no longer costs you the exit animation.

## Scoped styles

A part rendered by Bits UI sits outside your component's style scope, so a bare `.foo` rule in `<style>` never reaches it. Two ways in: `:global([data-select-content]) { … }`, or bring the element into scope with `child` and put your own class on it.
