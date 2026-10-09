# Lifecycle: mounting, scope and teardown

Everything here is about one question — **who owns this element's inline style, and when does GSAP give it back**.

## The registration module

Register every plugin once, in one module, and import `gsap` from there rather than from `gsap`. Nothing in this file touches the DOM, so it is safe to import from a component, a `+layout.svelte`, or a `.svelte.ts` module.

```typescript
// src/lib/gsap.ts
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(ScrollTrigger, Flip);

gsap.defaults({ duration: 0.6, ease: 'power2.out' });

export { gsap, ScrollTrigger, Flip };
```

`gsap.defaults()` here is what stops every tween in the codebase re-stating its own duration and ease. Per-tween values still override it.

Registering the same plugin twice is harmless but pointless, and registering inside a component body repeats it on every instance. See [plugins.md](plugins.md) for lazy-loading a plugin used on one route.

## The canonical mount — `{@attach}`

An attachment runs in an effect when the element mounts, receives that element, and may return a teardown. It never runs on the server.

```svelte
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { gsap } from '$lib/gsap';

	const reveal: Attachment<HTMLElement> = (root) => {
		const ctx = gsap.context(() => {
			gsap
				.timeline()
				.from('.heading', { autoAlpha: 0, y: 24 })
				.from('.card', { autoAlpha: 0, y: 24, stagger: 0.08 }, '-=0.3');
		}, root);

		return () => ctx.revert();
	};
</script>

<section {@attach reveal}>
	<h2 class="heading">Title</h2>
	<article class="card">one</article>
	<article class="card">two</article>
</section>
```

Three things come free versus `bind:this` + `$effect`: the node is guaranteed non-null, there is no client-only guard to write, and the teardown is bound to that element rather than to the component.

**Parameterise with a factory** — a function returning the attachment:

```svelte
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { gsap } from '$lib/gsap';

	function slideIn(distance: number): Attachment<HTMLElement> {
		return (node) => {
			const tween = gsap.from(node, { autoAlpha: 0, x: distance });
			return () => tween.revert();
		};
	}
</script>

<aside {@attach slideIn(-40)}>…</aside>
```

Because the factory call is evaluated inside the effect, changing `distance` tears the animation down and rebuilds it. That is usually what you want for a cheap tween — and exactly what you don't want when the setup is expensive (a SplitText re-split, a ScrollTrigger, a Draggable).

**To keep the setup and re-run only the update, take a getter and read it in a child `$effect`:**

```typescript
function slideIn(getDistance: () => number): Attachment<HTMLElement> {
	return (node) => {
		const xTo = gsap.quickTo(node, 'x', { duration: 0.4 });

		$effect(() => xTo(getDistance()));

		return () => gsap.killTweensOf(node);
	};
}
```

`{@attach slideIn(() => distance)}` reads `distance` inside the nested effect rather than during the factory call, so the outer attachment never re-runs. This is the same build-once-drive-the-playhead shape as the section below, and Svelte documents it as the general escape hatch for reactive attachments.

## State-driven animation

Build the timeline **once** when the element mounts, then drive its playhead from a nested `$effect`. The nested effect re-runs on state change; the surrounding setup does not.

```svelte
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { gsap } from '$lib/gsap';

	let { open = false }: { open?: boolean } = $props();

	const drawer: Attachment<HTMLElement> = (root) => {
		const tl = gsap
			.timeline({ paused: true })
			.fromTo(
				root,
				{ height: 0, autoAlpha: 0 },
				{ height: 'auto', autoAlpha: 1, duration: 0.4, ease: 'power2.out' }
			);

		$effect(() => {
			if (open) tl.play();
			else tl.reverse();
		});

		return () => tl.revert();
	};
</script>

<div {@attach drawer}>panel</div>
```

Reversing an existing timeline is the correct shape for anything toggleable: it is interruptible mid-flight, it cannot drift, and `3.15`'s `easeReverse` tunes how the backwards half feels. Creating a fresh tween on every state change instead is the mistake this pattern exists to prevent.

For a value that changes continuously rather than toggling — a pointer position, a scroll ratio — use `gsap.quickTo()` inside the attachment and call the setter from the effect or the event handler. See [core.md](core.md).

## The `$effect` fallback

Use `$effect` when the animation has no single owning element: a window-level `Observer`, a `ScrollTrigger` whose scroller is the document, or a sequence spanning several roots.

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import { gsap } from '$lib/gsap';

	let { items }: { items: string[] } = $props();
	let root = $state<HTMLElement>();

	$effect(() => {
		if (!root) return;
		const ctx = untrack(() =>
			gsap.context(() => {
				gsap.from('.item', { autoAlpha: 0, y: 20, stagger: 0.1 });
			}, root)
		);
		return () => ctx.revert();
	});
</script>

<ul bind:this={root}>
	{#each items as item (item)}
		<li class="item">{item}</li>
	{/each}
</ul>
```

**The trap:** `$effect` tracks every `$state` read during its run, *including reads inside functions it calls synchronously* — and the `gsap.context()` callback runs synchronously. So a tween that reads `items.length` re-creates itself on every list change. `untrack()` marks the setup as one-time; omit it only when re-running is the intent.

`$effect` runs after Svelte has flushed the DOM for that update, so the elements it queries already exist. `await tick()` is only needed in the other direction — inside an **event handler** that changes state and then wants to measure or animate the resulting nodes before returning.

## Scope and teardown

| Call | Scopes selectors | Reverts on | Teardown |
|---|---|---|---|
| `gsap.context(fn, root)` | yes, to `root` | manual | `ctx.revert()` |
| `gsap.matchMedia().add(q, fn, root)` | yes, to `root` | query stops matching | `mm.revert()` |
| bare `gsap.to(node, …)` | n/a — element target | manual | `tween.revert()` |

- **Scoping applies to selector *strings* only.** `gsap.to('.card', …)` inside a scoped callback is limited to the subtree; `gsap.to(someNode, …)` is unaffected, because an element reference was never ambiguous. Passing a scope and still animating the wrong nodes means the targets are references, not selectors.
- **ScrollTriggers created inside a context are collected by it** and killed on `revert()`. You do not need to track them separately.
- **`revert()` restores inline styles, not DOM structure.** Anything a plugin *built* — SplitText's generated spans, Flip's temporary absolute positioning — is undone by that plugin's own `revert()`, which is why a split element needs `split.revert()` and not just the context's.

## SSR

Verified by importing all 25 plugin entry points plus the core under Node with `window` and `document` undefined: every one loads cleanly, and `gsap.registerPlugin()` only stores class references. The plugins that auto-register on import (`ScrollTrigger`, `Flip`, …) check for a global `gsap` first and no-op when there isn't one.

So none of these are needed: `if (browser)`, `typeof window !== 'undefined'`, `await import('gsap/ScrollTrigger')`, deferring `registerPlugin()` into `onMount`, or `export const ssr = false`.

What *is* client-only is the animation itself — which is precisely what `{@attach}` and `$effect` already guarantee.

## SvelteKit navigation

Client-side navigation swaps the DOM without a page load. Component attachments tear their own animations down, but page-level measurements go stale:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { ScrollTrigger } from '$lib/gsap';

	let { children } = $props();

	afterNavigate(() => ScrollTrigger.refresh());
</script>

{@render children()}
```

`ScrollTrigger.refresh()` recalculates every trigger's start and end against the new layout. Without it, triggers on the incoming page keep the outgoing page's measurements and fire at the wrong scroll positions — the single most reported GSAP + SvelteKit bug. Navigation is not one of the events ScrollTrigger refreshes on by itself — [scrolltrigger.md](scrolltrigger.md) lists the four that are.

## DOM churn and keyed lists

- **Put the attachment on the list item, not the list.** `{#each items as item (item.id)}` with `{@attach …}` on the item gives each row its own mount and teardown, so a removed row's tween dies with it.
- **Fonts and late-arriving content shift layout after mount.** Await `document.fonts.ready` before `ScrollTrigger.refresh()`, or triggers measure against the pre-layout height.
- **Prefer Flip for reorders**, covered in [plugins.md](plugins.md).
