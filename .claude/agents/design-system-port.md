---
name: design-system-port
description: Ports one component from the TIA Strategies design system reference (React/JSX) to a Svelte 5 component in src/lib/components/ui/. Invoke once per component. Writes the file and runs the autofixer loop to convergence in its own context.
tools: Read, Write, Edit, Bash, Glob, Grep, mcp__svelte__list-sections, mcp__svelte__get-documentation, mcp__svelte__svelte-autofixer
---

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

The Svelte MCP server is authoritative and current; the skill is the layer on top.

- **`list-sections`** — every Svelte 5 and SvelteKit documentation section.
- **`get-documentation`** — full docs for named sections. `section` takes an
  **array**, even for one section.
- **`svelte-autofixer`** — analyses component code and returns issues and
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
5. Run `svelte-autofixer` and iterate until it returns no issues and no
   suggestions. You own this loop — write the file and converge it yourself; do
   not hand it off.
6. Build the component's **showcase page** at
   `src/routes/playground/design-system/<component>/+page.svelte`: every option — each
   variant, size and state — plus a few representative usage examples, in both
   light and dark, the way a design-system reference page presents a component.
   Then make it reachable from the index (`src/routes/playground/design-system/+page.svelte`):
   add the component to the `groups` array in its group — never left under the
   "unlisted" catch-all — with a `slug` that matches the route directory exactly,
   so its card renders as a live link. The port is not done until the page exists
   and its index card links to it.
7. **The browser pass — look at the page you just built.** Read the skill's
   browser-pass section and follow it: `bun run build`, then
   `PORT=<free port> bun build/index.js`, then `playwright-cli open
   http://127.0.0.1:<port>/playground/design-system/<component>`. Confirm
   one listener on the port first. Walk every variant, size and state, flip the
   layout's theme toggle and walk them again, and click through from the index to
   prove the card is a live link. You are looking for what lint and the tests
   cannot see: wrong sizes, clipped or overflowing content, a surface that
   collapses into the background in one theme, a focus ring you cannot see. Fix
   what you find and look again. Kill the server by pid when you are done. If a
   later step changes markup, repeat this one.
8. Write the test the issue asks for as
   `src/lib/components/ui/<name>/<Name>.svelte.test.ts`
   and run it with `bun run test` — **not** `bun run test:unit`, which is the
   server project and will pass without running it. Assert what a user or
   assistive technology can observe; asserting class strings is not acceptable.
9. Record the component's deliberate departures in
   `src/lib/components/ui/<name>/<Name>.md` — one row per departure, in the
   `| Contract | Built as | Why |` shape the existing sidecars use, with the
   *reason* rather than the restatement. A rule the skill already carries is not
   a departure. If the component has no departures, write no file.
10. Run `bun run lint` and `bun run check`. Fix manually, then `bun run lint:fix`,
    then re-run both until zero errors and zero warnings.

## Rules

- No new dependencies. `bits-ui`, `lucide-svelte`, `clsx`, `tailwind-merge` and
  `mode-watcher` are installed and sufficient.
- No arbitrary Tailwind values. No inline `style=` outside the skill's
  runtime-value exception. No raw brand tokens for ink, surface or border.
- No new tokens in `src/app.css`. If the design wants a value between two steps of
  an existing scale, take the nearer step; if you believe the scale genuinely has
  nothing close, report it instead of adding one.
- No `data-theme` selectors — this repo themes with `.dark`.
- Leave :4001 alone — do not start, restart or kill anything on it. Step 7's own
  server on its own port is how you get a browser, and you tear that one down.
- Do not commit.

## Report back

The file(s) written, the playground route, the test and its result, the
component's `<name>/<Name>.md` and what you recorded in it, any prop you had to rename
and why, and anything in the reference you believe is a defect rather than a
decision.

**And the browser pass explicitly**: the port and URL you served, that you walked
every variant, size and state in both themes, and what the browser showed that the
source did not — including "nothing, it matched the reference". A port reported
without it is not finished.
