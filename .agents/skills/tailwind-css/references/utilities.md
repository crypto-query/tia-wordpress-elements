---
title: "Utilities"
summary: "The canonical-class rule — arithmetic and shorthand — the named scales you can't derive, arbitrary-value syntax, and every utility added in 4.1, 4.2 and 4.3."
verified_against: "tailwindcss 4.3.3"
docs: ["/blog/tailwindcss-v4-1", "/blog/tailwindcss-v4-2", "/blog/tailwindcss-v4-3", "/docs/adding-custom-styles"]
---

# Utilities

## Prefer the canonical class

An arbitrary value in brackets is a signal that the design system has been stepped around. Nearly always the utility already exists:

```svelte
<!-- stepping around the scale -->
<div class="w-[384px] min-h-[400px] gap-[8px] rounded-[16px] leading-[1.5] text-[14px]">

<!-- the same CSS, on the scale -->
<div class="w-96 min-h-100 gap-2 rounded-2xl leading-normal text-sm">
```

**Spacing, sizing and insets are pure arithmetic: divide the pixel value by 4.** `w-[220px]` → `w-55`, `gap-[8px]` → `gap-2`, `min-h-[400px]` → `min-h-100`. The scale is continuous and unbounded, so every multiple of 4px has a class, and `--spacing` in [theme.md](theme.md) is the one knob that moves all of them. This covers `w h size min-* max-* p* m* gap* inset* top right bottom left basis scroll-m* scroll-p*`.

**Collapse axis pairs into the shorthand:** `h-4 w-4` → `size-4`, `pt-3 pb-3` → `py-3`, `mt-2 mr-2 mb-2 ml-2` → `m-2`.

`enforce-canonical-classes` performs every rewrite on this page under `eslint --fix` — the arithmetic, the shorthand collapse, `bg-[var(--x)]` → `bg-(--x)`, `!p-4` → `p-4!`, and v3 names → v4 names. Know the rules so your first draft is clean; let the autofix land the rest.

An arbitrary value is right when the value genuinely isn't on any scale — `h-[calc(100vh-4rem)]`, `bg-[#1da1f2]` for a fixed brand colour, `grid-cols-[200px_1fr]`.

## The named scales

Unlike spacing, these are lookups rather than arithmetic. **Four families are retuned in most themed projects** — `rounded-*`, `text-*` (size), `leading-*`, and `shadow-*` — so read the `:root` and `@theme` blocks in the project's CSS for their real values before quoting a number, and expect extra named steps beside the stock ones. [theme.md](theme.md) explains why half of them tend to sit in `:root` and still take effect.

The families below are rarely touched and safe to work from:

| Family | Scale |
|---|---|
| `font-*` (weight) | `thin` 100 → `black` 900 in hundreds; `normal` 400, `medium` 500, `semibold` 600, `bold` 700 |
| `max-w-*` / `@container` | `3xs` 16rem · `2xs` 18 · `xs` 20 · `sm` 24 · `md` 28 · `lg` 32 · `xl` 36 · `2xl` 42 · `3xl` 48 · `4xl` 56 · `5xl` 64 · `6xl` 72 · `7xl` 80 |
| `border-*` (width) | bare `border` = 1px, then `border-2` `border-4` `border-8` |

`leading-*` also accepts spacing numbers (`leading-6` = 1.5rem), which is why both forms show up in real code.

## Arbitrary value syntax

```svelte
<div class="w-[220px]">           <!-- literal value: brackets -->
<div class="w-(--sidebar-width)"> <!-- CSS variable: parentheses -->
<div class="[mask-type:luminance]"> <!-- arbitrary property -->
<div class="bg-[url('/img/hero.png')]">
```

Parentheses for variables is a v4 change; the v3 `w-[--sidebar-width]` form no longer resolves. Underscores stand in for spaces — `grid-cols-[200px_1fr]`, `shadow-[0_2px_4px_rgb(0_0_0/0.1)]`.

Arbitrary values must be statically present in the source. `class="w-[{width}px]"` cannot work — Tailwind never sees the interpolated string. Use an inline `style` for genuinely dynamic numbers, and a lookup of complete class strings for a fixed set of options:

```svelte
<script>
    const tone = {
        success: "bg-green-500 text-white",
        danger: "bg-red-500 text-white"
    };
    let { status } = $props();
</script>

<div class={tone[status]}>…</div>
<div style="width: {width}px">…</div>
```

The failure mode is the same one that makes `class="bg-{color}-500"` produce no CSS: partial class names are invisible to the scanner. Complete strings in a map are visible.

## Composing classes in components

A component with variants is a lookup of complete class strings, resolved with `$derived`:

```svelte
<script lang="ts">
    import { twMerge } from "tailwind-merge";
    import type { Snippet } from "svelte";

    type Variant = "primary" | "secondary" | "danger";
    type Size = "sm" | "md" | "lg";

    let {
        variant = "primary",
        size = "md",
        class: className = "",
        children,
        ...rest
    }: { variant?: Variant; size?: Size; class?: string; children: Snippet } = $props();

    const variants: Record<Variant, string> = {
        primary: "bg-primary text-white hover:bg-primary/90",
        secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300",
        danger: "bg-red-600 text-white hover:bg-red-700"
    };

    const sizes: Record<Size, string> = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-3 text-lg"
    };

    let classes = $derived(
        twMerge(
            "rounded-lg font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2",
            variants[variant],
            sizes[size],
            className
        )
    );
</script>

<button class={classes} {...rest}>{@render children()}</button>
```

`twMerge` (from `tailwind-merge`) is what makes the `class` prop actually override. Plain concatenation gives you `px-4 px-8` in the attribute, and since utilities share one layer with equal specificity, **the winner is whichever Tailwind emitted last, not the one written last** — so a caller passing `px-8` gets it only by luck. `twMerge` resolves the conflict by dropping the earlier class outright.

Reach for it when a component accepts a `class` prop. Skip it for internal markup with no override path; it's runtime work for no benefit there.

## Added in 4.1

**`text-shadow-*`** — `2xs xs sm md lg`, with colours and opacity: `text-shadow-lg text-shadow-sky-300/50`.

**`mask-*`** — composable image masks. Directional linear (`mask-t-from-50%`, `mask-b-to-90%`, also `-r-` and `-l-`), radial (`mask-radial-from-80%`, `mask-radial-at-center`), conic, plus `mask-[url(…)]`.

**Overflow wrapping** — `wrap-break-word` breaks long words without breaking layout; `wrap-anywhere` allows mid-word breaks and is the one that fixes overflowing flex children.

**Safe alignment** — `justify-center-safe`, `items-center-safe` and the rest fall back to `start` instead of overflowing in both directions when content is too big. A near-free upgrade over plain `-center` for anything that can overflow.

**Colored drop shadows** — `drop-shadow-cyan-500/50`.

**Baseline** — `items-baseline-last`, `self-baseline-last`, for aligning to the last line of a multi-line label.

## Added in 4.2

**Logical properties**, completing the set for writing-mode-aware layout:

- block spacing — `mbs-*` `mbe-*` `pbs-*` `pbe-*` (and `scroll-mbs-*`, `scroll-pbe-*`, …)
- borders — `border-bs-*` `border-be-*`
- sizing — `block-*` `inline-*` `min-block-*` `max-block-*` `min-inline-*` `max-inline-*`
- insets — `inset-s-*` `inset-e-*` `inset-bs-*` `inset-be-*`

`start-*` and `end-*` are **deprecated** in favour of `inset-s-*` / `inset-e-*`. They still work and warn.

**`font-features-*`** — OpenType control: `font-features-['tnum']` for tabular figures, small caps, ligatures. Worth knowing for any table of numbers that jitters as values change.

**Colours** — `mauve`, `olive`, `mist`, `taupe`.

## Added in 4.3

On an older install these lint as unknown and emit nothing. Upgrade the build plugin and the compiler **together** — `@tailwindcss/vite` depends on an *exact* `tailwindcss` version, so bumping `tailwindcss` alone leaves the build running the old compiler while `no-unknown-classes` starts accepting the new utilities, and the class then vanishes from the stylesheet with nothing reporting it:

```sh
bun add -d tailwindcss@latest @tailwindcss/vite@latest
```

**`scrollbar-*`** — `scrollbar-thin` `scrollbar-none` `scrollbar-auto` for width, `scrollbar-thumb-*` and `scrollbar-track-*` for colour, `scrollbar-gutter-stable` to reserve the gutter and stop layout shifting when a scrollbar appears. This replaces the hand-rolled `::-webkit-scrollbar` utilities everyone used to write.

**`zoom-*`** — `zoom-75`, `zoom-[1.1]`, `zoom-(--preview-zoom)`.

**`tab-*`** — `tab-2`, `tab-8`, `tab-[12px]` for tab rendering in `<pre>`.

**`@container-size`** — a size container, so `cqb` and `cqh` units resolve; nameable as `@container-size/main`. See [layout.md](layout.md).
