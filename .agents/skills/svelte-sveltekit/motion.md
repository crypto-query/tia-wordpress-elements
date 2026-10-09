---
title: "Motion, transitions and animations"
summary: "Spring and Tween classes, the transition/in/out directives and built-ins, animate:flip for reordering, easing functions, and honouring prefers-reduced-motion."
verified_against: "svelte 5.56.8"
mcp_sections: ["svelte/svelte-motion", "svelte/svelte-transition", "svelte/svelte-animate", "svelte/svelte-easing", "svelte/transition", "svelte/in-and-out", "svelte/animate"]
---

# Motion, transitions and animations

Three separate systems, chosen by *what is changing*:

| What changes | Use | Import |
|---|---|---|
| A value, continuously (position, count, colour) | `Spring` / `Tween` | `svelte/motion` |
| An element enters or leaves the DOM | `transition:` / `in:` / `out:` | `svelte/transition` |
| Items in a keyed list are reordered | `animate:` | `svelte/animate` |
| The whole page, on navigation | View Transitions API | `$app/navigation` |

They compose — a `Tween` can drive a style on an element that also has a `transition:`.

## Spring and Tween

`Spring` and `Tween` are classes (since **5.8**). The old `spring()` and `tweened()` *stores* are deprecated — same module, but they return stores you read with `$`, and they're what most training data still shows.

Both wrap a value with two properties: **`target`** (where it's heading) and **`current`** (where it is now).

```svelte
<script>
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	const progress = new Tween(0, { duration: 400, easing: cubicOut });
</script>

<button onclick={() => (progress.target = 100)}>fill</button>

<div class="bar" style:width="{progress.current}%"></div>
```

Choose between them by what you're modelling:

- **`Tween`** — a known destination over a known duration. Options: `delay`, `duration` (a number, or `(from, to) => number`), `easing`, `interpolate`.
- **`Spring`** — physical motion with no fixed duration, so it stays smooth when the target changes mid-flight. Options: `stiffness`, `damping`, `precision`. Use it for anything the user drags or flings.

`set()` returns a promise that resolves when `current` catches up, and takes per-call options:

```js
await tween.set(100, { duration: 1000 });   // override the defaults once
spring.set(x, { instant: true });            // jump, no animation
spring.set(x, { preserveMomentum: 200 });    // keep the current trajectory 200ms — 'fling' gestures
```

To derive motion from state you don't own, use the static `.of()` form. **It must run in an effect root** — component initialisation counts, an event handler does not:

```svelte
<script>
	import { Spring } from 'svelte/motion';

	let { number } = $props();

	const spring = Spring.of(() => number);
</script>

<p>{spring.current}</p>
```

## Transitions

`transition:` is **bidirectional** — interrupt it halfway and it reverses smoothly from where it is. `in:` and `out:` are one-directional: an interrupted `out:` restarts from scratch rather than reversing, and an `in:` keeps playing alongside an `out:`.

```svelte
<script>
	import { fade, fly } from 'svelte/transition';

	let visible = $state(false);
</script>

<button onclick={() => (visible = !visible)}>toggle</button>

{#if visible}
	<div transition:fade={{ duration: 200 }}>fades both ways</div>
	<div in:fly={{ y: 200 }} out:fade>flies in, fades out</div>
{/if}
```

Built-ins from `svelte/transition`: `fade`, `fly`, `slide` (`axis: 'x' | 'y'`), `scale`, `blur`, `draw` (SVG paths — needs `getTotalLength`, so `<path>`/`<polyline>`), and `crossfade`.

**Transitions are local by default** — they play only when their own block is created or destroyed, not when a parent block is. Add `|global` when you want a parent's change to trigger them:

```svelte
{#if x}
	{#if y}
		<p transition:fade>plays only when y changes</p>
		<p transition:fade|global>plays when x or y change</p>
	{/if}
{/if}
```

When a block transitions out, *everything* inside it stays in the DOM until every transition in that block finishes.

Elements with transitions dispatch `onintrostart`, `onintroend`, `onoutrostart` and `onoutroend`.

### crossfade

`crossfade` returns a `[send, receive]` pair. An element `send`-ing looks for one `receive`-ing under the same `key` and animates between their positions; with no counterpart it uses `fallback`.

```svelte
<script>
	import { crossfade } from 'svelte/transition';

	const [send, receive] = crossfade({ duration: 300, fallback: (node) => ({ duration: 200 }) });
	let { todos } = $props();
</script>

{#each todos.filter((t) => !t.done) as todo (todo.id)}
	<li in:receive={{ key: todo.id }} out:send={{ key: todo.id }}>{todo.text}</li>
{/each}
```

### Custom transitions

A transition is a function returning `{ delay, duration, easing, css, tick }`. `t` runs 0→1 for `in`, 1→0 for `out`, where 1 is the element's natural state; `u` is `1 - t`.

```js
import { elasticOut } from 'svelte/easing';

function whoosh(node, params = {}) {
	const existing = getComputedStyle(node).transform.replace('none', '');

	return {
		duration: params.duration ?? 400,
		easing: params.easing ?? elasticOut,
		css: (t) => `transform: ${existing} scale(${t})`
	};
}
```

**Prefer `css` over `tick`.** `css` compiles to a web animation that runs off the main thread; `tick` runs per frame on it and janks on slow devices. Reach for `tick` only when the effect can't be expressed in CSS (typewriter text, canvas).

A third argument, `options`, carries `direction` (`'in' | 'out' | 'both'`). Returning a *function* instead of a config defers it to the next microtask, which is how crossfade coordinates pairs.

## animate:

Runs when a **keyed** each block is reordered. Not on add, not on remove — only when an existing item's index changes. The directive must sit on an *immediate* child of the each block.

```svelte
<script>
	import { flip } from 'svelte/animate';

	let items = $state([
		{ id: 1, text: 'first' },
		{ id: 2, text: 'second' }
	]);
</script>

{#each items as item (item.id)}
	<li animate:flip={{ duration: 300 }}>{item.text}</li>
{/each}
```

`flip` (First, Last, Invert, Play) measures each element before and after and translates between the two. `FlipParams` takes `delay`, `easing`, and a `duration` that may be `(len: number) => number` — `len` is the distance travelled in pixels, so `d => Math.sqrt(d) * 40` keeps far-moving items from feeling slow.

Custom animations receive `(node, { from, to }, params)` where `from`/`to` are `DOMRect`s, and return the same shape as a transition.

## View transitions

For motion *between pages*, SvelteKit has no dedicated API — you call the platform's `document.startViewTransition` from `onNavigate`, in the root layout, and it applies to every client-side navigation:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

{@render children()}
```

Returning a promise from `onNavigate` makes SvelteKit wait for it before completing the navigation; resolving it *inside* the callback is what lets the browser snapshot the old page first. The feature-detect keeps unsupported browsers navigating normally.

From there it's plain CSS — `view-transition-name` on an element pairs it across pages, and `::view-transition-old`/`::view-transition-new` style the default crossfade. Wrap the whole thing in `@media (prefers-reduced-motion: no-preference)`.

## Easing

`svelte/easing` exports `linear` plus `In`/`Out`/`InOut` variants of `back`, `bounce`, `circ`, `cubic`, `elastic`, `expo`, `quad`, `quart`, `quint`, `sine`. Any `(t: number) => number` works.

Rule of thumb: `Out` for things entering (fast then settle), `In` for things leaving, `InOut` for things moving between two on-screen positions.

## Reduced motion

`prefersReducedMotion` (since **5.7**) is a reactive `MediaQuery` — read `.current`:

```svelte
<script>
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	let visible = $state(false);
</script>

{#if visible}
	<p transition:fly={{ y: prefersReducedMotion.current ? 0 : 200 }}>
		flies in, unless the user prefers reduced motion
	</p>
{/if}
```

Neutralise the *movement*, not the transition itself — a fade with no travel still communicates the state change. For CSS-authored animation the media query does the same job.

## Gotchas

- **`spring`/`tweened` vs `Spring`/`Tween`.** Lowercase are deprecated stores read with `$spring`; the classes use `.current`. Don't mix the two spellings.
- **`.of()` outside an effect root throws.** Call it during component init, not in a handler.
- **Reading `.current` in an `$effect` that also sets `.target`** loops. Derive from `.target` instead.
- **Transitions don't run during SSR** — the element renders in its final state, then transitions on hydration only if the block is created client-side.
- **Transitions inject inline `<style>` elements**, so a strict CSP needs `style-src` to allow them ([config.md](config.md)).
- **`animate:` without a key is silently useless** — `{#each items as item}` has no identity to track, so nothing animates.
- **Layout thrash with `flip` on long lists** — every element is measured twice per reorder. Virtualize past a few hundred rows.
- For timeline-based or scroll-driven sequences, CSS or a dedicated library is the better tool — see the **gsap-svelte5** skill.
