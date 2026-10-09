---
title: "Responsive layout"
summary: "Viewport breakpoints, container queries including named containers and @container-size, and the grid/flex utilities worth knowing."
verified_against: "tailwindcss 4.3.3"
docs: ["/docs/responsive-design", "/docs/grid-template-columns", "/docs/flex"]
---

# Responsive layout

## Breakpoints

Mobile-first: an unprefixed utility applies everywhere, a prefixed one applies from that width up.

| Variant | Applies from |
|---|---|
| `sm:` | 640px |
| `md:` | 768px |
| `lg:` | 1024px |
| `xl:` | 1280px |
| `2xl:` | 1536px |

**Breakpoints are among the most commonly retuned scales**, and a project may add steps the stock set has no name for. Read the `--breakpoint-*` declarations in the project's CSS before trusting this table — including any in a plain `:root` block, which outranks `@theme` without generating anything of its own ([theme.md](theme.md)). A layout landing at the wrong width is almost always this.

`max-md:` inverts a breakpoint (below 768px). Stack the two for a band — `md:max-xl:flex-col` applies only between 768px and 1280px. One-offs need no declaration at all: `min-[900px]:grid`, `max-[60rem]:hidden`.

Add or replace breakpoints in `@theme`:

```css
@theme {
    --breakpoint-3xl: 120rem;
    --breakpoint-sm: initial; /* remove one */
}
```

**Don't reimplement breakpoints in JavaScript.** A `window.innerWidth` listener driving `isMobile` is a resize handler, a hydration mismatch, and a layout shift, all to reproduce `md:`. Reach for JS only when the two branches render genuinely different component trees rather than different styling — and then prefer Svelte's `MediaQuery` from `svelte/reactivity` over a hand-rolled listener.

## Container queries

Breakpoints ask how wide the viewport is. Container queries ask how wide *this element's container* is, which is what you actually want for a card that appears in both a sidebar and a full-width grid.

```svelte
<div class="@container">
    <div class="flex flex-col @md:flex-row">…</div>
</div>
```

Core in v4 — no plugin. The size scale is the `--container-*` namespace, shared with `max-w-*`: `@3xs` 16rem through `@7xl` 80rem.

```svelte
<!-- below a container size -->
<div class="@max-md:flex-col">

<!-- a band -->
<div class="@sm:@max-md:flex-col">

<!-- one-off -->
<div class="@min-[475px]:flex-row">
```

**Named containers** disambiguate nesting — without a name, a variant binds to the nearest `@container` ancestor:

```svelte
<div class="@container/main">
    <div class="@container/card">
        <p class="@sm/card:text-lg @lg/main:text-xl">…</p>
    </div>
</div>
```

**Container query units** reference the container instead of the viewport: `w-[50cqw]`, `text-[4cqi]`. Units that depend on block size (`cqb`, `cqh`) need a size container rather than the default inline-size one — that's `@container-size` (`4.3`):

```svelte
<div class="@container-size">
    <div class="h-[50cqb]">…</div>
</div>
```

Size containment is stricter than inline-size containment: the element can no longer be sized by its own content. Use `@container` unless you specifically need `cqb`/`cqh`.

Add sizes through the shared namespace:

```css
@theme {
    --container-8xl: 96rem; /* enables @8xl: and max-w-8xl */
}
```

## Grid and flex

```svelte
<!-- responsive column count -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">

<!-- let the grid decide how many fit -->
<div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">

<!-- fixed sidebar, fluid main -->
<div class="grid grid-cols-[250px_1fr]">

<!-- spans -->
<div class="col-span-2 row-span-full">
```

`subgrid` is available (`grid-cols-subgrid`, `grid-rows-subgrid`) and is the clean fix for aligning content across sibling cards.

For flex, the v4 names are `shrink-0` and `grow` — v3's `flex-shrink-0` / `flex-grow` are gone. `flex-1` remains the shorthand for filling remaining space.

Two alignment notes worth acting on:

- **`*-safe` (`4.1`)** — `justify-center-safe` and `items-center-safe` degrade to `start` rather than overflowing in both directions. For anything whose content can outgrow its box, this is a strictly better default than plain `-center`.
- **`gap` beats space-between utilities.** `space-x-*` works by margining every child but the first, which breaks under `flex-wrap` and with `{#each}` blocks that reorder. `gap-4` has neither problem.

## Page-level

```svelte
<!-- full-height shell with a footer that stays down -->
<div class="flex min-h-screen flex-col">
    <header>…</header>
    <main class="flex-1">…</main>
    <footer>…</footer>
</div>

<!-- centred, gutter-safe content column -->
<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">…</div>
```

Prefer `min-h-dvh` over `min-h-screen` where mobile browser chrome matters — `dvh` tracks the dynamic viewport, so the layout doesn't jump as the URL bar hides.
