---
name: tailwind-css
description: Tailwind CSS v4 — utility classes, CSS-first theming with @theme, custom utilities and variants, dark mode, container queries, and v3→v4 upgrades. Use when writing or reviewing class attributes, editing app.css, or upgrading from Tailwind v3.
version: 2.2.0
scope: styling
distribution: author-only
---

# Tailwind CSS v4

Verified against **tailwindcss 4.3.3**. Everything added after 4.0 is tagged `4.1` / `4.2` / `4.3` at the point of use. Check the installed version before reaching for one — a utility from a later release lints as unknown and emits nothing.

## Where to look

| File | Read it for |
|---|---|
| [setup.md](references/setup.md) | install, `@tailwindcss/vite`, `app.css` entrypoint, `@source` scanning, `@reference` in Svelte `<style>`, the forms plugin's global input reset, production builds |
| [theme.md](references/theme.md) | `@theme` and its `inline` / `static` / `reference` options, the namespace table, why a plain `:root` outranks it, `--spacing`, `--alpha()`, resetting namespaces |
| [utilities.md](references/utilities.md) | the canonical-class rule, which named scales get retuned, and what `4.1`–`4.3` added: `text-shadow-*` `mask-*` `*-safe` `scrollbar-*` `zoom-*` `tab-*` logical properties |
| [variants.md](references/variants.md) | every variant, `group`/`peer`, `not-*` `in-*` `**:` `starting:`, plus `@custom-variant`, `@utility` with `--value()`, `@plugin` |
| [layout.md](references/layout.md) | breakpoints, container queries (`@container`, `@sm:`, `@max-md:`, `@container-size`), grid and flex |
| [dark-mode.md](references/dark-mode.md) | `@custom-variant dark`, the FOUC-blocking script, runtime token swapping with `@theme inline` |
| [animations.md](references/animations.md) | `--animate-*` and `@keyframes` inside `@theme`, `transition-*`, `starting:`, `motion-reduce:` |
| [migration.md](references/migration.md) | `bunx @tailwindcss/upgrade`, every v3→v4 breaking change, the `4.2` `start-*`/`end-*` deprecation |
| [troubleshooting.md](references/troubleshooting.md) | symptom-first: classes missing, `@apply` erroring, FOUC, dev-vs-prod differences |

## Working rules

**The documented numbers are not necessarily the project's numbers.** `@theme` emits into `@layer theme`, and an unlayered `:root` block outranks every layer — so a theme-namespaced variable declared in plain `:root` retunes the existing utility while generating none of its own. That is how `text-sm`, `rounded-sm`, or `2xl:` ends up at a value the Tailwind docs never mention. Read the project's CSS before quoting one. The same ranking makes same-name aliases load-bearing: a `:root` declaration paired with `--radius-sm: var(--radius-sm)` inside `@theme inline` resolves only because `:root` wins, and folding the pair together leaves the alias pointing at itself and silently empties the token. [theme.md](references/theme.md) has both halves.

**`enforce-canonical-classes` is one autofix covering five rewrites** — `w-[384px]` → `w-96`, `bg-[var(--brand)]` → `bg-(--brand)`, `!text-red-500` → `text-red-500!`, `flex-shrink-0` → `shrink-0`, and `h-4 w-4` → `size-4`. Write the markup and let `eslint --fix` land the rest; the px half of it needs `rootFontSize` in the plugin's settings, and silently stops rewriting when that is missing. **It reports at `warn`, and ESLint exits 0 when only warnings remain — so a lint step passes green with the whole list still on screen. Read the output, not the exit code.** `no-unknown-classes` and `no-conflicting-classes` are the two that actually fail. [utilities.md](references/utilities.md) is for getting it right first time, not a table to grind through.

**Point Prettier's class sorter at the CSS entrypoint.** `prettier-plugin-tailwindcss` reads `tailwindStylesheet`; without it the sorter never sees the theme, so every class that `@theme` or `@utility` defines is unknown to it and gets hoisted to the front of the attribute. Set it, and the output matches `enforce-consistent-class-order` exactly — that rule reads the same file through the ESLint plugin's `entryPoint`. Run one sorter, disable the other, and take the order it produces; attribute order never decides which utility wins.

**There is no official Tailwind MCP server and no `llms.txt`.** `tailwindcss.com/llms.txt`, `/llms-full.txt` and `/AGENTS.md` all 404, the MCP request sits unanswered, and Tailwind Labs' own agent ruleset is a non-redistributable sponsor perk. For API details beyond these files use **Context7** (`resolve-library-id` → `query-docs` on `tailwindlabs/tailwindcss.com`) or fetch `tailwindcss.com/docs/*` directly. Community "Tailwind MCP" servers are unofficial and stale — don't install one.

## Corrections to common assumptions

Training data is saturated with Tailwind v3, and with confident claims that were never true in any version. The ones that actually produce broken code:

- **There is no `tailwind.config.js`.** No `content`, no `safelist`, no `darkMode`, no `theme.extend`. Source files are discovered automatically; theming is `@theme`. `@config` exists only as a v3 escape hatch and cannot restore `safelist`, `corePlugins`, or `separator`.
- **Safelisting is `@source inline("bg-red-500")`**, with brace expansion — `@source inline("{hover:,}bg-red-{50,{100..900..100},950}")`. There is no `safelist` key and no `@utility safe(...)` directive.
- **`@tailwind base/components/utilities` was removed.** One `@import "tailwindcss";`. Nothing "still accepts" the old directives.
- **`@apply` is not deprecated.** It's discouraged for re-creating utilities you could have written inline, but it is fully supported and is the right tool for styling third-party markup you don't control.
- **`@apply` inside a Svelte `<style>` block needs `@reference "../app.css";` at the top of that block** — otherwise it errors on unknown utilities. This is the actual fix; "move it to global CSS" is not.
- **Dark mode is `@custom-variant dark (&:where(.dark, .dark *));`** in your CSS. `darkMode: 'class'` is a v3 config key pointing at a config file that no longer exists.
- **`@custom-variant` defines a variant; `@variant` applies one inside a rule.** Two different directives, routinely conflated.
- **`@utility` names cannot contain a colon.** `@utility card:hover` is invalid — nest `&:hover { … }` inside `@utility card`.
- **CSS variables in arbitrary values use parentheses:** `bg-(--brand)`. The v3 `bg-[--brand]` still compiles — to `background-color: --brand`, invalid CSS the browser drops — and lint only warns, so nothing stops it reaching production.
- **Vite plugin order is not load-bearing.** The docs show `tailwindcss()` before `sveltekit()`, but state no requirement, and the order is *not* the cause of missing classes, FOUC, or dev/prod differences — [troubleshooting.md](references/troubleshooting.md) has the real causes.
- **Container queries are core.** Don't install `@tailwindcss/container-queries`; it's v3-only.
- **`theme()` is deprecated.** Read tokens as `var(--color-blue-500)`; the v4 functions are `--alpha()` and `--spacing()`.
- **Reach for the shipped utility before writing CSS:** `scrollbar-*` and `tab-*` (`4.3`), `text-shadow-*`, `wrap-break-word`, `pointer-coarse:`/`pointer-fine:` (`4.1`), plus `text-balance`, `scroll-smooth`, `line-clamp-*`, `landscape:`, `rtl:`, `supports-*`, `motion-reduce:`, `open:`, `has-*`.
- **Three defaults changed and will shift your design:** borders default to `currentColor` (not `gray-200`), `ring` is 1px (was 3px), and `hover:` only applies under `@media (hover: hover)`.

## Related skills

- **svelte-sveltekit** — Svelte 5 / SvelteKit 2 itself; the MCP server and `svelte-autofixer` live there
- **bits-ui** — headless components whose parts you style with these utilities
- **shadcn-svelte-ui** — component registry built on this theming model
- **gsap-svelte5** — animation past what `transition-*` and `animate-*` can express
