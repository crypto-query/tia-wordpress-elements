# ScrollTrigger

A ScrollTrigger measures a trigger element against the scroller once, then acts on scroll. Almost every ScrollTrigger bug is a **stale measurement** — the layout changed after the measurement was taken.

## Where it goes

On a **top-level** tween or on the **timeline** — never on a child of a timeline.

```javascript
// right
gsap.timeline({ scrollTrigger: { trigger: '.section', start: 'top 70%' } })
  .from('.heading', { autoAlpha: 0, y: 24 })
  .from('.card', { autoAlpha: 0, y: 24, stagger: 0.08 }, '-=0.2');

// wrong — a nested ScrollTrigger does not work
gsap.timeline().from('.heading', { autoAlpha: 0, scrollTrigger: { trigger: '.section' } });
```

`ScrollTrigger.create({ … })` with no `animation` is for when the trigger drives something other than a tween — a class toggle, a progress readout, a callback.

**Two scrubbed tweens on the same property of the same element** fail in a way that reads as a GSAP bug: a ScrollTrigger caches its start value when the tween is *created*, not when the scroll reaches it, so the second tween starts from the element's original value and the property snaps back before animating again. Give the later tween `immediateRender: false`, state both ends with `fromTo()`, or put both on one timeline under a single trigger.

## start and end

Format is `"triggerPosition scrollerPosition"`: `start: 'top 70%'` fires when the trigger's top reaches 70% down the viewport. Also accepted: a pixel number, `"+=300"` / `"+=100%"` relative to the start, `"max"`, or a function returning any of those (re-evaluated on every refresh — the right choice for anything depending on viewport size).

`clamp()` keeps a trigger inside the page bounds so a section near the top or bottom still completes: `start: 'clamp(top bottom)'`.

## Config worth knowing

| Property | Notes |
|---|---|
| `trigger` | element or selector; `scrollTrigger: '.section'` is shorthand for this alone |
| `start` / `end` | default `"top bottom"` / `"bottom top"` (`"top top"` for `start` when pinned) |
| `endTrigger` | when the end is measured against a different element |
| `scrub` | `true` ties progress directly to scroll; a number is seconds of catch-up lag |
| `toggleActions` | four states in order — onEnter, onLeave, onEnterBack, onLeaveBack. Default `"play none none none"` |
| `pin` | `true` pins the trigger; pass an element to pin an ancestor instead |
| `pinSpacing` | default `true`, inserts a spacer so layout doesn't collapse |
| `once` | kills the trigger after the first completion; the animation keeps running |
| `scroller` | a scrollable container instead of the viewport |
| `refreshPriority` | lower refreshes first; needed when triggers are created out of page order |
| `id` | for `ScrollTrigger.getById()` |
| `markers` | dev only — a leftover `markers: true` in production is a visible bug |
| `invalidateOnRefresh` | re-reads start/end values on refresh; pair with function-based values |
| `onEnter` / `onLeave` / `onEnterBack` / `onLeaveBack` | receive the instance |
| `onUpdate` / `onToggle` / `onRefresh` | `onUpdate` gives `self.progress`, `self.direction`, `self.getVelocity()` |

A scrubbed animation's duration is forced to fit exactly between `start` and `end`, so raising `duration` does nothing. To make a scrub last longer, push the end out — `'+=600'` instead of `'+=300'`.

## Pinning

```javascript
gsap.timeline({
  scrollTrigger: { trigger: '.panel', start: 'top top', end: '+=1000', pin: true, scrub: 1 }
}).to('.panel .art', { xPercent: -50 });
```

Pin the section, animate its **children** — animating the pinned element itself fights the pin's own transform. `pinSpacing: false` only when the surrounding layout already reserves the space, otherwise the page collapses by the pinned height.

## Batching

`ScrollTrigger.batch()` creates one trigger per target and groups callbacks that fire close together, so a grid of cards entering the viewport animates as one staggered group rather than N independent tweens. It replaces hand-rolled `IntersectionObserver` code.

```javascript
ScrollTrigger.batch('.card', {
  start: 'top 85%',
  onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.1, overwrite: true }),
  onLeaveBack: (batch) => gsap.set(batch, { autoAlpha: 0, y: 24, overwrite: true }),
  batchMax: 4
});
```

Batched callbacks receive `(elements, triggers)` — an **array**, not a single instance. `interval` caps how long a batch collects (default ~one frame); `batchMax` caps its size and accepts a function so it can respond to layout.

Do not pass `trigger`, `scrub`, `snap`, `toggleActions` or `animation` to `batch()` — the targets *are* the triggers.

## Refresh

`ScrollTrigger.refresh()` re-measures everything. Four events already trigger it: `resize` (debounced 200 ms), `load`, `DOMContentLoaded`, and `visibilitychange` when the viewport changed while the tab was hidden. `ScrollTrigger.config({ autoRefreshEvents: … })` edits that list.

So refresh by hand for what those four miss: SvelteKit navigation, webfonts that land after `load`, lazily-loaded images, accordion or "read more" height changes, and async content.

```javascript
await document.fonts.ready;
ScrollTrigger.refresh();
```

Refresh runs in **creation order**, or by `refreshPriority` when set. Triggers created out of page order — a lazily rendered section, an `{#await}` block, a route-level component mounting after a layout one — mismeasure unless the earlier-on-page trigger gets the lower `refreshPriority`.

Layout-dependent values should be **functions**, so a refresh re-reads them, with `invalidateOnRefresh: true` on the trigger:

```javascript
gsap.to('.track', {
  x: () => -(track.scrollWidth - window.innerWidth),
  ease: 'none',
  scrollTrigger: { trigger: '.track', scrub: 1, invalidateOnRefresh: true }
});
```

**`scroll-behavior: smooth` is already handled.** A refresh scrolls to 0 to measure, which a smooth-scrolling document would animate rather than jump — so ScrollTrigger reads `scroll-behavior` off the scroller when it first attaches, flips it to `auto` for the duration of the refresh, and restores it a frame later. Stripping the declaration from your CSS buys nothing (it is read once at attach, so only a `scroll-behavior` switched on *later* escapes it). What does have a lasting effect is `snap`: any trigger using it writes `scroll-behavior: auto` inline on `<html>` and `<body>`, so native smooth anchor scrolling stops working page-wide.

## Horizontal scroll — `containerAnimation`

Pin a section, move its contents sideways as the user scrolls vertically, then hang further triggers off that horizontal motion:

```javascript
const scrollTween = gsap.to('.track', {
  xPercent: -100 * (panels.length - 1),
  ease: 'none',                        // required — anything else desyncs scroll from position
  scrollTrigger: { trigger: '.wrapper', pin: true, scrub: 1, end: '+=3000' }
});

gsap.from('.panel-2 .art', {
  autoAlpha: 0,
  scrollTrigger: { containerAnimation: scrollTween, trigger: '.panel-2', start: 'left center' }
});
```

`ease: 'none'` on the container animation is non-negotiable; any other curve breaks the 1:1 mapping between scroll and horizontal position. Positions in the child triggers are read horizontally (`"left center"`). Pinning and snapping are unavailable on `containerAnimation` triggers.

## ScrollSmoother

Requires an exact DOM structure, which in SvelteKit means `+layout.svelte`:

```html
<div id="smooth-wrapper">
  <div id="smooth-content">
    <!-- everything -->
  </div>
</div>
<!-- position: fixed elements go OUT here -->
```

The transform on `#smooth-content` creates a containing block, so any `position: fixed` element inside it pins to the content instead of the viewport — headers, modals and toasts must live outside the wrapper.

```javascript
ScrollSmoother.create({ smooth: 1, effects: true, normalizeScroll: true, ignoreMobileResize: true });
```

`effects: true` enables the `data-speed` and `data-lag` attributes for parallax without writing tweens. `normalizeScroll` moves scrolling onto the JS thread so mobile address-bar resizes stop desyncing triggers — it does not stop the address bar itself from hiding. `ignoreMobileResize` suppresses the refresh on vertical resize that otherwise makes the page jump.

Calling `ScrollTrigger.refresh()` while ScrollSmoother is active can nudge the scroll position; refresh on deliberate layout changes rather than defensively.

## Performance

- `pin: true` promotes a layer, so pin only what needs it — and prefer a small `scrub` number (`scrub: 1`) to `scrub: true`, which smooths the motion and cuts per-frame work at the same time.
- Push `self.progress` from `onUpdate` through a `gsap.quickSetter` rather than creating a tween per update — [core.md](core.md).
- `once: true` retires an entrance trigger after it has done its job.
