---
name: shadcn-svelte-ui
description: shadcn-svelte 1.5 — the CLI and components.json, the Field and Form layout systems, composition and class rules for generated components, and the Tailwind v4 token layer. Use when running the shadcn-svelte CLI, adding or editing anything under the ui alias, or theming it.
version: 2.1.0
scope: integration
distribution: author-only
---

# shadcn-svelte

Verified against **shadcn-svelte 1.5.0** — CLI, registry and package — in a Svelte 5 / Tailwind v4 project with all 56 `registry:ui` items installed. Components are copied into the project as source, so **the file on disk is the authority**: over the registry, over the docs site, and over these files.

shadcn-svelte ships its own skill (`bunx skills add huntabyte/shadcn-svelte`). Its rules are re-verified here and its gaps filled, so installing it alongside this one only duplicates the load. It was last touched 2026-07-08 against a CLI that has shipped since; its flag tables and theming numbers are the halves that went stale, and both are corrected below.

## Where to look

| File | Read it for |
|---|---|
| [cli.md](references/cli.md) | verified flags per command, the hidden `update`, unattended `init`, preset strings, registry URLs, `components.json` keys, what gets installed |
| [composition.md](references/composition.md) | barrels and imports, which item to reach for, group parts, overlays and their triggers, dates, Card/Tabs/Avatar/Empty, wrapper components |
| [forms.md](references/forms.md) | `Field` layout, the validation attributes and their exact-match selectors, `InputGroup`, `ToggleGroup`, and the `Form` (superforms) layer |
| [styling.md](references/styling.md) | what `class` may carry, semantic tokens, `data-icon`, icon sizing, `cn()`, overlay stacking |
| [theming.md](references/theming.md) | the CSS imports, which tokens exist, the radius scale, the `data-*` variants, `data-slot`, dark mode, custom colors |

## Working rules

**Reach for a registry item before writing markup.** Callouts are `Alert`, empty states `Empty`, dividers `Separator`, loading placeholders `Skeleton`, status pills `Badge`, toasts `svelte-sonner`, spinners `Spinner`. 56 UI items ship; `bunx shadcn-svelte@latest add` with no arguments lists them all interactively. Custom markup is the fallback, not the default — [composition.md](references/composition.md) has the selection table.

**Read the installed component before writing its props.** The style (`nova` `vega` `maia` `lyra` `mira` `luma` `sera` `rhea`) rewrites the utility classes inside each `tv()` block — Rhea is deliberately denser than Luma — while leaving the variant and size *keys* identical. So a variant list is portable across styles and the geometry it produces is not. For prop names and worked examples, every component publishes `https://shadcn-svelte.com/docs/components/<kebab-name>.md` (~13 KB each; index at `/llms.txt`, ~11 KB). `/llms-full.txt` and `/AGENTS.md` both 404.

**Style through tokens, `data-slot` and built-in variants.** `class` carries layout — spacing, width, position. Colors and typography come from semantic tokens (`bg-primary`, `text-muted-foreground`) and from `variant` / `size`, so a theme change reaches every component at once. [styling.md](references/styling.md) is the rule set; [theming.md](references/theming.md) is the token layer under it.

**Commit before `update` or `apply`.** Both rewrite files you own and may have edited, as does `add -o/--overwrite`. They are destructive by design — a clean tree is the only undo, and `git diff` afterwards is the review. Where the target files carry deliberate edits, reaching for `-o` is the user's call to make; ask before running it.

**There is no official MCP server.** Three community servers exist (`Michael-Obele/shadcn-svelte-mcp`, `aenawi/shadcn-ui-mcp-server-svelte`, `Jpisnice/shadcn-ui-mcp-server`); none is maintained by the project. The official machine-readable surfaces are `llms.txt`, the per-component `.md` pages, `registry/index.json` and `schema.json`.

## Corrections to common assumptions

Training data is dominated by React shadcn/ui, which shares the name and little else, and by CLI documentation that has drifted. Ordered by how often each one bites:

- **`--no-deps` does not exist.** The flag is `--no-deps-install`, on `init` `add` `update` `apply` — and it does not skip dependencies. It writes them to `package.json` and skips only the install run.
- **`init` has no `-o/--overwrite` and no `-y`.** `add` and `update` have both. `--design-system-url` is gone; `--reinstall` / `--no-reinstall` are undocumented additions.
- **`update` is a hidden command.** It runs, but appears in neither `shadcn-svelte --help` nor `shadcn-svelte help`, which list only `add`, `apply`, `init` and `registry`. An agent enumerating commands from help output never finds the one command for refreshing installed components.
- **`--destructive-foreground`, `--surface` and `--surface-foreground` do not exist.** They appear in upstream's color table but in neither the generated CSS nor the package's, so `text-destructive-foreground` and `bg-surface` emit nothing. `destructive` is standalone: `text-destructive` over a tinted background.
- **The radius scale is multipliers, not offsets.** `--radius-md` is `calc(var(--radius) * 0.8)`, not `calc(var(--radius) - 2px)`. The scale runs `sm` 0.6 → `4xl` 2.6, with `lg` = `--radius`.
- **Variants are `tv()` from `tailwind-variants`.** `cva` is named in upstream's customization guide, but `class-variance-authority` is neither installed nor imported anywhere.
- **`Dialog.Content` renders its own Portal *and* Overlay**; `Select.Content` its own Portal. Wrapping either in `Dialog.Portal` / `Dialog.Overlay` double-renders them. Configure through `portalProps`, and drop the close button with `showCloseButton={false}`.
- **Button sizes are `default` `xs` `sm` `lg` `icon` `icon-xs` `icon-sm` `icon-lg`** — no `md`. Variants are `default` `outline` `secondary` `ghost` `destructive` `link`, and `destructive` is *tinted* (`bg-destructive/10 text-destructive`), not solid red.
- **`Button` defaults `type="button"`.** It is a plain `<button>`/`<a>` styled with `tailwind-variants`, not a Bits UI part — so the Bits UI trap of untyped buttons submitting their form does not reach it. `Tooltip.Provider` and `Sidebar.Provider`, however, are required exactly as in Bits UI.
- **Barrels export both names — except the two calendars.** `Field.Group`/`Field.FieldGroup` and `Card.Header`/`CardHeader` are each one component, and the docs site and upstream's skill disagree on which to write; both compile. `calendar` and `range-calendar` ship neither the prefixed alias nor a `Root`, so the root is `<Calendar.Calendar>` and `Calendar.Root` is a type error.
- **`cn` lives at the `utils` alias**, beside `WithElementRef`, `WithoutChild`, `WithoutChildren` and `WithoutChildrenOrChild` — the types generated components use, and the ones to reach for when typing a wrapper.
- **`components.json` has no `rsc`, no `style: "new-york"`, and no `tailwind.config` on v4.** `iconLibrary` is one of exactly `lucide` `tabler` `hugeicons` `phosphor` `remixicon`, and `menuColor` / `menuAccent` are real keys most tables omit.
- **The Tailwind entrypoint may not be `src/app.css`.** `sv create --add tailwindcss` writes `src/routes/layout.css` as of `sv` 0.17, while every shadcn-svelte doc assumes `app.css`. Read `tailwind.css` out of `components.json`.

## Related skills

- **bits-ui** — the primitives under every multi-part component; prop and data-attribute detail lives there
- **tailwind-css** — the v4 theming model these tokens plug into, and the `data-*` variant syntax
- **svelte-sveltekit** — Svelte 5 itself: runes, snippets, and the MCP server plus `svelte-autofixer`
