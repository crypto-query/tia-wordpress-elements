---
name: tia-design-system
description: The TIA Strategies design system as built in this repo — the token and styling contract, semantic and status roles, `.dark` theming, the browser pass every component is verified through, and the port decisions every component already settled. Use whenever creating or modifying a Svelte component, a route, or `src/app.css`, and whenever verifying that one renders. One component's own deviations live in its own directory, in `src/lib/components/ui/<name>/<Name>.md`.
version: 3.0.0
scope: design-system
distribution: author-only
---

# TIA Strategies design system

This file is the rule set — what holds for **every** component. What is true of
one component only is written inside that component's own directory, in
`src/lib/components/ui/<name>/<Name>.md`, and that is the file a port writes
rather than this one. Adding a component adds a directory; it does not edit this
file.

The handoff that specified the port is local-only and uncommitted, as are
`docs/adr/` and `.scratch/` — so anything a future contributor must not undo has
to be written in one of the two tracked places, with its reason. Nothing here is
a preference; each rule exists because breaking it produced a defect that
light-mode inspection, `lint` and `check` all missed.

## The one rule

**Reuse before you build; fix the component, not the page.** List
`src/lib/components/` before writing markup — `ui/` for controls; `sections/`,
`layouts/` and the other collections for page furniture. If a component covers
the need, use it. If it almost covers it, add a prop or a variant to the
component. The same rule holds inside a component: compose the existing `ui/`
primitives rather than re-drawing what one already renders. A new component is
justified only by a need no existing one covers, and hand-written markup by
genuine one-off page composition.

When a visual defect shows up on a page, find where it actually lives. Clipping,
dark-mode colour, spacing and focus-ring bugs are component bugs by definition —
they would repeat everywhere else. Fix `src/lib/components/ui/`, then delete the
per-page workaround that was compensating.

**Building a page — a `+page.svelte`, a Section, or the playground route that
poses one?** [references/pages.md](references/pages.md) is the rule: what a
Section is, where it gets its data, what its directory owes, the browser pass for
a page, and the **halt** when no component covers a region.

**About to hand-roll markup a component might already render, or judging one
that already exists?** [references/reuse.md](references/reuse.md) is the test:
the **mark** that convicts a duplicate, the three-clause **record** that acquits
one, and where a refusal is written down. A directory predating the design system
is decided there too — **port, move or drop**, and nothing stays frozen.

## Where to look

Everything below binds on every component. What only one branch of the work
reaches sits in `references/`:

| File | Read it for |
|---|---|
| [pages.md](references/pages.md) | composing a page out of Sections: the route/Section split, the data seam, a Section's directory, the browser pass for a page |
| [reuse.md](references/reuse.md) | deciding whether a hand-rolled site is a duplicate, and what a pre-design-system directory is owed |
| [porting.md](references/porting.md) | porting a reference component: the rules every port already settled, and the token-layer ledger |
| [playground.md](references/playground.md) | adding or editing a page under `playground/design-system/` — its opening prose, the index entry, the glob |
| [testing.md](references/testing.md) | writing a component test: the seam, reading back a `$bindable`, the three harness jobs, the sandbox's phantom hover |

## Styling contract

Tailwind v4 utility classes bound to the tokens in `src/app.css`. That file is the
single token layer.

```
✅ class="bg-surface text-foreground-muted rounded-lg shadow-card"
❌ class="bg-[#ffffff] text-[#4b5563] rounded-[10px]"
❌ style="background: var(--surface)"
```

- **No arbitrary values.** Every colour, size, radius, shadow and easing is a
  token utility. Anything in the file's `@theme` blocks is available as one —
  `bg-surface-sunken`, `text-foreground-subtle`, `border-border-muted`,
  `shadow-card-elevated`, `shadow-btn-accent`, `ease-out-soft` from
  `@theme inline`, `text-2xs` and `text-md` from the plain `@theme` block below
  it. The `--font-size-*` block is **not** one of them: it is not a Tailwind v4
  namespace and generates nothing. It is inert, and left in place deliberately.
- **No inline `style=`**, with the single runtime-value exception below.
- **Compose with `cn()`** from `$lib/utils` — `clsx` + `tailwind-merge`, so a
  consumer's `class` overrides cleanly. Pass the incoming `class` prop **last**.
- `eslint-plugin-better-tailwindcss` runs with `entryPoint: "src/app.css"` and the
  `enforce-canonical-classes` px→token autofix. Do not disable a rule; fix the
  class.

**Lint does not catch token drift inside a variant map.**
`better-tailwindcss/no-unknown-classes` inspects `class=` attributes and `cn()`
calls. A plain object literal — the `variantStyles` / `sizeStyles` maps these
components are built from — is invisible to it, so a class naming a deleted token
sits there rendering nothing while lint exits 0. Read the tokens you use out of
`app.css`; do not assume the linter is checking them for you.

**Never write `text-sm` and `leading-*` as two classes — use `text-sm/snug`.**
`enforce-canonical-classes` merges an adjacent font-size and `leading-*` into the
slash form, and it resolves the size against the theme it can *see*: Tailwind's
stock scale, not the `:root` block that shadows it at runtime. Stock `text-sm` is
0.875rem, `--text-md` is 14px, so the rule reads the two as the same size and picks
the token — `text-sm leading-snug` autofixes to `text-md/snug`, silently resizing
the element from the 13px `--text-sm` actually renders to 14px.

`text-sm` is the only step this hits: every other size's stock value collides with
no repo token, so `text-2xs`, `text-xs`, `text-md`, `text-lg` and `text-xl` all keep
their own name through the merge. The pair form already shipping in `Badge` and
`Alert` is therefore safe and is **not** a cleanup backlog. What is not safe is
`text-sm` beside a `leading-*` anywhere the plugin can read the pair — a `class=`
attribute or a `cn()` argument. Inside a `sizeStyles` map it is invisible and
survives, which is worse: the same component then renders one size in the map and
another in the attribute.

Writing the slash form is the fix, and it is worth preferring generally: one
`tailwind-merge` group instead of two also retires the older hazard that a later
`text-*` deletes an earlier `leading-*` (see Badge's own comment).

## Semantic tokens only, for ink, surface and border

Use the semantic layer — `--foreground`, `--surface`, `--border-muted`, `--muted`,
`--card-background` — never the raw palette (`--midnight-blue`, `--grey-600`,
`--white`) for anything that is ink, a surface or a border. The semantic tokens are
redefined under `.dark`. The raw ones are not, so a raw token used as ink is a
dark-mode bug that light mode cannot show you.

```
✅ class="text-foreground bg-surface border-border-muted"
❌ class="text-midnight-blue bg-white border-grey-200"
```

Raw brand tokens are legitimate for fixed brand artwork — the logo and the brand
gradients — and nowhere else. Brand *roles* are semantic, per the next rule.

## Brand roles are semantic, in both themes

`--primary` is the blue brand action; `--secondary` is the yellow CTA. Both hold
in light **and** dark, for fill and for ink alike:

```
✅ class="bg-primary text-primary-foreground"     ✅ class="text-primary"
✅ class="bg-secondary text-secondary-foreground"
❌ class="bg-blue text-white"                     ❌ class="bg-yellow text-midnight-blue"
```

This works because the dark theme **lifts** `--primary` to a readable mid-blue
(`--navy-400`) rather than swapping it to yellow. The two brand roles stay
distinct on both canvases, which is the entire point.

An earlier version of this file did swap `--primary` to yellow on dark. That made
Button's `default` collide with its `accent`, and Badge's `brand` with its own
`accent` — in dark mode only, where lint, `check` and light-mode inspection all
miss it. The fix was to transcribe the design system's real dark theme (below),
not to push the fills onto raw hues. If you find yourself reaching for `bg-blue`
on a component, the token layer is what needs the change.

## Status roles: one name per job

Every status hue ships as three tokens and each has exactly one job. Picking the
wrong one is invisible in light mode — `--destructive` *is* `var(--error)`, and
`--error-strong` is one step away from both. The split only opens on the dark
canvas, where `*-light` and `*-strong` flip and the base hue does not.

| Job | Token | Where it lands |
|---|---|---|
| fill, carrying `*-foreground` ink | `--destructive`, `--success`, … | Button's `destructive`, Checkbox's checked error box |
| control boundary | the same | Input's field border, Checkbox's box border |
| ink on the page canvas | the same | Input's error and success messages, Checkbox's error label |
| tint surface | `--error-light`, `--success-light`, … | Badge, Alert |
| ink **on that tint** | `--error-strong`, `--success-strong`, … | Badge, Alert |

A component paints **one colour per state, not two**, and the rule that enforces it
is: `*-strong` never appears without its `*-light` on the same element. It is the
readable step *for that tint*, which is why the dark block lifts it —
`--error-strong` becomes `#ff7a7a`, right on `#2e1414` and a salmon anywhere else.
Put it on the canvas next to a `--destructive` border and the field is outlined in
one red and captioned in another a few pixels away.

`--error` and `--destructive` are the same value in both themes, so the choice
between them is naming, not colour. The reference uses `--destructive` for every
control — Checkbox, Input, InputOTP, Timeline — and the `--error*`
family for every status surface — Badge, Alert, Hero, ServiceStatus. Follow that
split.

**Hover and press steps come from a `-hover` token, never from an opacity
modifier.** `bg-destructive/90` is not a colour; it is an instruction to let 10% of
whatever sits behind the element show through, so it lightens on a white canvas and
darkens on a navy one. `--primary-hover`, `--secondary-hover`, `--accent-hover` and
`--destructive-hover` are the fill roles that carry one; a state wanting a fifth
wants a token, not a slash. (A *static* translucent edge is a different thing —
Alert's `border-error/25` is what the reference's `color-mix` draws.)

## Snap, don't extend

A value sitting between two steps of a scale `app.css` already has takes the
**nearer step**. The scale does not grow to accommodate it. A new token is
justified only when the scale has nothing close, or the concept itself is new — and
it must then be defined for **both** themes.

`--grey-850` is the worked example, and the reason it does not exist: the dark
block wanted a shade between `--grey-800` and `--grey-900` for
`--background-subtle`, and got `--grey-800`, which stays distinct from
`--background` and is close enough. Do not add it back.

ADR 0005 records the reasoning, and `AGENTS.md` is meant to carry the same rule
under Operating rules — but both are local-only, so this paragraph is the copy you
can rely on.

**The spacing "steps" are not one of these scales, and a review that reads them as
one raises false positives.** `:root` lists `--spacing-1` … `--spacing-32` with a
gap where 7 would be, but that block is inert in exactly the way `--font-size-*`
is: it sits outside any `@theme`, so it generates nothing and no utility resolves
against it. What generates spacing is Tailwind's own `--spacing: 0.25rem`
multiplier, which this layer leaves alone — so `gap-7` is 1.75rem off the same
scale as `gap-6` and `gap-8` rather than a step invented between them, and the
quarter-step values already shipping (`px-3.25`, `py-2.75`, `size-8.5`,
`size-4.25`, `w-17`) are the same mechanism. Snap a spacing value when the
*reference* sits between two plausible ones; where it names one, write it.
AppHeader's `gap-7` is the reference's own `1.75rem`, and Checkbox's `h-0.5` row is
what a real snap looks like.

## No `pill` prop, on any component

**A silhouette is a class a call site passes, never a boolean a component
carries.** `class="rounded-full"` is the whole mechanism, and `cn()` already puts
the incoming class last. No component in this library takes a `pill` prop, and
none is to gain one — not a new component, and not one being extended, whatever
its reference `.d.ts` declares.

This is a standing user directive, given more than once: Button's `pill` was
dropped after it shipped, and Input's was dropped during review. Treat a `pill` in
a reference contract the way you treat a token that does not exist — as something
to route around, not to port.

The consequence to accept, rather than design around: **the component keeps one
geometry.** Where a reference's `pill` carries more than a radius — wider side
padding, insets that move with it — a call-site `rounded-full` gets the full radius
on the component's standard insets and nothing else. That is the trade, and it is
directed. Do not reintroduce the second geometry under another name — no `shape`,
no `round`, no `variant="pill"`.

Two things follow for any component that draws a border:

- The `class` prop must reach **the element that draws it**, not a layout
  wrapper, or the escape hatch reaches nothing. Input puts it on the `<input>`
  and hardcodes the wrapper's own classes.
- Pin it with a test that a caller's `rounded-full` actually rounds the control,
  the way `Input.svelte.test.ts` does. It is the
  only thing standing between the directive and a silent regression.

**The radius is the only thing safe to override this way.** A component's
internal geometry does not follow the incoming class: `InputGroup` hardcodes its
insets per size, so `class="px-6"` — the obvious reach for the reference's old
pill padding — moves the field's chrome and leaves the control's text where it
was. Say so wherever you point a call site at `class`.

## Theming

`.dark` on `<html>`, via `@custom-variant dark (&:where(.dark, .dark *))`. Use the
`dark:` variant when you need it. **Never `data-theme`** — the design system's own
reference cards use it, this repo does not.

**The dark canvas is navy, not grey.** The `.dark` block is transcribed from the
design system's `themes.css`: a deep navy family drawn from the brand blue,
layered `--navy-950` canvas → `--navy-900` sunken → `--navy-800` surface →
`--navy-700` card → `--navy-600` accent → `--navy-500` accent-hover. It replaced a
neutral-grey theme that predated the port and that no component could ever have
been made to match.

The `--navy-*` ramp exists to give that block its values, and is deliberately
**not** registered as utilities: there is no `bg-navy-800`, and adding one would
be the raw-token-as-surface bug the contract forbids. The ramp itself is declared
in `:root` and the `.dark` block only reads it, so a step is a constant on both
canvases — which is what lets fixed artwork that may not change with the theme
draw one. `src/lib/components/images/AGENTS.md` is where that is decided. Its eleven steps are the
reference's own role colours ordered by lightness, merged where two sat within
~7/255 of each other. Tailwind's stock ramps cannot substitute — every one bottoms
out at 950, and nearest-match puts `--surface`, `--card-background`, `--accent`,
`--muted`, `--surface-raised` and `--background-muted` all on `sky-950`.

Because the semantic tokens already flip, most components need **no** `dark:`
classes at all. Writing several is the signal that you reached for raw tokens where
semantic ones belong.

`mode-watcher` owns theme state: it writes the class, persists the choice, and
injects the pre-paint script that removes the first-load flash. It is mounted once,
as `<ModeWatcher />` in `src/routes/+layout.svelte`. Do not hand-roll a second
theme store, do not write theme classes onto `<html>` yourself, and do not touch
`src/app.html`. `ThemeToggle` is presentational — see `ThemeToggle.md`. ADR 0006.

**Nothing transitions on a theme change unless it asks to in `!`.** The same runtime
hangs an unlayered `* { transition: none !important }` on the document for the frame
the class flips in, so the page does not cross-fade one component at a time — which
also blanks any animation a component meant to play *on* that flip. Tailwind's
utilities are layered and mode-watcher's sheet is not, and a layered `!important`
outranks an unlayered one, so `transition-colors!` on the element that should move is
the whole opt-out; `duration-*` and `ease-*` ride along on `--tw-duration` /
`--tw-ease` and need nothing. Mark `motion-reduce:transition-none!` alongside it or
reduced motion silently loses. ThemeToggle is the only component that wants this;
reach for it there and nowhere else, and never for `disableTransitions={false}`,
which is app-wide.

## The component library

**One component, one directory.** `src/lib/components/ui/<name>/` — the
directory named in kebab-case, the files inside it keeping the component's
PascalCase.

**Which specifier depends on where you are importing from**, and the two are not
interchangeable style choices:

| Importer | Specifier |
|---|---|
| A route, or any file outside `ui/` | `$lib/components/ui/<name>/<Name>.svelte` |
| A sibling component inside `ui/` | `../<name>/<Name>.svelte` |

The alias is for crossing *into* the library; inside it a relative path is what
says *same collection*, and it keeps a component's own imports readable as the
composition they are. `Button.svelte` is imported both ways in this repo — as
`../button/Button.svelte` from `ui/`, and as `$lib/...` from a route.

A handful of components inside `ui/` reach a sibling through `$lib/` anyway.
That is drift rather than a second convention: match the neighbouring imports in
the file you are editing, and do not churn an existing one to the other form.

**List `src/lib/components/ui/` before you build anything.** That listing is the
inventory; this file deliberately does not cache one, so that adding a component
is a directory added rather than four documents edited. Inside each you will find
`<Name>.svelte`, its sidecar notes as `<Name>.md`, and — where they exist —
`<Name>.svelte.test.ts` and `<Name>.test-harness.svelte`. A name you do not find
is a slice that has not run yet, not a component to hand-roll past. Props,
variants and sizes are not listed here either: they move with every slice, and
the component's own source is where they are true.

`src/lib/components/ui/AGENTS.md` states the directory convention and carries the
list of what is not part of the vocabulary. **That list is empty.** `ui/` holds
**ported and new components alike** — one the reference never drew lands here as
soon as a second call site wants it, and its `<Name>.md` says which kind it is on
its opening line. The list stays a **work queue, not a
freeze**: a directory that lands there without following the design system is
owed one of reuse.md's three verbs, its verdict is recorded beside it there, and
the entry is struck by the change that carries the verb out.

## Primitives and icons

- Interactive components build on **bits-ui**, which already provides Button,
  Checkbox, Switch, Slider, PinInput, Pagination, Avatar, Label and Progress. Do
  not hand-roll focus management, keyboard handling or ARIA that bits-ui gives
  you.
- Icons come from **lucide-svelte**. Do not paste the inline SVGs out of the
  reference components — find the Lucide equivalent. The brand lockup is the
  exception: `$lib/components/icons/tia-logo/TiaLogo.svelte`.
- No new dependencies. `bits-ui`, `lucide-svelte`, `clsx`, `tailwind-merge` and
  `mode-watcher` are installed and sufficient.

## Svelte 5 conventions

- `$props()` with a **typed destructure**; `$bindable()` for two-way values.
- `children?: Snippet` rendered as `{@render children?.()}`. Named slots become
  named snippet props.
- Extend the right DOM attribute type (`HTMLAttributes<HTMLDivElement>`,
  `HTMLInputAttributes`, …) and spread `...restProps` so consumers keep native
  attributes.

## Accessibility floor

Every interactive element gets:

- a visible `:focus-visible` ring — the base layer already sets a global
  `outline: 2px solid var(--ring)` with a 2px offset. Leave it alone unless the
  component draws its own; if it does, two rules bind. **Drop it with
  `outline-hidden`, never `outline-none`** — a `ring-*` is a `box-shadow`, which
  forced-colors mode suppresses, and `outline-none` has already removed the
  fallback, so a focused control ends up with no indicator at all;
  `outline-hidden` leaves the transparent outline the UA repaints. And **the ring
  takes the colour of whatever the component paints its border**: `ring-ring` for
  a control whose border does not move on focus (Input, Checkbox, Switch), and
  the border's own token where the border recolours on focus.
  `--ring` and `--border-focus` are both `--blue` in `:root` and diverge under
  `.dark`, so a ring that disagrees with its border is a light-mode-invisible
  defect — test both themes,
- a real accessible name,
- a 44px minimum hit target on touch — knowingly missed across the shipped
  controls, for the reason in [porting.md](references/porting.md);
  meet it in anything new,
- `aria-*` state that matches the visual state.

Status is never conveyed by colour alone — pair it with text or an icon.

## The runtime-value exception

Inline `style=` is permitted for exactly one case: a prop whose value is
open-ended and only known at runtime. Set it as a custom property on the element
and have the class read it.

```svelte
<header style="--app-header-height: {height}" class="h-(--app-header-height)">
```

`h-(--app-header-height)` is the v4 shorthand for `h-[var(--app-header-height)]`,
and is what `enforce-canonical-classes` rewrites the bracketed form into. It names
a property rather than baking in a value, so it is not the arbitrary value the
contract bars.

Anything with a **closed** set of values stays a class — a variant, a size and a
radius are all closed sets. Which components take the exception is not listed
here: it moves with every slice, and a `style=` setting a custom property from a
prop or a measurement is the rule being followed rather than drift. Read the
value before calling one a violation.

**Slider's fill percentage was the third case and is not one.** Issue 13 specified
it as the exception's whole reason, and building on the primitive removed the need:
`Slider.Range` positions the fill itself, off the same scale the thumb uses. That
matters rather than merely tidying, because the scale is not linear — with the
default `thumbPositioning="contain"` the thumb is inset by half its width, so
`(value - min) / (max - min)` overshoots the thumb's centre by 10px at the ends. A
hand-set `--slider-fill` is therefore a defect, not a permitted exception. See
`Slider.md`.

## Verification loop

After every slice, repeat until clean: `bun run lint` and `bun run check`, fix
every issue by hand, then `bun run lint:fix` for the rest, then re-run both. Zero
errors and zero warnings — `check` runs `svelte-check --fail-on-warnings`.

Then the browser pass below, which is the other half of the loop and not optional.

## The browser pass

**Every component is seen rendered before it is called done** — the new one you
just ported and the existing one you just edited alike. Every variant, size and
state on its playground route, in **both themes**, in a browser served by the
**adapter's own server**. It is an acceptance criterion on every UI issue,
and the reviewer repeats it.

Three rules, each bought by a wrong answer in this repo:

**The adapter's server, not `vite preview`.** This app ships
`svelte-adapter-bun`, so preview is not the server it runs on and its answers are
not evidence. Measured 2026-08-15 on the Masonry slice: under
`bunx vite preview --port 4055` the new `/playground/design-system/masonry`
returned a genuine SvelteKit 404 and the long-established `.../alert` returned
500, while `/playground/design-system` returned 200 — all three present in
`build/server/manifest.js` with the same shape. The same build under the adapter
returned 200 for all three.

```
bun run build
PORT=4056 bun build/index.js
```

Confirm exactly one listener before trusting a response — `lsof -nP
-iTCP:4056 -sTCP:LISTEN` — and request `127.0.0.1:4056`, not `localhost:4056`.
bun binds IPv4 while a stale node process binds IPv6 `[::1]`, macOS resolves
`localhost` to `::1` first, and two servers sharing one port means you debug a
phantom. Kill by pid when the slice is done.

**Headless by default.** `playwright-cli open <url>`, no mode flag; run headed
(`--headed`) only when the task explicitly asks for it. The default has one
blind spot: headless Chromium ignores `::-webkit-scrollbar` outright and
reports a 0px gutter with or without it, which reads as "the rule does not
apply" — two separate reviews reached the wrong conclusion from that before it
was measured. A scrollbar or real-paint verdict therefore needs a headed run;
short of one, report that check as not run, never as passed.

**Both themes, on one page.** `design-system/+layout.svelte` carries the
light/dark toggle; flip it rather than rendering the page twice under a `.dark`
wrapper. A component that reads correctly in light and vanishes in dark passes
lint, `check` and its own tests.

What the browser catches and nothing else does: a control drawing at the wrong
size, content clipped or overflowing its container, a surface that collapses into
its background in one theme, a focus ring hidden behind a sibling, a scrollbar
(headed runs only), and layout that only breaks at a real viewport width.

**`touch src/app.css` first, if the slice introduced a utility the repo had never
used.** The long-running dev server picks a new component file up only partially:
ThemeToggle's `size-3.25` and `size-4.75` were generated while `size-4.25`,
`w-17` and `h-7.5` — same file, same object literal — were not, so the demo page
drew a 21px button where the build draws 42px, which looks exactly like a
component whose sizes are wrong. Touching the entry point forces the full rescan.
A fresh `bun run build` cannot show you this artefact at all, which is the second
reason the browser pass builds rather than reusing a dev server.

## Related

- **`src/lib/components/ui/<name>/<Name>.md`** — one component's own deviations,
  in its directory. Read the one you are touching; write one when you port a new
  component. `src/lib/components/ui/AGENTS.md` states the convention.
- **`design-system-port`** — ports one reference component per invocation.
- **`design-system-adherence`** — read-only reviewer for token drift, theming and reuse. Run
  it after any UI change.
- Skills: **svelte-sveltekit** (runes, snippets, SSR), **tailwind-css** (v4
  `@theme` semantics), **bits-ui** (the primitives), **shadcn-svelte-ui** (the
  variant/`cn()` patterns already used in `ui/button/Button.svelte`).
