# Tests

The one test seam, how a `$bindable` is read back, and the three jobs a
`.test-harness.svelte` does. Read this when writing or changing a component's
test.

One seam: the `client` vitest project runs `*.svelte.test.ts` in real Chromium
through Playwright with `@testing-library/svelte`. Prior art:
`src/lib/components/ui/alert/Alert.svelte.test.ts` and
`src/tokens.svelte.test.ts`. No new infrastructure.

**A `$bindable` has to be read back, and there are two sanctioned ways.**
`render()` hands props in and never hands them back, and runes do not work in a
`.svelte.test.ts`, so the value a call site actually binds cannot be read without
one of them. Pick by what the component's binding runs through:

- **A getter/setter pair passed straight to `render()`** — an object literal with
  `get value()` / `set value(next)`, which is exactly what `bind:` compiles to, so
  the test reads what the component wrote. Plain JS, no rune, no extra file.
  `Input.svelte.test.ts` is the pattern, and it is the lighter one: prefer it for a value the component owns directly, like an
  `<input>`'s.
- **A `<Name>.test-harness.svelte` beside the component** — a parent that binds and
  prints what it holds, with the test reading the printed line;
  `Checkbox.test-harness.svelte` is the pattern. Spread `restProps` **before** the
  `bind:` directives, so a bindable the harness does not itself destructure cannot
  be clobbered by the spread. Reach for this when the binding is round-tripped by a
  primitive — Checkbox and Switch both hand theirs to bits-ui — since then what you
  want to assert is that the *primitive's* write reaches the parent.

**A harness also earns its place when the behaviour needs a sibling mounted**, and
`ThemeToggle.test-harness.svelte` is that case rather than a `$bindable` one: it is
a pass-through that mounts `<ModeWatcher />` beside the component, because the dark
class name is a *prop* of that component and the store underneath it defaults to
`[]` — so without the pair, the runtime writes no class at all and a test of what
activating the toggle does to the document passes on nothing.
`ColorSwatch.test-harness.svelte` is the second of these and needs it for the
mirror-image reason — that component *reads* the class rather than writing it, and
`setMode("dark")` moves nothing without `<ModeWatcher />` mounted to put the class
up. It also renders its component from an array, so one render can compare several
tokens at once, which is what the follows-the-theme assertions need.

**And when a component composes real children**, which `render()` cannot hand it:
`createRawSnippet` renders a string of HTML, so a Snippet holding actual components
has to be written in a parent. `Timeline.test-harness.svelte` is that case — the
composed-children mode, and the rule that an `items` array beats it, are both
untestable without one. Say in the harness which of the three jobs it is doing.

A harness is a fixture rather than a component in its own right, even though it
sits in the component's directory. Nothing imports it but its own test.

**They run under `bun run test`, not `bun run test:unit`** — that is the server
project only, and will silently report success without having run a single one of
them.

A good test asserts what a user or assistive technology can observe: role,
accessible name, `aria-*` matching the visual state, keyboard interaction, bound
values, what appears and disappears. **Asserting class strings is testing the
implementation and is not acceptable** — a component must be restylable without a
test changing. The exception is computed style, where the browser is real: the
token layer, and a published geometry contract like Button's size table — the
ramp that collapsed when `text-md` generated nothing is exactly what lint and
`check` cannot see.

Vitest runs without `globals`, so Testing Library's automatic cleanup never
registers. A file that renders more than once needs `afterEach(cleanup)`, or its
second query finds several elements and fails for a reason that has nothing to
do with the component.

**The sandbox has a phantom hover.** Linux headless Chromium — where every
sandbox ticket runs this suite — parks its virtual mouse at (0,0) and
synthesizes a `pointerenter` over whatever paints there; macOS starts the
cursor off the page, so a test that lets ambient hover decide behaviour is
green on a Mac and red in the sandbox. The carousel's autoplay tests were the
incident: `pauseOnHover` read the phantom as a reader on the carousel and
froze autoplay, in-container only. Hover state belongs to the test: drive it
with explicit `fireEvent.pointerEnter` / `pointerLeave`, and pin a
hover-driven default off (`pauseOnHover: false`) when hover is not what the
test asserts.
