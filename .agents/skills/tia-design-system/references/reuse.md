# Reuse: the mark, the record, and the three verbs

SKILL.md's one rule — *reuse before you build* — says what to do. This file is
the test that decides a case, and it answers two separate questions: whether
**one site** that hand-rolls what a component already renders is a defect, and
what becomes of **one whole directory** that predates the design system.

Neither is settled by reading the markup alone. A hand-rolled duplicate can be
correct code, deliberately written, with its reason recorded a directory up — so
read the records before you judge the code. The vocabulary below is a trial's: a
site is **convicted** or **acquitted**, and an acquittal needs a **record**.

## The loop

1. **Strip the choreography.** Take the positioning, transition and conditional
   classes off the element. What remains is **the mark**. If a component in
   `src/lib/components/` renders that mark as its default, the site *is* that
   component.
2. **Read both records.** A reason can live in three places, and the first is the
   one that gets missed: the collection's `AGENTS.md`
   (`src/lib/components/<collection>/AGENTS.md`, which can acquit a whole
   directory at once), the component's own `<name>/<Name>.md`, and a comment at
   the site.
3. **Test the record against this charge** — three clauses below, every one
   required. All three hold and the site is **acquitted**; any one fails and it
   is **convicted**.
4. **Adopt through props**, and see it render in both themes. The browser pass is
   where a snapped value proves itself.

The loop ends when the site either imports the component or its `<Name>.md`
carries a refusal entry naming the reason that is true today. A site left with
neither is not done.

## Conviction is the mark, not the choreography

How an element is positioned, timed, revealed or conditionally shown is the call
site's business and does not acquit it. Only the mark is charged.

Worked, on an overlay ring that cross-fades with a button's label (the audit that
produced this rule, 2026-08-21). Strip `pointer-events-none absolute inset-0
m-auto`, the `transition-opacity duration-200`, the `delay-300` and the
`opacity-0`/`opacity-100` swap, and what is left is `size-5 rounded-full
border-[2.5px] border-current/30 border-t-current animate-spin` — Spinner's
`ring` at `md`. **Convicted on the mark.** The choreography stays where it was,
as a `class` on the adopted `<Spinner>`.

The looser test — *does this site do the component's whole job?* — convicts
nothing, because no call site is ever the whole job. Charge the mark.

## Acquittal: three clauses, every one required

- **(a) Written down.** An unexplained hand-roll is convicted, however good the
  unstated reason was. The record is not evidence of the decision; it *is* the
  decision.
- **(b) About this charge.** The record has to say why *this house component* was
  not used. A comment explaining why some neighbouring option was rejected —
  bits-ui's own part, a third-party widget — acquits that charge and leaves this
  one open.
- **(c) Still true of the component as shipped today.** Reasons are re-tested,
  not inherited. Read the component as it is now, not as it was when the reason
  was written.

**Both directions of clause (b) hold.** A record covering a *wider* charge
carries the narrower one with it: where a skill or an `AGENTS.md` records that a
whole component is a known near-duplicate whose reconciliation is scheduled
elsewhere, an individual site inside it is covered too, and charging it
separately re-opens a decision someone already made. A record covering a
*narrower* charge does not reach the wider one.

### Stale but still correct: rewrite the record, keep the code

A stale reason is never on its own grounds for a swap. Re-run the test and state
the reason that is true now; only if no reason is true now is the site convicted.

`ui/hero/` is the worked case. It hand-rolls a spinner and pairs
`motion-reduce:hidden` with a static glyph, on the recorded ground that a
*stopped* ring is an incomplete circle and reads as failure. That ground was
written against a component that froze under `prefers-reduced-motion`; the
shipped `Spinner` does not freeze — `Spinner.md` and `app.css` are where what it
actually does is true. The hand-roll survives anyway, one step along: at hero
scale a slowly cycling ring reads as the surface itself pulsing, which is worse
than a still glyph. **The record was rewritten; the code was right.**

### A slot the primitive owns

Inside a bits-ui composite, a part the primitive renders has to be the
primitive's part — a house component can only be composed into it through
bits-ui's `child` snippet. Read the house component's props type. One that
declares `Omit<…RootProps, "children" | "child" | "ref">` has no `child` to
compose through, and the site is **acquitted**: record it and stop rather than
forcing it. One that exposes `child` is composable, and this acquittal does not
apply — which is clause (c) running on this rule's own example, since a
component can regain `child` in a later slice.

## Adopting: props are the only seam

`class` carries where a component sits and how much room it takes. Props carry
the mark.

**Snap to the nearer prop value** — SKILL.md's *Snap, don't extend*, the same
rule the token scales run under, applied to component props. A 36px ring is not
one of Spinner's steps (14 / 16 / 20 / 28 / 40): it takes the nearer of them, or
the numeric escape `size={36}` where the extent is genuinely load-bearing. Read
the steps off the component before you snap — the nearer one is often not the
one the eye guesses.

A value **no prop reaches** is a **component-API gap**. Add the prop to the
component and say so in its `<Name>.md`. Reaching past the props with a `class`
instead hands every site a free exit — hand-roll, cite a value the component
cannot express, walk away — and the class often does not land: a ring's stroke,
for instance, derives from `--spinner-size` inside `@utility spinner-ring` and is
not the call site's to set at any width. If snapping visibly breaks the
composition in the browser pass, that is the gap showing itself. *Fix the
component, not the page*, one layer in.

## Where a refusal is written

`src/lib/components/<collection>/<name>/<Name>.md`, under its **own heading**,
separate from the port-notes table. The two axes are different arguments: that
table is reference-vs-build, and a refusal is house-rule-vs-build.

- One entry per refusal: **the component not used, the site, and the reason that
  is true today.**
- **A refusal creates the sidecar** where the component has none.
- A comment at the site is optional and additional. It never substitutes — a
  well-written comment drifts onto the wrong charge with nothing auditing it,
  which is exactly how clause (b) gets failed.
- **A conviction that is swapped records nothing.** The import is the record.

**A route has no sidecar of its own.** The seam keys on the component *not
used*, so a refusal on a page — a playground demo included — still files into
that component's `<Name>.md`, naming the route as the site, **plus one comment at
the route** as a pointer to it.

A playground page gets one ground a shipped component does not: *it would be
visually confusable with the component under demonstration*. Argue it per site,
with what the page is demonstrating; as a blanket excuse it would empty the
playground arm of the rule entirely.

The house exemplar for the writing is already in the repo, at
`ui/radio-group/RadioGroup.md` — written down, about the charge, and still true:

> the `card` tile as a card ｜ its own `border` / `bg-surface` / `shadow-card`,
> **not `ui/card/Card.svelte`** ｜ reuse-before-you-build stops at the content
> model:
> the tile has to be the `<button role="radio">` the primitive renders, and
> `Card` is a `<div>`, which is not phrasing content and so is not valid inside a
> button.

## A directory that predates the design system: port, move, or drop

**Whatever predates the design system, port, move, or drop it** (owner,
2026-08-21). The three verbs are exhaustive — *legacy, left alone* is not a
status a directory can hold. This rule replaced the freezes that stood in
`ui/AGENTS.md` and `layouts/AGENTS.md`; both now route here instead, and both
still bind on everything else they say.

- **Port** it: tokens, sidecar, playground route, index entry.
- **Move** it to the collection it belongs in, records with it.
- **Drop** it, migrating its consumers to the design-system components first.
  Deleting a **file** needs the owner's word; deleting a **route** is the owner's
  call every time.

The rule stands for the next directory that arrives outside the design system.
The queue it was written to drain is empty: the component-reuse effort spent the
last of the verbs on `ui/` and `layouts/`.
