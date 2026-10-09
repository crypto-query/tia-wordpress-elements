# Playground routes

How a component's showcase page is built and listed. Read this when adding or
editing a page under `src/routes/playground/design-system/`. Looking at one to
verify a component renders is the browser pass, which stays in SKILL.md. A whole
**page** gets a route here too, on its own terms — see *Pages* at the end.

One route per component at
`src/routes/playground/design-system/<component>/+page.svelte` — the component's showcase
page, rendering every option (each variant × size × state) **once**, plus a few
representative usage examples, the way a design-system reference page presents a
component. The `design-system` namespace separated the ported components from the
flat playground routes that predated them, and none of those are left.

**These routes are tracked, and a new one costs a commit.** `.gitignore` excludes
`**/playground/*` and re-includes `!**/playground/design-system` on the very next
line, so `git ls-files src/routes/playground` returns all 61 files and
`git check-ignore` matches none. Write one the way you write any reviewed file —
and `AGENTS.md` forbids deleting a playground route unsolicited.

**Every page opens by answering "is this the component I want?"** — in prose,
above the demos, which show what a component does rather than when to want it.
Two pieces, and `popover/+page.svelte` and `command/+page.svelte` are the pattern
for both:

- **The disambiguation card** — an `Alert variant="info" role="note"` whose title
  is that question asked over the family ("Popover, tooltip, dropdown or
  dialog?"), and whose body spends one sentence on this component and one naming
  **every** neighbour it gets mistaken for in `<strong>`, each with the case that
  sends a reader there instead.
- **A `When to use it` section** — what the component is in one sentence, the
  threshold that makes it the right pick, the handful of cases it is for, and the
  case where it stops being the answer.

A component with no near neighbour — `brand-lockup`, `color-swatch`, `video` —
carries the section alone. Write both in the plainest language on the page: the
reader is deciding, and wants the threshold and the alternative by name. This carries the same weight
as the browser pass — a playground page without it is unfinished, and the
reviewer checks for it.

`design-system/+layout.svelte` wraps every one of them with a header carrying a light/dark
toggle, so a page renders its component **once** and you switch themes to inspect
the other. Do not render the page twice under a `.dark` wrapper — that was the
original pattern and it doubled every page while testing the variant selector
rather than the theme the app actually ships. The layout drives `mode-watcher`, so
what you see is what `<html class="dark">` gives a real route.

`design-system/+page.svelte` is the index. Which demos exist is globbed — so a new route
appears on it automatically — but its component list is hand-written, and a slug
missing from that list shows up under "unlisted". A component is not ported until
it has a `groups` entry — in its group, never left under "unlisted" — whose `slug`
matches the route directory, so the card renders as a **live link** to the page
rather than a dead "pending" label. Add and check it when you add the route.

**The glob lives in `design-system/+page.server.ts`, and has to.** Vite inlines a glob's
result at transform time and does not re-run the *client* transform when a
sibling route directory appears, so an index that globbed in `+page.svelte`
rendered a new component as a link in the SSR markup and then downgraded it to
"pending" on hydration, out of a module compiled before the directory existed —
looking for all the world like a broken card until someone restarted vite. The
server module is re-evaluated per request, and the page now takes the list from
`data` instead of holding a glob that can disagree with it.

**Keep every playground route under `design-system/`.** Tailwind skips what git
ignores, so back when the flat routes were the only ones, a class used *only* on a
demo page generated no CSS — the page rendered half-styled while the component on
it looked right. `app.css` gained
`@source "./routes/playground/design-system/**/*.svelte"` for that. The re-include
above has since made the directory tracked, so the scanner reaches it unaided and
that line is now redundant; it is harmless and stays. The namespace itself still
carries weight: the `.gitignore` re-include and the index's glob are both keyed on
that exact directory name, so a route placed beside it — `playground/pages/`, say —
is untracked, unscanned and unlisted.

## Pages

A page's showcase route is **one route per screen**, not one per Section:
`design-system/{landing,dashboard,account}/+page.svelte`. Three routes for the
three screens. A route per Section would duplicate the page itself, and *the real
route is its playground* is unreachable for two of the three — `requireSession`
cannot be satisfied on the adapter server.

The page's states arrive as **presets** rather than as variants and sizes, which
changes the opening and nothing else:

| Piece | A component route | A page route |
|---|---|---|
| opening prose | disambiguation card + *When to use it* | **one line naming the design source** — the `.dc.html` file and, where the page draws from several, which region each Section takes |
| the control | none | a native `<select>` bound to `$state`, one `<option>` per preset |
| what renders | every variant × size × state at once | the page under the selected preset |
| index entry | its component group | the **Pages** group |

A page is not mistaken for its neighbours, so the disambiguation card has nothing
to disambiguate and *When to use it* has no threshold to state. The native
`<select>` is the whole picker — it needs no new component.

Presets live **inline in the page file**, transcribed from the design's
`*-model.js` and keeping its `build(preset)` base-plus-override shape; 51 of the 59
routes here already hold their fixtures this way. Each preset is passed to the
Sections as props, which is what poses them —
[pages.md](pages.md) has the seam that makes a posed Section skip its own query.

The index's `groups` list gains a **Pages** entry holding the three slugs, so they
read as live links rather than falling under *unlisted*.
