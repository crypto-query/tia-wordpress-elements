---
name: gsap-svelte5
description: GSAP 3.13–3.15 in Svelte 5 — attachment lifecycle, scoped cleanup, ScrollTrigger, reduced motion, and the free plugin set. Use when writing or reviewing GSAP code, building scroll-driven or timeline animation, or choosing between GSAP and CSS.
version: 2.2.0
scope: animation
distribution: author-only
---

# GSAP in Svelte 5

Verified against **gsap 3.15.0**. The Svelte side needs **5.29+** for `{@attach}` and **5.7+** for `prefersReducedMotion`. Behaviour introduced in `3.13`, `3.14` or `3.15` is tagged at the point of use — check the installed version before reaching for it. GSAP has been **100% free including every plugin since 3.13** (April 2025) — Club tiers, the private npm registry and `gsap-trial` are all gone, and a large share of the GSAP advice in training data predates that.

Both libraries write **inline styles**: GSAP on every frame, Svelte from `style:`, `transition:` and `animate:`, and a CSS `transition` interpolates whatever either of them sets. One property must have one owner. Most visual bugs in this skill are a version of two owners on one property.

## Where to look

| File | Read it for |
|---|---|
| [lifecycle.md](references/lifecycle.md) | `{@attach}` as the mount, the `$effect` fallback, **scope** and **revert**, the registration module, the SSR facts, SvelteKit navigation |
| [core.md](references/core.md) | `from` vs `fromTo` and `immediateRender`, transform aliases, `autoAlpha`, stagger, eases and `3.15` `easeReverse`, keyframes, timelines and the position parameter, `quickTo` |
| [scrolltrigger.md](references/scrolltrigger.md) | trigger config, pin, scrub vs `toggleActions`, `batch()`, **refresh** and `refreshPriority`, `containerAnimation`, ScrollSmoother's required DOM |
| [accessibility.md](references/accessibility.md) | `gsap.matchMedia()` conditions, Svelte's `prefersReducedMotion`, what "reduce" should actually do, responsive breakpoints |
| [plugins.md](references/plugins.md) | the full roster with import paths, the `3.13` SplitText rewrite, Flip, Draggable, Observer, lazy loading |
| [troubleshooting.md](references/troubleshooting.md) | symptom-first: nothing animates, styles stick, triggers fire at the wrong place, flashes on mount |

## Working rules

**`{@attach}` is the mount; `$effect` is the fallback.** An attachment receives the element as its argument, so there is no `bind:this` and no window in which the node is `undefined`; it runs only in the browser, so no `browser` guard is needed; and its returned teardown fires on destroy *and* before every re-run. Reach for `$effect` only when the animation has no single owning element — a window-level `Observer`, a `ScrollTrigger` on `document.body`, or coordination across several roots.

**Always `revert()`, never `kill()`.** `kill()` stops the tween and abandons the inline styles wherever the playhead happened to be; `revert()` kills *and* restores what was there before. Every teardown ends in `ctx.revert()`, `mm.revert()` or `tl.revert()`. This is also why a component that animates on mount, unmounts mid-tween and remounts looks correct only under `revert()`.

**Give every selector a scope.** `gsap.context(fn, root)` and `mm.add(query, fn, root)` both take the container as their last argument, and selector text inside the callback is then searched only within that subtree. Without it, `.card` in one instance of a component animates every `.card` on the page — and the bug only shows up once a second instance renders.

**Import and register anywhere; there is no SSR hazard.** Every plugin in the package imports cleanly under Node with no `window` and no `document` — verified across all 25 entry points — and `gsap.registerPlugin()` only stores class references. Centralise registration in one module (`src/lib/gsap.ts`) and import `gsap` from there, so a plugin is never used before it is registered.

**Reach for CSS first, GSAP for sequence and control.** GSAP earns its place when motion must be sequenced, scrubbed, interrupted, reversed, or driven by values computed at runtime. Hover, focus and open/close of a single property are cheaper and more robust as `transition-*` utilities or a `@keyframes` animation — and an element carrying both is the two-owner bug.

**For API detail beyond these files, fetch the docs as markdown.** Every docs page has a `.md` twin — `gsap.com/docs/v3/GSAP/gsap.quickTo().md` — and `gsap.com/llms.txt` indexes all of them, so prefer those to scraping the HTML. `docs/v3/HelperFunctions` is a library of finished solutions — seamless loops, image-sequence scrubbing, directional snapping, Lottie — worth reading before hand-rolling one. GreenSock also ships official agent skills at `github.com/greensock/gsap-skills` and a demo hub at `demos.gsap.com`; there is no GSAP MCP server. **Their prose lags their source:** the framework guide still teaches Svelte 4 `onMount`, and `resources/st-mistakes` still says to strip `scroll-behavior: smooth`, which ScrollTrigger now neutralises itself. Settle a surprising claim against the installed package — every plugin ships unminified.

## Corrections to common assumptions

Ordered by how often each one actually produces broken code:

- **`onMount`/`onDestroy` is the Svelte 4 pattern.** In Svelte 5 the element-scoped lifecycle is `{@attach}`; `onMount` still works but reintroduces `bind:this` and its ordering hazards.
- **There is no `@gsap/svelte`.** The package does not exist on npm — `@gsap/react`'s `useGSAP` hook is React-only. `{@attach}` plus `gsap.context()` is the equivalent; don't install a third-party wrapper for it.
- **Guards around GSAP imports are dead code.** `typeof window`, `if (browser)`, `await import('gsap/ScrollTrigger')` and deferring `registerPlugin()` into `onMount` all solve a problem that does not exist.
- **`gsap.context()` is not deprecated** and has no non-React replacement. It was added in 3.11 and is still the documented way to batch-revert and scope.
- **`gsap.matchMedia()` already *is* a context.** It scopes and reverts internally, and nesting it inside `gsap.context()` gives you two cleanup owners. Use one or the other, and end its teardown with `mm.revert()`.
- **Use `fromTo()` wherever the animation can be interrupted.** `from()` reads the current value as its *end* value, so a second trigger mid-flight bakes the mid-animation value in as the destination — the element ends up dimmer or shorter every time.
- **`autoAlpha`, not `opacity`.** At `0`, `autoAlpha` also sets `visibility: hidden`, so the element stops swallowing clicks and stops being announced. A faded-out `opacity: 0` overlay is a classic dead-click bug.
- **ScrollTrigger belongs on the timeline, never on a child tween.** `gsap.timeline({ scrollTrigger: {...} }).to(...)` — not `.to('.a', { scrollTrigger: {...} })`. Nested ScrollTriggers inside a parent timeline do not work.
- **`scrub` and `toggleActions` are mutually exclusive.** Both on one trigger is not a richer configuration; `scrub` simply wins and `toggleActions` is ignored.
- **`x: "50%"` is not `xPercent: 50`.** Percentage strings in `x`/`y` behave unpredictably once combined with other transforms — that is what `xPercent`/`yPercent` exist for.
- **`yoyoEase` is deprecated as of `3.15`** in favour of `easeReverse`, which also applies to plain `.reverse()`, not just yoyo repeats. `3.15` rewrites `yoyoEase` to `easeReverse` internally, so existing code keeps working.
- **CSS `animation-timeline` is not a portable ScrollTrigger replacement.** Scroll-driven CSS animations are still *limited availability*, not Baseline, so a `@supports (animation-timeline: scroll())` fallback is mandatory if you go CSS-first.
- **`TweenMax`, `TimelineMax`, `Power2.easeOut` and `{ css: {...} }` are GSAP 2.** The GSAP 3 spellings are `gsap.to()`, string eases (`"power2.out"`), and properties flat in the vars object.
- **Blanket `will-change` costs more than it saves.** GSAP applies `force3D` itself; a permanent `will-change` on many elements holds compositor layers alive. Restrict it to the handful of elements mid-animation.
- **SplitText was rewritten in `3.13`** — half the size, plus `autoSplit`, `onSplit`, masking and automatic `aria` handling. `position: "absolute"` and `lineThreshold` were removed, and class-name numbering is now per element rather than global.

## Related skills

- **svelte-sveltekit** — `{@attach}` itself, runes, and the `Spring`/`Tween`/`transition:` primitives GSAP should not fight with
- **tailwind-css** — the `transition-*`, `--animate-*` and `motion-reduce:` side of the CSS-first decision
- **typescript** — typing attachment factories and plugin modules
