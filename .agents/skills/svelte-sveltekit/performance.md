---
title: "Performance"
summary: "Diagnose first, then fix: bundle size and code splitting, preloading, images and fonts, CSS delivery and FOUC, load-function latency, runtime reactivity costs, and real-user monitoring."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8"
mcp_sections: ["kit/performance", "kit/images", "kit/link-options", "kit/observability", "svelte/scoped-styles"]
---

# Performance

**Measure before changing anything.** SvelteKit apps are fast by default; almost every real regression is a slow `load`, an oversized dependency, or an unoptimized image — not the framework.

```sh
npm run build && npm run preview   # always profile the production build
npx vite-bundle-visualizer         # what's actually in the bundle
```

Chrome DevTools' Performance and Network panels, plus Lighthouse against `preview`, will find more than any amount of speculative tuning. For server-side latency, turn on [tracing](experimental.md) and read the spans — it attributes time to `handle`, each `load`, and each remote function.

## Server latency

The biggest lever is usually the `load` function.

```js
// ❌ waterfall — three sequential round trips
const user = await getUser();
const posts = await getPosts(user.id);
const comments = await getComments(posts[0].id);

// ✅ overlap whatever is independent
const [user, settings] = await Promise.all([getUser(), getSettings()]);
```

- **Stream what isn't needed for first paint.** Return the promise instead of awaiting it — see [loading.md](loading.md).
- **Start your own work before `await parent()`.**
- **Use the event's `fetch`.** Same-origin calls skip the HTTP round trip entirely on the server.
- **Batch with [`query.batch`](remote-functions.md)** when a list renders one query per row — that's the n+1 problem, and it's the single most common cause of a slow page with fast individual queries.
- **Cache what's cacheable** with `setHeaders`, and never mark user-specific responses `public`.

## Bundle size

```js
// ❌ pulls the whole library
import _ from 'lodash';

// ✅ tree-shakeable
import debounce from 'lodash-es/debounce';
```

Prefer packages that ship ESM and `sideEffects: false`. Check a dependency's real cost before adding it — date and icon libraries are the usual offenders. For icons, import individual SVGs rather than a component library that bundles thousands.

Split off anything heavy and non-critical:

```svelte
<script>
	let Chart = $state(null);

	async function showChart() {
		Chart = (await import('$lib/components/Chart.svelte')).default;
	}
</script>

{#if Chart}<Chart {data} />{/if}
```

Route-level code splitting is automatic. Keep it that way — importing a heavy component in a layout drags it onto every page under that layout.

Client-only libraries (anything touching `window` or `document` at import time) belong in a dynamic import inside `$effect`, or in a component with `export const ssr = false`. On Cloudflare this doubles as the fix for worker size limits.

```js
kit: {
	output: { bundleStrategy: 'split' }   // 'single' or 'inline' for small apps
}
```

## Preloading

Usually the cheapest real-world win:

```svelte
<body data-sveltekit-preload-data="hover">
```

`preload-data` fetches code *and* load data on hover or touchstart, so the navigation often feels instant. `preload-code` fetches only JS. Set `"tap"` instead of `"hover"` on data-heavy or expensive routes to avoid firing on every pointer sweep.

Programmatically:

```js
import { preloadData, preloadCode } from '$app/navigation';
```

With `forkPreloads` enabled, SvelteKit uses Svelte's `fork` API to run the *async work* speculatively too — see [experimental.md](experimental.md).

## Images

```svelte
<img
	src={small}
	srcset="{small} 400w, {medium} 800w, {large} 1200w"
	sizes="(max-width: 600px) 400px, 800px"
	alt="…"
	width="800"
	height="600"
	loading="lazy"
	decoding="async"
/>
```

- **Always set `width` and `height`** (or an aspect-ratio box). This is the main cause of layout shift.
- `loading="lazy"` for below-the-fold images; **never** for the LCP image, which should be `fetchpriority="high"` and preloaded.
- Serve AVIF/WebP with fallbacks.
- `@sveltejs/enhanced-img` does the srcset/format work at build time for local images; a CDN handles remote ones.

## Fonts

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
```

```css
@font-face {
	font-family: 'Inter';
	src: url('/fonts/inter-var.woff2') format('woff2-variations');
	font-display: swap;
	font-weight: 100 900;
}
```

Self-host, subset to the characters you use, prefer one variable font over several static weights, and always set `font-display`. `crossorigin` on the preload is mandatory — without it the font downloads twice.

## CSS delivery and FOUC

**Import global CSS exactly once, in the root `+layout.svelte`.**

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
```

SvelteKit hoists that into `<head>` as a render-blocking stylesheet, so the first paint is already styled. Importing the same file from a `+page.svelte` instead defers it: the page can paint before its stylesheet lands, which is the flash of unstyled content — and the file gets requested again per route that imports it.

Component `<style>` blocks need no such care; the compiler scopes them and the build extracts them per route.

Two further levers:

- `inlineStyleThreshold` inlines stylesheets under a byte limit directly into the HTML, removing a render-blocking request ([config.md](config.md)).
- Genuinely critical above-the-fold CSS can go in a `<style>` block in `app.html`, **above** `%sveltekit.head%`.

Don't try to hide the page until hydration finishes (`{#if hydrated}` gates and similar). That converts a styled server render into a blank screen and forfeits the main benefit of SSR.

## Runtime

Svelte 5's reactivity is fine-grained, so most components need nothing. When a component is genuinely slow:

- **`$state.raw`** for large objects and arrays you only ever replace — skips proxy overhead. API responses are the classic case.
- **Key every `{#each}`** with a stable id, never the index.
- **`$derived`, not `$effect`,** for computation. Effects re-run more and later.
- **Avoid work in effects that touch layout** — reading `offsetHeight` then writing forces synchronous reflow.
- `$inspect.trace(label)` finds what's re-running and why.
- With async Svelte, watch for the `await_waterfall` warning — it means two independent awaits serialized.

## Rendering strategy

The fastest page is one you didn't render at request time.

- `export const prerender = true` for anything that isn't per-user.
- `export const csr = false` for genuinely static content — ships zero JS.
- ISR (`adapter-vercel`) for content that changes on a schedule.
- `router.resolution: 'server'` when a large route manifest is delaying first load.
- `inlineStyleThreshold` to inline small CSS and cut a render-blocking request.

## Real-user monitoring

Lighthouse measures one synthetic load on your machine. Core Web Vitals are ranked on *field* data, so the numbers that matter come from real devices on real networks.

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	let { children } = $props();

	// effects are client-only, so this never runs during SSR
	$effect(() => {
		import('web-vitals').then(({ onCLS, onINP, onLCP }) => {
			const send = (metric) =>
				navigator.sendBeacon('/api/vitals', JSON.stringify(metric));

			onCLS(send);
			onINP(send);
			onLCP(send);
		});
	});
</script>

{@render children()}
```

`sendBeacon` survives page unload, which `fetch` does not — vitals are frequently reported as the user leaves. INP replaced FID as the responsiveness metric; if a monitoring guide mentions `onFID`, it predates that change.

Without adding a dependency, `PerformanceObserver` gives you the same LCP and layout-shift entries directly, and `performance.getEntriesByType('navigation')` covers TTFB. For server-side latency, [tracing](experimental.md) attributes time per `handle`, `load` and remote function — a better tool than any client metric for a slow TTFB.

## Checklist

- Production build profiled, not dev.
- No `load` waterfalls; independent work runs via `Promise.all`.
- Slow, non-critical data streamed.
- LCP image preloaded, sized, not lazy.
- Fonts self-hosted, preloaded, `font-display: swap`.
- `data-sveltekit-preload-data` set.
- Heavy/client-only libraries dynamically imported.
- Prerender everything that can be prerendered.
- Core Web Vitals measured on real devices, not just Lighthouse.
