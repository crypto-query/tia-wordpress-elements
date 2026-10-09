---
title: "Setup"
summary: "Install, the Vite plugin, the app.css entrypoint, @source scanning and exclusion, @reference for Svelte <style> blocks, what @tailwindcss/forms restyles globally, and production builds."
verified_against: "tailwindcss 4.3.3, @tailwindcss/vite 4.x, SvelteKit 2, Vite 7"
docs: ["/docs/installation/framework-guides/sveltekit", "/docs/detecting-classes-in-source-files", "/docs/functions-and-directives"]
---

# Setup

## Install

```sh
bun add -d tailwindcss @tailwindcss/vite
```

Two packages, no PostCSS. `postcss.config.js`, `postcss-import`, and `autoprefixer` are all obsolete — v4 does prefixing itself via Lightning CSS. If any of them survive a v3 upgrade they will fight the Vite plugin; delete them.

Other entrypoints exist for non-Vite builds: `@tailwindcss/postcss`, `@tailwindcss/cli`, and `@tailwindcss/webpack` (`4.2`, roughly 2× faster than routing webpack through PostCSS). On Vite, use the Vite plugin.

## Wiring

`vite.config.ts`:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()]
});
```

The official SvelteKit guide shows this order but states no requirement, and swapping it does not break CSS. Treat plugin order as convention, not a fix — see [troubleshooting.md](troubleshooting.md) for what actually causes missing styles.

`src/app.css` starts with a single import:

```css
@import "tailwindcss";
```

Import it once, in the root layout, so it loads ahead of every route:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
    import "../app.css";
    let { children } = $props();
</script>

{@render children()}
```

Importing it in a `+page.svelte` instead is the usual cause of a flash of unstyled content.

## Source detection

v4 finds classes by itself. It walks up from the CSS file to the nearest project root, then scans everything below it, skipping `.gitignore`d paths, binaries, and `node_modules`. There is no `content` array to maintain.

You only reach for `@source` at the edges:

```css
/* Scan something automatic detection skips — a linked package, an ignored dir */
@source "../node_modules/@my-company/ui-lib";

/* Stop scanning a subtree entirely (4.1) */
@source not "../.agents";

/* Force classes into the build that no file literally contains (4.1) */
@source inline("underline");
@source inline("{hover:,}bg-red-{50,{100..900..100},950}");

/* Keep a class out even though something looks like it uses it (4.1) */
@source not inline("container");
```

`@source inline()` is the v4 replacement for v3's `safelist`, and brace expansion is what makes it practical for a colour ramp. There is no `safelist` key anywhere in v4, and no `@utility safe(...)` directive.

**Exclude directories that hold prose *about* Tailwind rather than markup** — documentation, agent instructions, design notes — with a block of `@source not` lines. A class name written in a document is indistinguishable from one written in a component, so it lands in the production stylesheet, and `@tailwindcss/upgrade` will rewrite the examples in those files during a migration. Add each new prose directory to that block as you create it.

## `@reference` — using `@apply` inside a Svelte `<style>` block

A Svelte component's `<style>` block is compiled on its own. It knows nothing about your theme, so `@apply` there fails on any utility it can't resolve. The fix is `@reference`, which pulls in theme variables, custom utilities, and custom variants **without emitting their CSS again**:

```svelte
<style>
    @reference "../app.css";

    h1 {
        @apply text-2xl font-bold text-primary;
    }
</style>
```

If you only need stock utilities and no project theme, `@reference "tailwindcss";` is lighter.

Referencing costs a re-parse of your CSS per component. When the value you want is just a token, skip `@apply` and read the variable directly — it is faster and needs no `@reference`:

```svelte
<style>
    h1 {
        font-size: var(--text-2xl);
        color: var(--color-primary);
    }
</style>
```

## Plugins

Load them from CSS; there is no `plugins: []` array:

```css
@plugin "@tailwindcss/forms";
@plugin "tailwindcss-animate";
@plugin "./plugins/brand-colors.js";
```

`@plugin` runs the legacy v3 JS plugin API, so it is the compatibility path — for anything you're writing yourself, `@utility` and `@custom-variant` in [variants.md](variants.md) are the native tools.

**`@tailwindcss/forms` with no options runs its `base` strategy**, which is worth knowing because it is invisible in the markup: every `input`, `select`, and `textarea` arrives styled with no class on it — white background, 1px grey border, square corners, `0.5rem`/`0.75rem` padding, 16px text. It emits into `@layer base`, so any utility you add outranks it. Two things follow. The corners ignore the project's `--radius-*` scale until you add a `rounded-*`, and the background is a literal `#fff` with no dark variant — a field on a dark surface stays white until you give it a `bg-*`.

Do **not** add `@tailwindcss/container-queries`; container queries are core in v4 and the plugin is v3-only.

## Build and verify

```sh
vite build
vite preview   # serve it and check the CSS actually loads
```

Minification and optimisation are on by default in a production build — there is nothing to configure. SvelteKit emits stylesheets under the client output, wherever your adapter puts it:

```sh
ls -lh .svelte-kit/output/client/_app/immutable/assets/*.css
```

An unexpectedly large stylesheet almost always means an over-broad `@source` pulling in a directory of markup you don't ship. A suspiciously small one means the opposite. Both are visible in that listing before they're visible in a browser.
