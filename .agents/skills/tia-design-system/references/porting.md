# Standing port decisions

The rules a port follows, and the ledger of what the token layer was built
differently from. Read this when porting a reference component to Svelte, or when
asking why a published contract was not transcribed as written. Everything else
about writing a component is in SKILL.md.

The design system's `.d.ts` files are authoritative for prop names, unions and
defaults. Repo constraints win only on mechanism: theming, tokens, and Lucide
icons in place of the reference's inline SVGs.

Every one of these was settled by a component that hit it first, and then
re-settled the same way by each component after it. They are the rules, not
precedents — a new port follows them without re-deriving them, and without adding
a row to its own `<Name>.md` to say it did. Only a genuine *departure* from one is
worth recording there.

**`bind:` is what the controlled/uncontrolled split becomes.** The reference's
`value` ｜ `defaultValue` ｜ `onChange` triple is React's way of spelling a thing
Svelte spells with one `$bindable()`. Checkbox, Switch, Input, InputOTP and
Slider all made this call. A primitive's own `onValueChange` /
`onCheckedChange` survives beside it where a call site needs to compute from the
change; an `onChange` alias next to it would be two names for one callback.

**One short line is a `string`; a slot is a `Snippet`.** A `ReactNode` prop
holding a title, a label, a description, a caption or a status word becomes a
`string` — a Snippet would make every call site open a snippet block for a
phrase, and anything richer is a composition that belongs in `children`. A prop
that genuinely holds markup — an `icon`, a body — is a `Snippet`. Alert's
`title`, Checkbox's `label` and `description`, Slider's `label`, ServiceStatus's
three text props and TimelineItem's `title` and `time` are the settled cases.

**`className` and `style` are React spellings.** `className` becomes `class`
and goes through `cn()`. `style` is dropped — SKILL.md's runtime-value exception
is for a prop no class can hold, which a passed-through `style` is not.
`autoFocus`, `type` and other props the platform already has reach the element
through the rest spread rather than being destructured.

**Where the reference wraps everything in a `<label>` it always renders**, the
class goes on the label block when there is text and on the control itself when
there is not — Checkbox and Switch both do this. SKILL.md's *No `pill` prop*
carries the rule this serves, and the test that pins it.

**Borders snap to 1px.** The reference draws `1.5px` throughout. Tailwind v4
takes any *whole* number as a bare border width, so `border-3` is real, but
`border-1.5` generates nothing at all and sits there drawing no border. Only
`border-[1.5px]` reaches it, which is an arbitrary value, and Chromium computes
it to 1px anyway. So `border`.

**The reference's focus tokens do not survive.** `--focus-ring` and
`--focus-ring-secondary` have no dark values and are invisible on a dark canvas;
a `0 0 0 3px color-mix(in srgb, <token> 22%, transparent)` is an arbitrary value
no utility holds. A primitive that puts focus on the control itself needs
**nothing** — the base layer's global `:focus-visible` outline lands on it, which
is what Checkbox, Switch and Slider take. A component drawing its own ring takes
`ring-*` under SKILL.md's accessibility floor.

**Disabled dims to `opacity-50`.** The reference's 0.6 and 0.9 both snap to it;
Button, Input, Checkbox, Switch, Slider and InputOTP all carry it.
It goes on whatever the dim has to take with it — the wrapper where a label would
otherwise stay bright over a greyed-out control.

**One `transition-property` and one easing per element.** The reference routinely
names three to five properties across two easings, which needs an arbitrary value
for the property list. `transition-all` or the one relevant `transition-*`, one
`duration-*`, one easing. Button, Card, Switch and ThemeToggle are the settled
cases.

**`ease-in-out` in a class is Tailwind's stock easing, not this layer's.**
`@theme inline` registers only `--ease-out-soft` and `--ease-snap`, so no class
can reach the `--ease-in-out` sitting in `:root`. The two hold the same
`cubic-bezier(0.4, 0, 0.2, 1)`, so nothing renders wrong — but they are matched
**by value** and have to be kept in step by hand, the same standing arrangement
as `backdrop-blur-sm` against `--glass-blur`. ThemeToggle, TimelineItem and Video
all ride on it.

**`--primary-foreground` is how you paint white ink.** The reference names
`var(--white)` for a mark, a knob or a glyph on a filled control; naming it
directly is the raw-token-as-ink bug. `--primary-foreground` is white in **both**
blocks, so it paints the reference's colour without pinning a raw one, and it
stays correct when the fill under it swaps family. Checkbox's mark, Switch's
knob, TimelineItem's markers and Video's chrome all take it. `--surface` is the
trap: it is navy under `.dark`.

**A message already in `aria-describedby` does not also get `role="alert"`.**
An error string that is the field's description is read at focus time; an alert
role announces it a second time, assertively. Input and InputOTP both dropped
it. The exception is a message that arrives **while the field is
still focused** — a swap into a described element is announced by no major screen
reader, so that one needs `aria-live="polite"` on the element carrying both the
hint and the outcome. InputOTP is the case; its async check is why.

**The 44px touch floor is missed library-wide, and it is not a slice-local fix.**
Checkbox's boxes are 16 ｜ 20 ｜ 24px, Switch's track 46 × 26, Slider's thumb 20,
ThemeToggle's boxes 36 ｜ 42, Button's heights h-9 ｜ h-10 ｜ h-11. A 44px
pseudo-element on a 16px box overlaps its neighbours in the stacked lists these
components exist for, and the later element wins the overlap — so a tap toggles
the wrong row. Growing them changes published geometry. Record the gap; do not
close it in a component slice.

**A status that carries no message is colour alone, and closing that is the
caller's job.** Message props are optional across this library, so
`status="success"` with no text is a recoloured border and nothing else. Where a
component has a message prop, its docs say to pass one with the status. Where it
does not — Slider — the meaning goes in the `label`, which is the only text the
component renders. `aria-invalid` still reaches assistive technology on the error
path; nothing reaches a sighted user who cannot separate the hues.

**No component names its own `font-family`.** The reference sets
`fontFamily: var(--font-secondary)` on Button, Badge, Switch, Slider, Timeline
and AppHeader; `body` already carries that family, so the class is a no-op
everywhere but inside a heading, where a nested pill would drag `--font-primary`
along with it. A component that names its own family is one more to keep in step
when the family changes. The inverse is real and is not this rule: InputOTP's
slots name `font-heading` **on purpose**, because a digit in a code field is
Poppins by design — do not delete that one as redundant.

## Token layer

The departures above hold across components. These belong to the token layer,
which is no component's — they are why `app.css` does not transcribe the
reference's contract literally.

| Contract | Built as | Why |
|---|---|---|
| six glows named `--shadow-{primary,secondary,destructive}` | `--shadow-btn-*` | this stylesheet names shadows by component role, and two of the reference names shadow existing shadow-colour utilities |
| `--lift-sm`, `--lift-md` | not transcribed | Tailwind v4 has no `--translate-*` namespace, so no class could ever reach them; `-translate-y-0.5` / `-translate-y-1` are the same values |
| dark `--destructive: #ff5a5a` on white ink | `var(--error)` | the reference pairing is 2.9:1 and fails AA; `--error` carries white at 5.3:1 and reads fine on navy. The one place the dark theme departs from `themes.css` |
| light `--primary-hover: #0e2a90` | `var(--dark-blue)` | a saturated indigo outside the brand family; the pressed state snaps to the existing step below `--primary` |
| no `--destructive-hover`; Button carries `#b00000` as a literal | `--destructive-hover: #b00000`, stated in both blocks | every other interactive fill role already has its `-hover` step, and lacking one is what pushed Button onto an opacity modifier that painted the wrong colour. It is the same value on both canvases, for the reason `--destructive` is: a filled button's job is to carry white ink, and the darker red carries it better — **7.4:1 against 5.2:1** — so there is nothing for the dark block to lift it for |
| dark values as literal hexes | the `--navy-*` ramp | the theme block names steps rather than repeating twenty magic numbers; the hexes live once, in the palette |
