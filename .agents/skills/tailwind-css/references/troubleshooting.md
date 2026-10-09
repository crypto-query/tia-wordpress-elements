---
title: "Troubleshooting"
summary: "Symptom-first index of Tailwind v4 failures — missing classes, @apply errors, FOUC, dev-vs-prod differences, specificity fights — with the real cause of each."
verified_against: "tailwindcss 4.3.3, @tailwindcss/vite 4.x, SvelteKit 2"
docs: ["/docs/detecting-classes-in-source-files", "/docs/functions-and-directives"]
---

# Troubleshooting

Start from the symptom, and start with ESLint: `no-unknown-classes` and `no-conflicting-classes` name the cause outright for the two most common failures. One thing to rule out up front — Vite plugin order (`tailwindcss()` versus `sveltekit()` in `vite.config.ts`) is convention, and swapping it causes none of the symptoms below.

## One specific class does nothing

**The class name isn't literally in a source file.** The scanner reads text; it does not evaluate JavaScript. `class="bg-{color}-500"` and `` class={`text-${size}`} `` produce nothing at all.

```svelte
<!-- invisible to the scanner -->
<div class="bg-{color}-500">

<!-- visible: complete strings -->
<script>
    const tone = { ok: "bg-green-500", bad: "bg-red-500" };
</script>
<div class={tone[status]}>
```

If the class genuinely only exists at runtime — coming from a CMS, a database, a `@html` block — safelist it:

```css
@source inline("bg-{red,green,blue}-500");
```

**The file isn't being scanned.** Automatic detection skips `.gitignore`d paths and `node_modules`. A component in an ignored directory or a linked workspace package needs an explicit `@source "../packages/ui";`. Check any `@source not` block in your CSS as well — a file added under an excluded path goes dark.

**The class doesn't exist.** `no-unknown-classes` is exactly this check. Usually a v3 name (`flex-shrink-0`, `overflow-ellipsis`) or a utility from a release newer than the installed one.

## Two classes fight, the wrong one wins

Utilities all live in the same layer with equal specificity, so **source order decides**, not the order you wrote them in the class attribute. `class="p-8 p-4"` is not "p-4 wins" — it's whichever Tailwind emitted last.

`no-conflicting-classes` finds these. The fix is to remove the loser, not to add `!`.

When a utility loses to *your own* CSS, the CSS is the problem — put element defaults in `@layer base` so utilities outrank them:

```css
@layer base {
    h1 {
        font-size: var(--text-2xl);
    }
}
```

Unlayered CSS beats every layer, so a stray `h1 { }` outside `@layer base` will always win. `!` on the utility is the escape hatch — and in v4 it goes at the end: `text-3xl!`.

## A utility resolves, but to the wrong value

Expect this whenever a number disagrees with the Tailwind docs. A theme redeclaring `--text-*`, `--leading-*`, `--radius-*`, `--shadow-*`, or `--breakpoint-*` in a plain `:root` block outranks the `@layer theme` that `@theme` emits into, so the utility resolves to the project's value instead of the documented one. Nothing is broken; the docs are simply not the source of truth once a project themes this way. [theme.md](theme.md) has the mechanism, the project's CSS has the numbers.

The same mechanism explains a variable that looks declared but yields no class: only `@theme` generates utilities, so `--text-md: 14px` in `:root` gives you no `text-md`.

## `@apply` errors on an unknown utility

Inside a Svelte `<style>` block, the block compiles in isolation and knows nothing about your theme. Add `@reference "../app.css";` at the top of it — [setup.md](setup.md) has the shape, and the cheaper alternative of reading the variable directly.

If `@apply` fails in `app.css` itself, the utility is being applied before it exists: `@apply` can only reach utilities defined earlier, so custom `@utility` blocks must precede any `@apply` that uses them.

## No styles at all

Check in this order:

1. `app.css` is imported in `src/routes/+layout.svelte`, not in a page.
2. `app.css` begins with `@import "tailwindcss";` — not `@tailwind base;`, which v4 removed and silently ignores.
3. `@tailwindcss/vite` is installed and in `plugins`.
4. No surviving `postcss.config.js` from a v3 setup, competing with the Vite plugin.

## Flash of unstyled content

CSS imported in a page component instead of the root layout loads after that page's HTML. Move it to `+layout.svelte`.

If the flash is a *theme* flash — correct layout, wrong colours, for one frame — the cause is the theme class landing after first paint. That needs the blocking inline script in [dark-mode.md](dark-mode.md); no amount of CSS import shuffling fixes it.

## Works in dev, not in production

Almost always a class that was never really detected. Dev is forgiving because the scanner has seen every file you happened to touch; a clean production build starts from nothing. Reproduce it properly:

```sh
rm -rf .svelte-kit node_modules/.vite
bun install
vite build && vite preview
```

Then inspect what shipped:

```sh
CSS=.svelte-kit/output/client/_app/immutable/assets
ls -lh $CSS/*.css
grep -c 'YOUR-CLASS' $CSS/*.css
```

A stylesheet far larger than expected means an `@source` is dragging in a directory of markup you don't ship — prose and documentation directories being the usual culprits.

## A custom utility ignores `hover:` or `md:`

It was defined in `@layer utilities` (v3) rather than `@utility` (v4). Only `@utility` registers a utility so variants compose onto it. Same story for a custom variant defined with `@variant` instead of `@custom-variant` — see [variants.md](variants.md).

## The design shifted after upgrading from v3

Not a bug. Bare `shadow`, `rounded`, and `blur` each mean one size smaller in v4, borders default to `currentColor`, rings are 1px, and buttons lost `cursor: pointer`. [migration.md](migration.md) has the full list and what to check.

## Diagnosing anything else

```sh
eslint .                     # unknown, conflicting, deprecated, duplicate classes
bunx @tailwindcss/cli@$(bun -e 'console.log(require("tailwindcss/package.json").version)') \
  -i src/app.css -o /tmp/out.css
```

**Pin that version.** A bare `bunx @tailwindcss/cli` fetches the newest release, not the one the app builds with. The isolated compile then resolves utilities the app cannot, which either invents a discrepancy or hides the one you were chasing. The `bun -e` reads the installed version; `bun pm view` would give you the registry's latest, which is the bug.

Compiling `app.css` on its own separates a Tailwind problem from a Vite or SvelteKit one: if the CSS is correct in `/tmp/out.css` but wrong in the browser, Tailwind is not the layer at fault, and the `svelte-sveltekit` skill's `troubleshooting.md` is the next stop.
