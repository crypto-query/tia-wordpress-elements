---
title: "Theming"
summary: "@theme and its inline/static/reference options, the full namespace table, the --spacing base, --alpha() and --spacing() functions, namespace resets, and where tokens should live."
verified_against: "tailwindcss 4.3.3"
docs: ["/docs/theme", "/docs/colors", "/docs/functions-and-directives"]
---

# Theming

`@theme` is where design tokens live in v4. A variable declared there does two things at once: it is emitted as a CSS custom property on `:root`, and it generates utilities. Define `--color-primary` and you get `bg-primary`, `text-primary`, `border-primary`, `ring-primary`, `fill-primary`, `divide-primary`, and the rest of the colour family — for free, with no arbitrary-value syntax.

```css
@import "tailwindcss";

@theme {
    --color-primary: oklch(0.55 0.2 260);
    --color-surface: #ffffff;

    --font-display: "Poppins", sans-serif;

    --breakpoint-3xl: 120rem;
    --radius-4xl: 2rem;
    --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
}
```

`@theme` must sit at the top level of your CSS — not nested inside a selector or a media query.

## Namespaces

The namespace decides which utilities a variable generates. Inventing a namespace does nothing; only these are wired up.

| Namespace | Generates |
|---|---|
| `--color-*` | `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `stroke-*`, `shadow-<color>`, … |
| `--font-*` | `font-sans`, `font-display` |
| `--text-*` | `text-xl` (font size, with optional line-height/tracking/weight sub-keys) |
| `--font-weight-*` | `font-bold` |
| `--tracking-*` | `tracking-wide` |
| `--leading-*` | `leading-tight` |
| `--breakpoint-*` | `sm:`, `md:`, `3xl:` responsive variants |
| `--container-*` | `@sm:` container-query variants **and** `max-w-md` |
| `--spacing-*` | named spacing steps; the bare `--spacing` drives the whole numeric scale |
| `--radius-*` | `rounded-sm` |
| `--shadow-*` | `shadow-md` |
| `--inset-shadow-*` | `inset-shadow-xs` |
| `--drop-shadow-*` | `drop-shadow-md` |
| `--text-shadow-*` | `text-shadow-sm` · `4.1` |
| `--blur-*` | `blur-md`, `backdrop-blur-md` |
| `--perspective-*` | `perspective-near` |
| `--zoom-*` | `zoom-compact` · `4.3` |
| `--tab-size-*` | `tab-github` · `4.3` |
| `--aspect-*` | `aspect-video` |
| `--ease-*` | `ease-out` |
| `--animate-*` | `animate-spin` |
| `--background-image-*` | `bg-<name>` setting `background-image` — gradients, not colours |

The colour utility is `shadow-<color>`, distinct from the size utility `shadow-md` fed by `--shadow-*`; the same split applies to `inset-shadow`, `drop-shadow`, and `text-shadow`.

A variable outside these namespaces is dropped from the output and generates nothing — silently, with no warning. The near-miss that catches people is **`--font-size-*`, which is not a namespace**: font sizes are `--text-*`. `--duration-*` and `--z-*` are not namespaces either; those utilities take bare values. A block of them in `@theme` looks like configuration and is dead weight, so check any unfamiliar prefix against the table above before trusting it.

## The spacing scale

One variable generates the entire numeric scale:

```css
@theme {
    --spacing: 0.25rem; /* the default: 4px */
}
```

Every multiple exists without being declared — `p-1`, `p-4`, `mt-21`, `w-100`, `gap-7` all resolve to `calc(var(--spacing) * n)`. There is no upper bound and no gaps, which is why an arbitrary pixel value is almost never justified: divide by 4 and use the number. Change `--spacing` and every spacing, sizing, and inset utility rescales together.

Named steps coexist with the numeric scale when a value is semantic rather than arithmetic:

```css
@theme {
    --spacing-section: 6rem; /* p-section, my-section, gap-section */
}
```

## Options

`@theme` takes modifiers that change what reaches the stylesheet.

### `@theme inline`

Use it when a token's value is a `var()` pointing at something else. Without `inline`, `bg-primary` compiles to `background-color: var(--color-primary)` — one extra hop, and the value is frozen wherever `--color-primary` was resolved. With `inline`, the utility embeds the referenced variable directly:

```css
@theme inline {
    --font-sans: var(--font-inter);
}
```

```css
/* generated */
.font-sans {
    font-family: var(--font-inter);
}
```

That indirection is the whole point for runtime theming: because the utility resolves `--font-inter` at use-site, redefining it under a `.dark` selector or a `[data-theme]` attribute changes every utility instantly, with no rebuild. This is the mechanism behind the token pattern in [dark-mode.md](dark-mode.md), and the reason shadcn-style themes declare their palette in `:root` and mirror it through `@theme inline`.

### `@theme static`

Normally unused theme variables are dropped from the output. `static` forces them out regardless:

```css
@theme static {
    --color-user-accent: #000000;
}
```

Reach for it when JavaScript sets the value at runtime, so nothing in your source ever mentions the class and the tree-shaker would otherwise remove it:

```js
document.documentElement.style.setProperty("--color-user-accent", picked);
```

### `@theme reference`

Declares a variable for use during compilation without emitting it. Good for scale factors and intermediate values that should never appear in the shipped CSS.

## Resetting

`initial` clears tokens, which is how you drop Tailwind's defaults rather than adding to them:

```css
@theme {
    --font-*: initial; /* drop every default font family */
    --font-sans: Inter, system-ui, sans-serif;
}
```

```css
@theme {
    --*: initial; /* start from nothing — component libraries, locked design systems */
    --spacing: 0.25rem;
    --color-primary: #3b82f6;
}
```

Clearing `--color-*` also removes `--color-white` and `--color-black`, so redeclare anything you still use.

## Reading tokens from CSS

Theme variables are ordinary custom properties, so custom CSS reads them directly:

```css
.custom {
    background: var(--color-primary);
    border-radius: var(--radius-md);
}
```

Spacing is the exception: **`var(--spacing-4)` does not exist.** Tailwind emits the single `--spacing` variable and computes every step arithmetically, so there is no `--spacing-1`, `--spacing-4`, or `--spacing-8` to read unless you declared that named step yourself. Use the function:

```css
.custom {
    color: --alpha(var(--color-lime-300) / 50%); /* → color-mix(in oklab, …) */
    margin: --spacing(4); /* → calc(var(--spacing) * 4) */
}
```

`--spacing()` also works inside arbitrary values: `py-[calc(--spacing(4)-1px)]`.

`theme('colors.blue.500')` is the deprecated v3 accessor. Use `var(--color-blue-500)`.

## `@theme` versus `:root`

`@theme` emits into `@layer theme`. A plain `:root` block is **unlayered**, and unlayered CSS outranks every layer — so where the same variable name appears in both, `:root` wins, whatever the file order. Two consequences, and a project that themes this way will show both.

**A theme-namespaced name declared in plain `:root` retunes the existing utility and generates nothing.** `--text-xs: 12px` in `:root` outranks Tailwind's `0.75rem` in the theme layer, so `text-xs` quietly carries the project's value rather than the documented one — which is why the scales in [utilities.md](utilities.md) and [layout.md](layout.md) are a starting point rather than the truth in any given codebase. It cuts the other way too: `--text-md: 14px` in `:root` looks like a token, but `text-md` is not a class, because only `@theme` generates. ESLint catches that one as `no-unknown-classes`.

**A same-name alias in `@theme inline` resolves only because of this**, and CSS-first themes are often full of them:

```css
:root {
    --radius-sm: 6px; /* unlayered — wins */
}
@theme inline {
    --radius-sm: var(--radius-sm); /* @layer theme — registers the name */
}
```

The alias is what makes `rounded-sm` exist; the value arrives from the `:root` declaration that outranks it. Folding those `:root` lines *into* `@theme` — the obvious tidy-up — leaves each alias pointing at itself with nothing to resolve against, and the token silently empties. Keep the two halves apart, or collapse each pair into one `@theme` declaration holding the literal value.

## Where tokens belong

`@theme` when you want a utility from it. `:root` when it is a one-off constant that no utility should exist for:

```css
:root {
    --sidebar-width: 250px;
}
```

```svelte
<aside class="w-(--sidebar-width)">…</aside>
```

Note the parentheses — that is the variable form of an arbitrary value; [utilities.md](utilities.md) has the rest of that syntax.

## Colours

Defaults ship in oklch, which is why v4 gradients interpolate more evenly than v3's. `4.2` added four neutral-adjacent ramps — `mauve`, `olive`, `mist`, `taupe` — alongside the existing greys.

Opacity is a slash modifier on any colour utility, and it works on your own tokens too: `bg-primary/50`, `text-white/75`, `border-primary/30`. The v3 `bg-opacity-*` family is gone.
