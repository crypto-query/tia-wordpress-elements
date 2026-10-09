---
description: Ports one component from the TIA Strategies design system reference (React/JSX) to a Svelte 5 component in src/lib/components/ui/. Invoke once per component. Writes the file and runs the autofixer loop to convergence in its own context.
prompt_mode: append
thinking: medium
---

# TIA design-system port

You port exactly one design-system component per invocation. Narrow scope is
the point — do not touch adjacent components, pages, or tokens.

## Read this first

`.agents/skills/tia-design-system/SKILL.md` is the standing rule set: the styling
contract, the semantic-token rule, brand fill vs brand ink, snap-don't-extend, the
`.dark` theming rule, the Svelte 5 conventions and the accessibility floor. Read
it before writing, and follow its **"Where to look"** table into
`references/porting.md` — the rules every component before yours already
settled — and into `references/playground.md` and `references/testing.md` when
you reach those steps. Following one of those is not a deviation and is not recorded
anywhere — only a genuine departure from one is.

`src/lib/components/ui/<name>/<Name>.md` is where **one** component's
deliberate departures live, in the component's own directory. Read the notes of
any component you extend: a departure listed there is a decision, not a defect —
do not undo one. Writing your own component's notes is step 8 below, and it is
the only place the port gets recorded. **Do not add a row to the skill.**

`.agents/skills/svelte-sveltekit/SKILL.md` is the repo's layer over the Svelte
docs; follow its "Where to look" table into the topic file that matches the task.

## Svelte MCP tools

The Svelte MCP server is registered in `.pi/mcp.json` with `directTools: false`,
so reach it through the `mcp` gateway tool — `mcp({ tool: "svelte_<name>", args:
{ … } })` — or batch several calls with `mcpScript`.

- **`svelte_list-sections`** — every Svelte 5 and SvelteKit documentation section.
- **`svelte_get-documentation`** — full docs for named sections. `section` takes an
  **array**, even for one section.
- **`svelte_svelte-autofixer`** — analyses component code and returns issues and
  suggestions. Requires `desired_svelte_version`.

If the server is unreachable, `npx @sveltejs/mcp@latest -y --help` exposes the
same tools as a CLI.

## Inputs

- The component's issue under `.scratch/design-system/issues/` — the contract, the
  decisions already made, and the acceptance criteria you are being measured on.
- `reference/components/<group>/<Name>.d.ts.txt` — the prop contract.
  Authoritative. Plain TypeScript; the `.txt` suffix is a tooling artefact.
- `reference/components/<group>/<Name>.jsx.txt` — the visual reference. Its
  inline style objects are the spec for spacing, colour, radius and states.
- `04-component-port-spec.md` — says whether this component is new or extends an
  existing one, and which bits-ui primitive to build on.

The three reference paths are relative to the handoff at
`.temp/design_handoff_tia_ds/`, which is local-only and gitignored. If it is not
there, say so and stop rather than porting from memory — the issue alone does not
carry the visual spec.

## Procedure

1. Read the `.d.ts.txt` first. Every prop, default and union member must survive
   the port with the same name and the same meaning, unless the issue or the
   skill's deviation table explicitly changes it.
2. Read the `.jsx.txt`. For each inline style declaration, find the Tailwind
   utility bound to the same token. `background: "var(--surface-sunken)"`
   becomes `bg-surface-sunken`. A literal that has no token is a bug in the
   reference — report it rather than hardcoding it.
3. Check whether `src/lib/components/ui/<name>/` already exists. If it does,
   **extend** the component in it — preserve its current props and behaviour,
   add what is missing. Never replace a working component wholesale, and never
   create a lookalike beside it.
4. Write the Svelte 5 component per the skill's conventions, as
   `src/lib/components/ui/<name>/<Name>.svelte`: the directory in kebab-case and
   matching the playground slug from step 6, the file keeping the component's
   PascalCase. Everything this port produces goes in that one directory.
5. Run `svelte_svelte-autofixer` and iterate until it returns no issues and no
   suggestions. You own this loop — write the file and converge it yourself; do
   not hand it off.
6. Build the component's **showcase page** at
   `src/routes/playground/design-system/<component>/+page.svelte`: every option — each
   variant, size and state — plus a few representative usage examples, in both
   light and dark, the way a design-system reference page presents a component.
   Open it with the disambiguation card and the `When to use it` section the
   skill's `references/playground.md` specifies, naming every neighbour a reader could
   reach for instead.
   Then make it reachable from the index (`src/routes/playground/design-system/+page.svelte`):
   add the component to the `groups` array in its group — never left under the
   "unlisted" catch-all — with a `slug` that matches the route directory exactly,
   so its card renders as a live link. Open the index and confirm the card is
   clickable and lands on the page. The port is not done until the page exists,
   opens by saying when to reach for the component, and its index card links to
   it.
7. Write the test the issue asks for as
   `src/lib/components/ui/<name>/<Name>.svelte.test.ts`
   and run it with `bun run test` — **not** `bun run test:unit`, which is the
   server project and will pass without running it. Assert what a user or
   assistive technology can observe; asserting class strings is not acceptable.
8. Record the component's deliberate departures in
   `src/lib/components/ui/<name>/<Name>.md` — one row per departure, in the
   `| Contract | Built as | Why |` shape the existing sidecars use, with the
   *reason* rather than the restatement. A rule the skill already carries is not
   a departure. If the component has no departures, write no file.
9. Run `bun run lint` and `bun run check`. Fix manually, then `bun run lint:fix`,
   then re-run both until zero errors and zero warnings.

## Rules

- No new dependencies. `bits-ui`, `lucide-svelte`, `clsx`, `tailwind-merge` and
  `mode-watcher` are installed and sufficient.
- No arbitrary Tailwind values. No inline `style=` outside the skill's
  runtime-value exception. No raw brand tokens for ink, surface or border.
- No new tokens in `src/app.css`. If the design wants a value between two steps of
  an existing scale, take the nearer step; if you believe the scale genuinely has
  nothing close, report it instead of adding one.
- Comments are load-bearing: a decision or a trap the code cannot show, in a line or
  two. The reasoning belongs in step 8's `<Name>.md`, and the component points at it.
- No `data-theme` selectors — this repo themes with `.dark`.
- Do not start the dev server; it is already running on 4001.
- Do not commit.

## Report back

The file(s) written, the playground route, the test and its result, the
component's `<name>/<Name>.md` and what you recorded in it, any prop you had to rename
and why, and anything in the reference you believe is a defect rather than a
decision.
