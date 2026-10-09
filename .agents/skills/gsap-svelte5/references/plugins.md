# Plugins

Every plugin ships in the public `gsap` package and is free for commercial use — since `3.13` there is no Club tier, no private registry, no `gsap-trial`. Import from `gsap/<Name>` and register once in `src/lib/gsap.ts`.

## The roster

| Plugin | Import | For |
|---|---|---|
| **ScrollTrigger** | `gsap/ScrollTrigger` | scroll-driven animation, pinning, scrubbing — [scrolltrigger.md](scrolltrigger.md) |
| **ScrollSmoother** | `gsap/ScrollSmoother` | smooth scrolling and `data-speed` parallax; requires ScrollTrigger |
| **ScrollToPlugin** | `gsap/ScrollToPlugin` | tween the scroll position itself (`scrollTo: '#section'`) |
| **Observer** | `gsap/Observer` | one normalised API over wheel, touch, pointer and scroll |
| **Flip** | `gsap/Flip` | animate between two layout states |
| **Draggable** | `gsap/Draggable` | drag, throw, snap, bounds |
| **InertiaPlugin** | `gsap/InertiaPlugin` | momentum after a fling; pairs with Draggable |
| **SplitText** | `gsap/SplitText` | split text into lines, words, characters |
| **TextPlugin** | `gsap/TextPlugin` | typewriter-style text replacement |
| **ScrambleTextPlugin** | `gsap/ScrambleTextPlugin` | scrambled character reveal |
| **MotionPathPlugin** | `gsap/MotionPathPlugin` | animate along an SVG or point path |
| **MotionPathHelper** | `gsap/MotionPathHelper` | dev-only visual path editor |
| **MorphSVGPlugin** | `gsap/MorphSVGPlugin` | morph one SVG path into another |
| **DrawSVGPlugin** | `gsap/DrawSVGPlugin` | animate stroke drawing |
| **CustomEase** | `gsap/CustomEase` | arbitrary easing curves from bezier or SVG path data |
| **CustomBounce** / **CustomWiggle** | `gsap/CustomBounce`, `gsap/CustomWiggle` | generated bounce and wiggle eases |
| **Physics2DPlugin** / **PhysicsPropsPlugin** | `gsap/Physics2DPlugin`, `gsap/PhysicsPropsPlugin` | velocity, acceleration, gravity, friction |
| **EasePack** | `gsap/EasePack` | `rough`, `slow`, `expoScale`, `steps` |
| **PixiPlugin** / **EaselPlugin** | `gsap/PixiPlugin`, `gsap/EaselPlugin` | canvas library bridges |
| **CSSRulePlugin** | `gsap/CSSRulePlugin` | animate pseudo-elements; a legacy escape hatch |
| **GSDevTools** | `gsap/GSDevTools` | scrubber UI for building timelines; dev only |

`gsap/all` re-exports everything and defeats tree-shaking — import the named entry points instead. `CSSPlugin` is the twenty-fifth entry point and is already inside the core; importing or registering it is a no-op.

## Lazy loading a route-local plugin

MorphSVG, SplitText, ScrollSmoother and GSDevTools are large and often used on one route. Load them inside the attachment that needs them:

```typescript
const morph: Attachment<SVGPathElement> = (path) => {
	let tween: gsap.core.Tween | undefined;

	void (async () => {
		const { MorphSVGPlugin } = await import('gsap/MorphSVGPlugin');
		gsap.registerPlugin(MorphSVGPlugin);
		tween = gsap.to(path, { morphSVG: '#target', duration: 1 });
	})();

	return () => tween?.revert();
};
```

Registering twice is harmless, so a plugin lazily loaded on several routes needs no coordination. This is a **bundle-size** decision, not an SSR one — [lifecycle.md](lifecycle.md) has the SSR facts.

## SplitText

Rewritten in `3.13`: half the size, and the old advice about it is mostly obsolete.

```typescript
const headline: Attachment<HTMLElement> = (node) => {
	const split = SplitText.create(node, {
		type: 'lines,words',
		mask: 'lines',
		autoSplit: true,
		onSplit: (self) => gsap.from(self.lines, { yPercent: 100, stagger: 0.08, ease: 'power3.out' })
	});
	return () => split.revert();
};
```

- **`autoSplit: true`** re-splits on font load and container resize. Without it, a line-split headline measured before the webfont lands breaks at the wrong words — and since `3.15` removed the `"SplitText called before fonts loaded"` console warning, that now fails silently.
- **`onSplit`** is where the animation goes, because it re-runs after every re-split. A tween written outside it animates elements that no longer exist.
- **`mask: 'lines' | 'words' | 'chars'`** wraps each piece in an `overflow: clip` parent, which is what makes a slide-up reveal clip cleanly instead of overlapping the line above.
- **`aria` defaults to `'auto'`** — the original text goes on `aria-label`, the generated pieces get `aria-hidden`. Leave it alone.
- **`revert()` in the teardown** restores the original markup. Skipping it leaves a component's text permanently shredded into spans.
- Also available: `propIndex` (exposes `--char` / `--word` / `--line` custom properties), `smartWrap`, `deepSlice`, `specialChars`, `ignore`, `prepareText`, `onRevert`.
- **Removed in the rewrite:** `position: "absolute"` and `lineThreshold`. Class-name numbering is now per element rather than global.

## Flip

Records a layout state, lets you change the DOM however you like, then animates the difference. This is the tool for reorders, expand-to-detail transitions, and moving an element between containers — cases where the *layout* is what changed.

```typescript
const state = Flip.getState('.card');
// mutate: reorder the array, toggle a class, move the node
await tick();
Flip.from(state, { duration: 0.5, ease: 'power2.inOut', absolute: true, stagger: 0.05 });
```

In Svelte, `await tick()` between the mutation and `Flip.from()` is the load-bearing line — the DOM must have flushed before Flip measures the new state.

Do not pair it with Svelte's `animate:flip`; both write transforms to the same element.

## Observer

One handler for wheel, touch, pointer and scroll, with velocity and direction normalised across devices. Use it for gesture-driven section switching, pull-to-reveal, and anything that should respond to intent rather than to scroll position. It belongs in `$effect` rather than an attachment when it targets the window:

```typescript
$effect(() => {
	const observer = Observer.create({
		target: window,
		type: 'wheel,touch',
		tolerance: 10,
		preventDefault: true,
		onUp: () => next(),
		onDown: () => previous()
	});
	return () => observer.kill();
});
```

`preventDefault: true` takes over native scrolling — pair it with a reduced-motion and keyboard escape route ([accessibility.md](accessibility.md)).

## Draggable

```typescript
const drag: Attachment<HTMLElement> = (node) => {
	const [instance] = Draggable.create(node, {
		type: 'x',
		bounds: node.parentElement,
		inertia: true,
		snap: (value) => Math.round(value / 200) * 200
	});
	return () => instance.kill();
};
```

`Draggable.create()` returns an **array**. `inertia: true` needs InertiaPlugin registered. Kill the instance in the teardown or its listeners outlive the element.

## MorphSVG

`3.14` added smoothing: `smooth: 80` redistributes the path to 80 evenly-spaced anchors, `smooth: 'auto'` picks a count from surface area, and `curveMode: true` prevents kinks mid-morph. Anchor spacing improved generally in `3.14`, so a morph that used to need manual point-matching may not any more.

Redistribution is what buys the smoothness, and it is also what costs fidelity to the original artwork. `smooth: { redraw: false }` adds anchors without re-measuring and re-spacing the whole path — the shape stays exactly as drawn, the interpolation is a little less smooth.

`MorphSVGPlugin.convertToPath('circle, rect')` turns primitive shapes into paths first — you cannot morph a `<rect>` directly.
