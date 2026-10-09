# Building a page

How a page is composed out of Sections, where its data comes from, and what to do
when no component covers a region. Read this when writing or editing a
`+page.svelte`, a Section, or the playground page that poses one. SKILL.md governs
the component you reach for; this file governs what you assemble out of them.
[ADR-0022](../../../../docs/adr/0022-section-role.md) is the record behind it.

## A page is a stack of Sections

A **Section** is a named region of one page's content. Two clauses, both required:

> **(a) page-scale** — it fills a region of the page, not a slot inside one.
> **(b) knows its own words** — its copy and its internal layout live inside it.

A Section is a component that holds components: it composes `ui/`, `layouts/`,
`widgets/` and the sub-parts nobody else renders.

**Sections nest by screen; the file names stay bare** —
`src/lib/components/sections/landing/hero/Hero.svelte`,
`sections/account/tradingview-link/TradingViewLink.svelte`. One `AGENTS.md` for
the whole collection, none per Section. (`widgets/` is `features/` renamed by
ADR-0022.)

**Position decides between the two collections, and a reviewer decides position.**
There is no mechanical check:

| | Belongs to | Sits |
|---|---|---|
| **Section** | one page | on that page |
| **Widget** | one Module | on any page, or inside any Section |

`Grid` and `Stack` are content-blind and stay in `layouts/`. `AppHeader` and
`AppFooter` are chrome, composed by the area layout — a page never draws its own
([ADR-0011](../../../../docs/adr/0011-three-route-areas.md)).

## The route file holds structure; the Sections hold the words

**A `+page.svelte` contains no words the visitor reads.** What it may hold:
imports, `let { data } = $props()`, prop shaping, `layouts/` primitives, Section
elements, and copy-free repeaters over `ui/` components. Copy written into a route
satisfies clause (b) with something that has no name, no folder and no playground
preset — which is why this is the one rule here a grep can convict.

**A block two Sections both want moves to `ui/`** — or to `widgets/` where it
fronts a Module. A Section imports no Section, so `reuse.md`'s mark test keeps one
place to look. A shared plain *function* is not a component and may sit beside the
Sections that call it.

## Data: a Section fetches, and can also be posed

A Section calls remote functions directly and contains its own `<form>` elements.
It **also** accepts its data as a prop, and the prop's absence is what triggers the
fetch:

```svelte
let { data: posed }: { data?: Thing } = $props();
const data = $derived(posed ?? (await getThing()));
```

`??` short-circuits before the `await`, so a **posed** Section never runs the
query. This is the whole seam between the real route, where a Section fetches, and
the playground page, where the same Section is posed with fixture presets. No
`demo` flag, no wrapper, no second code path.

**Write it as two lines.** `let { data = await getThing() } = $props()` does not
compile: the client bundle rejects `await` in a prop default while the server
bundle accepts it.

**`bun run build` is the gate for this seam.** `bun run check` reports zero errors
and zero warnings on a Section whose client bundle cannot compile. Run the build
after writing or editing one, before the browser pass.

| Rule | |
|---|---|
| **One query per subject** | Called by the component that owns that subject. Not one per page — every save then refreshes everything. Not one per band or per card — that is n+1. Remote functions dedupe by argument, so two Sections asking for the same subject cost one call. |
| **No new `+page.server.ts`** | `load` keeps only the gates that already exist. |
| **Reads borrow their type** | A type-only import from the Section's `.remote.ts`, erased at build. |
| **Writes share a schema module** | A normal module both the form and the handler import — SvelteKit forbids exporting a schema from a `.remote.ts`. Neither side creates a `types.ts`, so `components/AGENTS.md`'s rule is untouched. |
| **Every write is a `form`** | A `form` still submits while JavaScript is off or still loading; a `command` does not. A save names the queries it refreshes on the server, so the new values ride back inside the mutation response. |
| **No backend yet?** | Wire what is real and hard-code the rest **behind the real query's return shape**, so replacing it later edits one function body and no component. |

Three experimental flags are load-bearing from the first slice:
`kit.experimental.remoteFunctions`, `compilerOptions.experimental.async` and
`kit.experimental.handleRenderingErrors`.

## When a query fails, the element that would have shown it says so

**No page and no Section writes a `<svelte:boundary>`, and no query throws.** A
query catches its own failure and reports the outcome in its return value, as a
**flat union with an `ok` discriminant** — the same field name in every query:

```ts
{ ok: true; /* the subject's fields, inline */ } | { ok: false }
```

A Section reads `.ok` first, then the value. One branch, plain markup.

`null` cannot carry this. A bare `null` would have to mean both *"no card on
file"* — which invites the visitor to add one — and *"the lookup failed"*, which
must not. It also puts `??` back in play as a defect, because the seam above
treats `null` as an absent prop.

| | |
|---|---|
| **The feedback is in place** | The card row, the table body, the health cell — the element that would have held the value carries the message. Never a banner, never `Alert`, never `Hero`. |
| **One sentence** | *"We couldn't load your {subject}."* The Section fills in the subject. |
| **Nothing reaches the 500 page** | `+error.svelte` is left for a genuine render crash, which is what `handleRenderingErrors` keeps answering. |
| **No `pending` snippet** | A boundary's `pending` renders during SSR and **skips its contents**, so one on a public page ships a spinner to the crawler. Pending is not a state these pages draw. |
| **The one silent subject** | A promotional band with nothing to promote draws nothing. Every other subject speaks: a page with no content, saying nothing, reads as a product that sells nothing. |

**Writes are the exception that does show progress.** While a `form` submits,
disable the control and put `<Spinner size="sm" decorative />` inside it —
`AlertDialog` and `WaitlistForm` already do exactly this.

**A `<svelte:boundary>` is added only** when a query stops degrading *and* a
sibling band must outlive its failure — and it then wraps the **risky** Section,
never the band being protected.

## What a Section's directory owes

Everything in `src/lib/components/AGENTS.md` holds — kebab-case directory,
PascalCase files, no barrel, types unexported in the instance script, sub-parts
inside the parent's directory — **except two rows**:

| Row | How a Section differs |
|---|---|
| `<Name>.svelte.test.ts` | Present only when the Section owns **view state**. |
| the directory name matches the playground route | No Section has a route of its own, so the name answers to nothing. |

`<Name>.md` is owed by every Section, and it carries one thing the `ui/` sidecar
does not: **its first line names the design source** — the `.dc.html` file and the
region inside it. The body then records departures from the design system's own
rules and the reason for each — the **new**-kind sidecar `ui/AGENTS.md` describes,
since no reference contract stands behind a Section.

**The test asserts view state and nothing else** — the rail switches the pane, the
carousel advances. Copy is never asserted: a test that pins the design's words is a
snapshot wearing a test's clothes. A Section with no view state gets no test, and
the browser pass is then the only gate on a dropped prop.

## The browser pass for a page

**One playground route per screen**, not per Section:
`src/routes/playground/design-system/<page>/+page.svelte`. Presets live **inline in
that page file**, transcribed from the design's `*-model.js` and keeping its
`build(preset)` base-plus-override shape. A real route never gets fixture data — a
Section rendering convincing content nobody passed hides missing wiring. See
[playground.md](playground.md) for the page's opening line, its `<select>` preset
picker, and its index entry.

Serve it the way SKILL.md's browser pass says — `bun run build`, then
`PORT=4056 bun build/index.js`, one listener confirmed, requested at `127.0.0.1`.
Then exhaust **three axes separately, never crossed**:

| Axis | Exhausted by |
|---|---|
| Content | **every preset**, in **both themes**, at 1280 |
| Layout | **one preset**, at 375 / 768 / 1280, one theme |
| Colour | folded into the content axis |

Crossing them multiplies the renders and finds nothing the two passes miss.

**Proving a Section is really posed needs a client-side navigation, not a page
load.** On a first load the query is hydrated from the SSR payload, so a posed
Section and a self-fetching one both make zero client requests.

The dashboard and account **real** routes are never seen this way: `requireSession`
cannot be satisfied on the adapter server. Landing's real `/` can be, and is.

## When no component covers the region: halt

Reuse-before-you-build stops at the **content model**. Take the three steps in
order and stop at the first that answers:

| | Ask | Verdict |
|---|---|---|
| 1 | Strip positioning, transition and conditional classes. Does the **mark** match a component's default rendering? | It **is** that component. Import it. |
| 2 | Could the nearest component's **shipped element tree** render this mark on different prop values, snippet props included? | A prop or a variant. Add it to the component. |
| 3 | Would it need a **different element tree** — different semantics, nesting, or ARIA role? | A new component. Halt, below. |

A component only one Section wants is a **sub-part in that Section's directory**.
It moves to `ui/` when a second Section wants it.

**Step 3 halts the slice.** Nothing in this repo stops a placeholder from shipping,
so the halt is what keeps one out of the tree. Bands already built stay built. Do
three things and stop:

1. Write the component ticket to `.scratch/design-system/issues/<name>.md`, in the
   template ticket 03 settled — `Kind: ported | new` and its matching `Builder:`
   (`design-system-port` for a reference component, `svelte-file-editor` for a new
   one), then `## Need`, `## Why not a prop`, `## Reference`, `## Deliverables`,
   `## Acceptance criteria`.
2. Add one line under `## Open findings` in the slice you were running, directly
   above `## Comments`, linking that ticket.
3. Set the slice's `Status:` to `needs-info` and stop.

A `Kind: ported` ticket stages its reference files in the same act, into the paths
`design-system-port` already reads —
`.temp/design_handoff_tia_ds/reference/components/<group>/<Name>.{jsx,d.ts}.txt`
and `<group>/<name>.card.html`.

## This file does not grow when you build a page

Building a page adds Section directories, a playground route and remote functions.
It does not edit this file, and it does not edit SKILL.md. What is true of one
Section only goes in that Section's `<Name>.md`.
