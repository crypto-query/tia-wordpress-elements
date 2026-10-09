---
title: "Migration"
summary: "Running @tailwindcss/upgrade, every v3→v4 breaking change including the ones the codemod can't see, and the 4.2 start-*/end-* deprecation."
verified_against: "tailwindcss 4.3.3, @tailwindcss/upgrade 4.3.3"
docs: ["/docs/upgrade-guide", "/blog/tailwindcss-v4-2"]
---

# Migration

## Run the codemod first

```sh
git switch -c tailwind-v4
bunx @tailwindcss/upgrade
```

It updates dependencies, converts `tailwind.config.js` into `@theme` in your CSS, rewrites renamed utilities across templates, and removes the PostCSS scaffolding. The tool itself needs **Node 20+** on the machine — it shells out to Node regardless of which runner starts it, so a Node-less environment fails here even when the rest of the toolchain runs on bun. Do not hand-migrate first — the tool handles the mechanical majority, and a half-migrated tree gives it less to work with.

Then read the diff and open the app. What follows is what to look for, split by whether the codemod can see it.

One caveat before you run it: the codemod rewrites class names in **every** file it scans, including markdown that merely *documents* v3 syntax. Put `@source not` exclusions on your prose and documentation directories first, and keep them in place across the upgrade, or the tool will silently rewrite the examples inside them.

## Setup changes

- `@tailwind base/components/utilities` → a single `@import "tailwindcss";`
- `tailwind.config.js` → `@theme` in CSS. `@config "../../tailwind.config.js"` keeps the old file working during a staged migration, but cannot restore `safelist`, `corePlugins`, or `separator`.
- Delete `postcss.config.js`, and drop `postcss-import` and `autoprefixer` — both are built in.
- The package split: `@tailwindcss/vite` for Vite, `@tailwindcss/postcss` for PostCSS, `@tailwindcss/cli` for the CLI, `@tailwindcss/webpack` for webpack (`4.2`). Plain `tailwindcss` is no longer any of them.
- `content: []` → automatic detection, with `@source` for the edges and `@source inline()` in place of `safelist`.
- `resolveConfig()` is gone. Read theme values as CSS variables.
- Sass, Less, and Stylus are unsupported — Tailwind is the preprocessor now.
- Browser floor: Safari 16.4, Chrome 111, Firefox 128. v4 leans on `@property` and `color-mix()`, so there is no polyfill path.

## Removed utilities

| v3 | v4 |
|---|---|
| `bg-opacity-50` and every `*-opacity-*` | slash modifier — `bg-black/50` |
| `flex-shrink-*` / `flex-grow-*` | `shrink-*` / `grow-*` |
| `overflow-ellipsis` | `text-ellipsis` |
| `decoration-slice` / `decoration-clone` | `box-decoration-slice` / `box-decoration-clone` |

## Renamed utilities

The scale shifted down to make room for a new `xs` step, so **every bare name now means one size smaller than it used to**:

| v3 | v4 |
|---|---|
| `shadow-sm` → | `shadow-xs` |
| `shadow` → | `shadow-sm` |
| `drop-shadow-sm` → | `drop-shadow-xs` |
| `drop-shadow` → | `drop-shadow-sm` |
| `blur-sm` → | `blur-xs` |
| `blur` → | `blur-sm` |
| `backdrop-blur-sm` → | `backdrop-blur-xs` |
| `backdrop-blur` → | `backdrop-blur-sm` |
| `rounded-sm` → | `rounded-xs` |
| `rounded` → | `rounded-sm` |
| `outline-none` → | `outline-hidden` |
| `ring` → | `ring-3` |

This is why a project that "upgraded fine" looks subtly flatter: every un-suffixed `shadow` and `rounded` silently became a size smaller. The codemod handles these in class attributes; it cannot see them inside a string built at runtime.

## Changed defaults

These produce visual differences with no class change at all, so the codemod can't help.

- **Border colour** is `currentColor`, not `gray-200`. A bare `border` now inherits text colour. Add the colour explicitly.
- **Ring** is 1px `currentColor`, not 3px `blue-500`. `focus:ring` becomes `focus:ring-3 focus:ring-blue-500`.
- **Buttons** get `cursor: default`, not `cursor: pointer`. Add `cursor-pointer` if you want the old feel.
- **Placeholder** colour is current text at 50% opacity, not `gray-400`.
- **`hover:` only applies under `@media (hover: hover)`.** Touch devices no longer get sticky hover states — usually the fix, occasionally a regression if hover was carrying meaning. Pair with `active:` for touch.
- **`space-y-*` and `divide-*` changed selector**, from `> :not([hidden]) ~ :not([hidden])` to `> :not(:last-child)`, and now set `margin-bottom` rather than `margin-top`. Noticeably faster on large lists, but it breaks with reversed flex containers and with children that were relying on the old sibling combinator. `gap-*` avoids the whole question.
- **Gradients persist across variants.** `dark:from-blue-500` no longer clears an inherited `via-*`; reset it explicitly with `dark:via-none`.
- **`transition` and `transition-colors` now include `outline-color`**, so an outline that appears on hover animates from the wrong colour unless you set it unconditionally.
- **`hidden` attribute beats display utilities** in preflight now.

## Syntax changes

- **Variables in arbitrary values take parentheses:** `bg-(--brand)`, not `bg-[--brand]`.
- **The `!` important modifier moved to the end:** `bg-red-500!`, not `!bg-red-500`.
- **Variant stacking runs left to right**, matching CSS. `first:*:pt-0` becomes `*:first:pt-0`.
- **Commas in arbitrary values became underscores:** `grid-cols-[max-content_auto]`.
- **Prefixes are now leading variants:** `tw:flex tw:hover:bg-red-600`.
- **Individual transforms reset individually:** `focus:transform-none` becomes `focus:scale-none`.
- **`theme()` takes variable names** where it survives at all: `theme(--breakpoint-xl)`. Prefer `var(--color-blue-500)` everywhere else.
- **`@layer utilities` → `@utility`.** A class in `@layer utilities` is not variant-aware, so `hover:` and `md:` silently do nothing to it.
- **`@apply` in a Svelte `<style>` block needs `@reference "../app.css";`** — see [setup.md](setup.md). This is the most common post-upgrade build error in a Svelte project.
- **`container` lost its `center` and `padding` options.** Redefine it: `@utility container { margin-inline: auto; padding-inline: 2rem; }`

## Since 4.0

- **`4.2` deprecates `start-*` and `end-*`** in favour of `inset-s-*` and `inset-e-*`. They still work and emit a warning.
- Nothing else in `4.1`, `4.2`, or `4.3` is breaking — they are additive. [utilities.md](utilities.md) has what they added.

## Verifying

```sh
eslint .          # no-deprecated-classes and no-unknown-classes catch stragglers
vite build && vite preview
```

`eslint-plugin-better-tailwindcss` is the useful safety net here: `no-deprecated-classes` flags surviving v3 names and `no-unknown-classes` flags anything the codemod mangled into a class that no longer resolves. Between them they cover most of what a visual pass would catch, so run the lint before eyeballing pages.

Then look at the app, specifically: anything with a bare `border`, anything with `shadow` or `rounded` un-suffixed, focus rings, buttons (the cursor), and any list using `space-y-*`.
