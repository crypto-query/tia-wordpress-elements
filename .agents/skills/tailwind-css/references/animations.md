---
title: "Animations and transitions"
summary: "transition-* utilities, custom keyframes via --animate-* in @theme, entry animation with starting: and transition-discrete, reduced motion, and where Svelte transitions fit instead."
verified_against: "tailwindcss 4.3.3, Svelte 5"
docs: ["/docs/transition-property", "/docs/animation", "/docs/theme"]
---

# Animations and transitions

## Transitions

```svelte
<button class="bg-primary hover:bg-primary/90 transition-colors duration-200 hover:scale-105">
```

Prefer a named property list over `transition-all`. `transition-all` animates every animatable property, which picks up layout properties you never intended and forces work on each frame; `transition-colors`, `transition-transform`, `transition-opacity`, and `transition-shadow` cover nearly everything. `transition` alone is a sensible default set (colours, opacity, shadow, transform, filter).

`duration-*`, `delay-*`, and `ease-*` take bare numbers and named easings; add your own curves in `@theme`:

```css
@theme {
    --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
    --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
}
```

Animate `transform` and `opacity` where you can — they're compositor-friendly. Animating `width`, `height`, `top`, or `margin` triggers layout on every frame.

## Built-in animations

`animate-spin`, `animate-ping`, `animate-pulse`, `animate-bounce`, and `animate-none` to cancel one.

## Custom animations

Register through the `--animate-*` namespace, with the `@keyframes` declared **inside** the `@theme` block so the animation and its frames travel together:

```css
@theme {
    --animate-slide-up: slide-up 0.3s ease-out;
    --animate-fade-in: fade-in 0.2s ease-out;

    @keyframes slide-up {
        from {
            opacity: 0;
            transform: translateY(1rem);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
}
```

That gives you `animate-slide-up` and `animate-fade-in`, composable with variants like any other utility. The v3 route — `theme.extend.keyframes` and `theme.extend.animation` in `tailwind.config.js` — no longer exists.

`tailwindcss-animate`, loaded via `@plugin`, supplies `animate-in` / `animate-out` with `fade-in-0`, `zoom-in-95`, `slide-in-from-top-2` and friends. It's what shadcn-svelte components expect, so where it's present, check for an existing utility there before adding a keyframe.

## Animating elements as they appear

`starting:` maps to `@starting-style`, giving CSS-only entry animation with no JS and no mount hook:

```svelte
<div class="opacity-100 transition-opacity duration-300 starting:opacity-0">
```

For elements that also toggle a discrete property — `display`, or an element in the top layer like a `<dialog>` or popover — the transition needs `transition-discrete` to animate across that switch:

```svelte
<div class="transition-discrete transition-all duration-300 starting:open:opacity-0 open:opacity-100">
```

## Reduced motion

`prefers-reduced-motion` is an accessibility setting, not a preference to sample. Respect it:

```svelte
<div class="motion-safe:animate-slide-up">
<div class="transition-transform motion-reduce:transition-none">
```

`motion-safe:` opts the animation in (nothing happens for users who asked for less); `motion-reduce:` opts a specific behaviour out. Prefer `motion-safe:` for decorative movement — it fails to *stillness*, which is the safe direction. Keep opacity fades; it's movement, parallax, and large-scale transforms that cause trouble.

## When to use Svelte instead

Tailwind animates an element that is in the DOM. Svelte's transitions run when an element enters or leaves it — and only those can animate an exit, because a removed node has nothing left to style:

```svelte
<script>
    import { fade, fly } from "svelte/transition";
    let visible = $state(true);
</script>

{#if visible}
    <div transition:fly={{ y: 20, duration: 200 }} class="bg-surface rounded p-4">…</div>
{/if}
```

The split:

- **Tailwind** — hover, focus, and other state changes on elements that stay put; entry animation via `starting:`; looping indicators.
- **Svelte `transition:` / `animate:`** — enter *and* exit around `{#if}` / `{#each}`, list reordering with `animate:flip`, crossfades.
- **GSAP** — timelines, scroll-driven sequences, physics. See the `gsap-svelte5` skill.

Svelte's `svelte/motion` respects reduced motion through `prefersReducedMotion` from `svelte/reactivity`; details are in the `svelte-sveltekit` skill's `motion.md`. Don't stack a Svelte transition and a Tailwind `animate-*` on the same element — they both write `transform` and the result depends on which lands last.
