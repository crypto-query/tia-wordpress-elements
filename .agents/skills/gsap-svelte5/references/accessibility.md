# Reduced motion and responsive branching

`prefers-reduced-motion` is a hard requirement, not a polish item — vestibular disorders make large-travel and parallax motion genuinely painful. Both tools below are correct; pick by whether the animation also branches on viewport.

## `gsap.matchMedia()` — the GSAP-native route

`matchMedia` runs a handler while a query matches and **automatically reverts everything created inside it** when the query stops matching. It is a specialised `gsap.context()`, so it scopes selectors too.

Use the **conditions object**, not two separate `add()` calls. One handler, one set of tuned values:

```svelte
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { gsap } from '$lib/gsap';

	const reveal: Attachment<HTMLElement> = (root) => {
		const mm = gsap.matchMedia();

		mm.add(
			{
				motionOk: '(prefers-reduced-motion: no-preference)',
				reduceMotion: '(prefers-reduced-motion: reduce)'
			},
			(ctx) => {
				const reduce = ctx.conditions?.reduceMotion ?? false;
				gsap.from('.card', {
					autoAlpha: 0,
					y: reduce ? 0 : 24,
					duration: reduce ? 0.15 : 0.6,
					stagger: reduce ? 0 : 0.08,
					ease: 'power2.out'
				});
			},
			root
		);

		return () => mm.revert();
	};
</script>

<section {@attach reveal}>
	<article class="card">one</article>
</section>
```

Listing **both** queries matters: a handler registered under `motionOk` alone never runs for a reduced-motion user, so the element is left in whatever state the markup gave it — which for a card styled to fade in is invisible.

The third argument is the scope. `gsap.matchMediaRefresh()` re-runs every matching handler immediately, for when the app exposes its own motion toggle.

## `prefersReducedMotion` — the Svelte-native route

Svelte exports a reactive `MediaQuery` from `svelte/motion` (since 5.7). Read `.current` inside the attachment and the attachment rebuilds when the preference changes:

```svelte
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from 'svelte/motion';
	import { gsap } from '$lib/gsap';

	const fadeIn: Attachment<HTMLElement> = (node) => {
		const reduce = prefersReducedMotion.current;
		const tween = gsap.from(node, {
			autoAlpha: 0,
			y: reduce ? 0 : 24,
			duration: reduce ? 0.15 : 0.6
		});
		return () => tween.revert();
	};
</script>

<div {@attach fadeIn}>…</div>
```

Shorter, and it reuses the same primitive as Svelte transitions elsewhere in the codebase. Choose `matchMedia` instead when the animation also branches on breakpoint, or when a `ScrollTrigger` needs auto-reverting as the query flips.

## What "reduce" should mean

Reduced motion is not "no feedback". Strip the **travel**, keep the **signal**:

| Full motion | Reduced |
|---|---|
| `y: 40` slide-up | `y: 0`, cross-fade only |
| `scale` / `rotation` entrance | opacity only |
| parallax, `data-speed` | static position |
| `scrub`-driven timeline | jump to end state, or `once: true` at a sensible trigger point |
| infinite marquee, looping ambient motion | paused, or a static frame |
| stagger `0.08` across 12 cards | `stagger: 0`, one short fade |

Durations should shorten, not go to zero: an instantaneous change gives no cue that anything happened. 0.1–0.2s reads as "immediate" while still being perceptible.

## Responsive branching

The same conditions object handles breakpoints — one handler, no duplicated setup, and everything auto-reverts as the viewport crosses a boundary:

```javascript
const mm = gsap.matchMedia();

mm.add(
  {
    isDesktop: '(min-width: 64rem)',
    isMobile: '(max-width: 63.999rem)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  },
  (ctx) => {
    const { isDesktop, reduceMotion } = ctx.conditions!;
    if (reduceMotion) return;

    gsap.timeline({
      scrollTrigger: { trigger: '.panel', pin: isDesktop, scrub: 1 }
    }).to('.panel .art', { xPercent: isDesktop ? -50 : -20 });
  },
  root
);
```

Pinning on narrow viewports is the usual thing to switch off — it costs a layer, fights mobile address-bar resize, and there is rarely room for it.

## Beyond motion preference

- **Don't animate focus away.** A pinned or `autoAlpha: 0` section still contains focusable children unless removed; `autoAlpha` handles the `visibility` half, tab order it does not.
- **Split text with SplitText rather than by hand.** It manages the `aria` bookkeeping itself ([plugins.md](plugins.md)), so a screen reader still reads the sentence; a hand-rolled splitter has it read out character by character.
- **Scroll-jacking has a cost.** `ScrollSmoother` and `normalizeScroll` take scrolling off the browser's thread, which changes keyboard scrolling, `scroll-behavior` and assistive-technology behaviour. Disable it under reduced motion.
- **Nothing essential behind a scroll animation.** If content only appears via `ScrollTrigger`, it is missing for anyone whose JS failed — start from a readable static state and enhance from there.
