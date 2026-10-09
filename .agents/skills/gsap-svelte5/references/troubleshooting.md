# Troubleshooting

Symptom first. Most of these are one of three root causes: **two owners on one property**, a **stale measurement**, or **cleanup that reverted nothing**.

## Nothing animates

| Check | Fix |
|---|---|
| Plugin used but never registered | `gsap.registerPlugin()` in `src/lib/gsap.ts`, and import `gsap` from there |
| Selector matched nothing | The scope argument was omitted or the wrong root was passed — GSAP warns `GSAP target .foo not found` in the console |
| Animation created outside the browser | Only `{@attach}` and `$effect` run client-side; module scope and `load()` do not |
| Property already at its target value | `gsap.to(node, { x: 0 })` on an untransformed element is a no-op |
| ScrollTrigger on a timeline child | It belongs on the timeline or a top-level tween |

## Element is invisible, or stuck mid-animation

- **A `from()` that ran and then re-ran** — switch to `fromTo()` ([core.md](core.md)).
- **The teardown called `kill()`** where it needed `revert()`.
- **No teardown at all.** A component that unmounts mid-tween leaves the styles; remount, and the "from" state is already applied.
- **Reduced motion registered only under `no-preference`.** A reduced-motion user never runs the handler, so an element styled to fade in never fades in. Register both conditions — [accessibility.md](accessibility.md).

## Motion is janky, doubled, or fights itself

A second owner on the property, nearly always. In order of likelihood:

- **A CSS `transition`** on the same property — remove `transition-*` utilities from GSAP-animated elements.
- **A Svelte `transition:` / `animate:flip`** on the same node — same collision, Svelte-side.
- **Two tweens on one property.** Add `overwrite: 'auto'` to the one that should win.
- **Layout properties instead of transforms.** `width`, `height`, `top`, `left`, `margin` force layout every frame; `x`, `y`, `scale`, `rotation`, `autoAlpha` stay on the compositor. `height: 'auto'` on a small disclosure panel is the tolerable exception.
- **Blanket `will-change`** — hold it to the handful of elements mid-animation.
- **A tween created per frame or per pointer move.** Use `gsap.quickTo()` or `gsap.quickSetter()` — [core.md](core.md).

## Flash of the wrong state on mount

The element renders in its final state, then jumps back when the tween starts.

- `from()` and `fromTo()` apply the start state at *creation* via `immediateRender: true` — so this means the tween is being created later than mount. Move it into the attachment, not a delayed callback.
- With SSR, the server renders the final markup and the attachment runs on hydration. GSAP's own answer is `visibility: hidden` in the stylesheet plus an entrance that animates `autoAlpha`, which flips `visibility` back the instant opacity clears 0 — so the element stays hidden until JS owns it. Undo the hiding inside `<noscript>` so the content survives a JS failure.
- Stacked `from()`/`fromTo()` tweens on the same property — `immediateRender: false` on the later one ([core.md](core.md)).

## ScrollTrigger fires at the wrong position

Always a stale measurement.

| Cause | Fix |
|---|---|
| SvelteKit client-side navigation | `afterNavigate(() => ScrollTrigger.refresh())` in `+layout.svelte` |
| Webfont loaded after mount | `await document.fonts.ready` then `ScrollTrigger.refresh()` |
| Images without intrinsic dimensions | Set `width`/`height` or an `aspect-ratio` — the `load` refresh is automatic, but a lazily-loaded image lands after it |
| Async content, accordions, "read more" | `ScrollTrigger.refresh()` after the height settles |
| Triggers created out of page order | `refreshPriority` — lower refreshes first |
| Viewport-dependent start/end | Make them functions and add `invalidateOnRefresh: true` |

If it still misfires after a refresh, turn on `markers: true` and compare where the trigger thinks it is.

## ScrollTrigger doesn't fire at all after a route change

The instance was created against DOM that no longer exists. Component attachments revert themselves; anything created in `$effect` against a shared root needs its own teardown. `ScrollTrigger.getAll().forEach((t) => t.kill())` is the blunt reset when debugging, but the real fix is a teardown on the thing that created them.

## Pinning breaks the layout

- **Page collapses by the pinned height** — `pinSpacing: false` was set without the layout reserving that space.
- **Pinned element jitters** — something else is transforming it; animate its children, not the pinned element itself.
- **Pin misbehaves under ScrollSmoother** — `pinType` needs to be `"transform"` for a smooth-scrolled container. ScrollSmoother sets this itself; a hand-rolled `scrollerProxy` does not.

## `position: fixed` stops working

`ScrollSmoother` transforms `#smooth-content`, which creates a containing block — every `position: fixed` descendant then pins to the content rather than the viewport. Move headers, modals and toasts **outside** `#smooth-wrapper`.

## Text splits at the wrong words, or duplicates

- **Split ran before the webfont loaded** — `autoSplit: true`. Since `3.15` there is no console warning for this, so it fails in silence.
- **The animation sits outside `onSplit`**, or the teardown skips `split.revert()` — [plugins.md](plugins.md).

## Types don't resolve

`gsap` ships its own `types/`, no `@types/gsap` needed — installing that package shadows the real ones with GSAP 2 definitions. Plugin types come with their entry point: `import { ScrollTrigger } from 'gsap/ScrollTrigger'`. Tween and timeline instances are `gsap.core.Tween` and `gsap.core.Timeline`. Attachments are typed `Attachment<HTMLElement>` from `svelte/attachments`.

## Diagnostics

- `markers: true` on the trigger — draws start and end for both trigger and scroller.
- `GSDevTools.create()` — scrubber, playback controls and timeline inspector; dev only.
- `gsap.globalTimeline.getChildren()` — everything currently alive, which is how a leak shows itself.
- `ScrollTrigger.getAll().length` — climbing across navigations means triggers are not being cleaned up.
- `console.log(gsap.getProperty(node, 'x'))` — what GSAP thinks the current value is, as opposed to what the stylesheet says.
