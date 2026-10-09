# CLI, presets and registry

Every table below is `shadcn-svelte@1.5.0 <command> --help`, verbatim. Where the docs site or the upstream skill disagrees, they are stale.

Run through the project's own runner — `bunx shadcn-svelte@latest`, `npx shadcn-svelte@latest`, `pnpm dlx shadcn-svelte@latest`. There is no `--package-manager` flag; the CLI detects it from the lockfile.

## The command list is incomplete

```
add [components...]   add components to your project
apply [preset]        apply a preset to an existing project
init                  initialize your project and install dependencies
registry              (build)
help [command]
```

**`update` is missing from that list and from `help`, but exists and works.** It is the command for refreshing installed components, so discovering commands from help output silently loses it. There is no `mcp`, `eject`, `info`, `diff` or `remove` command.

## Flags

Shared by `init` `add` `update` `apply`: `-c, --cwd <path>`, `--skip-preflight`, `--proxy <proxy>`, and **`--no-deps-install`** — which adds dependencies to `package.json` and skips only the install run. It is widely documented as `--no-deps`, described as skipping dependencies entirely; both are wrong.

| Command | Adds |
|---|---|
| `init` | `--preset <preset>`, `--base-color <name>`, `--css <path>`, `--components-alias`, `--lib-alias`, `--utils-alias`, `--hooks-alias`, `--ui-alias`, `--reinstall` / `--no-reinstall` |
| `add [components...]` | `-a, --all`, `-y, --yes`, `-o, --overwrite` |
| `update [components...]` | `-a, --all`, `-y, --yes` |
| `apply [preset]` | `--preset <preset>`, `--only <parts...>` (`font`, `theme`), `-y, --yes`, `-s, --silent` |
| `registry build [registry]` | `-o, --output <path>` (default `./static/r`); registry defaults to `./registry.json` |

`init` has **no `-o/--overwrite`** and **no `-y`**. `--design-system-url` no longer exists.

`--base-color` accepts exactly `neutral` `stone` `zinc` `mauve` `olive` `mist` `taupe`, and cannot be changed after init.

`add` takes registry item names *or* a URL to a registry JSON item. Adding by URL is an explicit trust decision — confirm the source first, then check the imports, because third-party items carry their author's alias paths rather than yours.

**`-y` does not clear the overwrite prompt.** `add --all -y` still stops interactively the moment any target file already exists, offering "overwrite everything" or "let me decide individually". Pass `-o` as well for an unattended run, knowing it discards local edits.

`HTTP_PROXY` / `http_proxy` are respected without a flag; `--proxy` overrides them per command.

## Running init unattended

`init` stops on an interactive preset prompt when `--preset` is absent, and there is no `-y` to suppress it. Two prompts to clear:

```bash
printf 'y\n' | bunx shadcn-svelte@latest init \
  --preset b0 --base-color neutral --css src/app.css \
  --components-alias '$lib/components' --lib-alias '$lib' \
  --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' \
  --ui-alias '$lib/components/ui'
```

`--css` must name a file that already exists — init aborts otherwise. Scaffolds vary on where that file is: `sv create --add tailwindcss` currently writes `src/routes/layout.css`.

## Preset strings

A preset is a bit-packed base62 encoding of the whole design system, prefixed `a` (8 fields) or `b` (10 fields, adding `chartColor` and `fontHeading`). Fields, low bits first: `menuColor` `menuAccent` `radius` `font` `iconLibrary` `theme` `baseColor` `style`.

- **`b0` is all-defaults** — style `nova`, baseColor `neutral`, iconLibrary `lucide`, font `inter`, menuColor `default`, menuAccent `subtle`. Useful for scripted setup.
- Real strings come from the builder at `shadcn-svelte.com/create`; the changelog links carry them too (`b27GcrRo` is Rhea, `b4xFeBLg4O` is Sera).
- Styles: `nova` `vega` `maia` `lyra` `mira` `luma` `sera` `rhea`. A style is not a theme — it changes geometry, spacing and control sizes, so switching restyles every installed component.

`init --preset` for a new project; `apply --preset` for an initialized one. `apply` reinstalls installed components in the new style (except `utils`), so commit first. `--only theme` or `--only font` applies part of a preset without touching components.

## Registry

Default base is `https://shadcn-svelte.com/registry`, overridable per project in `components.json`.

- `registry/index.json` — the catalogue. 206 items: 147 `registry:block`, 56 `registry:ui`, 1 each of `registry:style`, `registry:hook`, `registry:lib`.
- `registry/styles/<style>/<name>.json` — one item's files and dependencies, as installed for that style.

`registry build` is the other direction: it reads a `registry.json` and writes distributable item JSON to `./static/r`.

## components.json

Schema at `https://shadcn-svelte.com/schema.json`. Only `tailwind` and `aliases` are required.

| Key | Notes |
|---|---|
| `tailwind.css` | the global stylesheet; theme edits go here, not into a second file |
| `tailwind.baseColor` | fixed at init |
| `tailwind.config` | Tailwind v3 only |
| `aliases.*` | `components` `utils` `ui` `hooks` `lib`; must match `svelte.config.js` / `tsconfig` paths |
| `style` | one of the eight styles |
| `iconLibrary` | exactly `lucide` `tabler` `hugeicons` `phosphor` `remixicon` — drives generated icon imports, so never assume lucide |
| `menuColor` | `default` `inverted` `default-translucent` `inverted-translucent` |
| `menuAccent` | `subtle` `bold` |
| `registry` | base registry URL |
| `typescript` | boolean, or a path to a custom config |

`menuColor` and `menuAccent` are absent from most published field tables. There is no `rsc` or `rtl` key — those are React shadcn's. The CLI resolves the aliases to absolute paths itself; to see what is installed, list the directory `aliases.ui` points at.

## What gets installed

`init` writes into `devDependencies`: `clsx`, `tailwind-merge`, `tailwind-variants`, `tw-animate-css`, the icon package, the font package, and **`shadcn-svelte` itself** — the package ships the CSS layer the stylesheet imports.

Components then pull their own, also as `devDependencies` — every registry item declares them under a `devDependencies` key. `bits-ui` arrives with the first component that needs it, dragging `@internationalized/date` along as its peer whether or not a calendar is involved. The rest are one-to-one:

| Item | Brings |
|---|---|
| `sonner` | `svelte-sonner`, `mode-watcher` |
| `form` | `formsnap`, `sveltekit-superforms` |
| `chart` | `layerchart` |
| `data-table` | `@tanstack/table-core` |
| `carousel` | `embla-carousel-svelte` |
| `drawer` | `vaul-svelte@next` |
| `resizable` | `paneforge` |

## Working with an existing project

1. Read `components.json`, then list `aliases.ui` — that is what is installed.
2. `add` with no names for the interactive catalogue; `add <name>` when you know it.
3. After adding, read the generated files. They are yours now, and the review that matters is composition and icon imports matching `iconLibrary`.
4. `update <name>` or `update --all` refreshes from the registry. Commit first, then read `git diff`.
