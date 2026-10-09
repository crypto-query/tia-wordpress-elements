# Auditing a SvelteKit app

Measured against SvelteKit 2.63 / Svelte 5.56 / Vite 8, served by `@sveltejs/adapter-node`.

## Audit a production build

The dev server's report describes Vite, not your app. Same page, same moment, default harness:

| | prod (`adapter-node`) | dev (`vite dev`) |
|---|---|---|
| total bytes | 771 KiB | **3449 KiB** |
| requests | 11 | **69** |
| `unminified-javascript` | pass | **fail** |
| perf score across 4 runs | 42 / 60 / 42 / 60 | **61 / 26 / 28 / 61** |

The byte and request counts are the real difference — unbundled ES modules, one request per source file. The *score* is worthless on either server (see the harness rules in [SKILL.md](../SKILL.md)), but it is worthless on dev twice over: its LCP swung 1211 ms → 11103 ms across those four runs.

```bash
bun run build
PORT=3000 node build/index.js      # adapter-node; other adapters differ
bunx lighthouse http://127.0.0.1:3000/ --output=json --output-path=stdout --quiet
```

`adapter-auto` cannot produce a runnable server locally; install a concrete adapter for the audit. Either `localhost` or `127.0.0.1` works — both were audited clean.

**In a current scaffold the adapter lives in `vite.config.ts`**, passed to the plugin as `sveltekit({ adapter })`, and no `svelte.config.js` is generated at all. When both exist, the `vite.config.ts` one wins — a `svelte.config.js` naming a different adapter was silently ignored (the build reported the vite.config one).

## What a local server fakes

Three findings are properties of your dev machine, not your app. Confirm them against the deployed origin before spending a day on them:

- **`document-latency-insight`** is a three-item checklist: no redirects ✓, fast server ✓ (observed 19 ms), **"No compression applied" ✗**. `adapter-node` serves HTML uncompressed, so this insight fails locally on every SvelteKit app; a CDN or reverse proxy normally supplies gzip/brotli.
- **`cache-insight`** flagged 693 KiB. `_app/immutable/*` is served `public,max-age=31536000,immutable`, but files from `static/` get **no `Cache-Control` header at all** — only a weak ETag. That is real, and the fix is architectural: import assets so the build hashes them instead of parking them in `static/`.
- **`network-dependency-tree-insight`** scored 0 on a two-hop localhost chain where the real numbers are single-digit milliseconds.

`modern-http-insight` and `render-blocking-insight` both **passed** over plain HTTP/1.1 localhost, so those two are trustworthy locally: SvelteKit's `modulepreload` + deferred module scripts genuinely do not block rendering.

## Hydration is where TBT comes from

A page with a 1200-row list and one 350 ms blocking `$effect` measured TBT 586 ms and `bootup-time` 1443 ms — with `total-byte-weight` passing. Nothing about the payload was wrong; the main thread was busy.

Turning SSR off does not help. Measured as a pair — the same component on an SSR route and on one with `export const ssr = false` — the scores were **identical (60 and 60)** and TBT was slightly worse without SSR (620 ms vs 590 ms): the client does the same work either way, and now it also has nothing to paint until the JS lands. Reach for `ssr = false` for correctness reasons, never as a performance fix.

What does move TBT: less work per hydrated component, fewer hydrated nodes (large static regions cost nothing to render but everything to hydrate), and moving synchronous work out of `$effect` into a load function or a `requestIdleCallback`-shaped deferral. Confirm with `bootup-time`, `mainthread-work-breakdown` and `long-tasks`, all of which stay stable across runs.

## Images: `enhanced:img` earns it

Same 694 KiB hero, above the fold, `fetchpriority="high"`, two routes:

| markup | bytes | `image-delivery-insight` | perf, 3 runs (simulate) | LCP |
|---|---|---|---|---|
| `<img src="/hero.jpg" width height>` | 724 KiB | **0** (68 KiB savings) | 83 / 83 / 83 | ~4807 ms |
| `<enhanced:img src="$lib/hero.jpg">` | **173 KiB** | **1** | 100 / 100 / 100 | ~1653 ms |

`enhancedImages()` goes in the `plugins` array in `vite.config.ts` (verified sitting before `sveltekit()`); the source file must be importable (`$lib/…`, not `static/`). It emits a `<picture>` with AVIF, WebP and JPEG sources at 1× and 2×, and writes intrinsic `width`/`height` onto the `<img>` — which is also what keeps `unsized-images` and CLS clean.

Unusually for a score delta, this one is trustworthy: both routes were deterministic across three runs, so the 17 points and the 3.1 s of LCP are real differences and not Lantern flipping a coin. Under `--throttling-method=devtools` both score 100 (LCP 620 ms vs 616 ms) — real throttling ends the run before the big image matters, which is a limitation of that harness, not evidence the images are equivalent. The 4.2× byte reduction holds under every harness and is the claim to lead with.

## Head, landmarks, and the 4-point favicon

A scaffolded app scores accessibility 91, SEO 82, agentic-browsing 50. One layout fixes all three:

```svelte
<svelte:head>
  <title>Page title</title>
  <meta name="description" content="…" />
</svelte:head>
<main>{@render children()}</main>
```

Measured after: 100 / 100 / 100. `document-title`, `meta-description`, `landmark-one-main` and `agent-accessibility-tree` all pass, and a `static/llms.txt` (Markdown, at least one H1) turns `llms-txt` from `notApplicable` into a pass.

Then declare an icon in `app.html`:

```html
<link rel="icon" href="%sveltekit.assets%/favicon.svg" />
```

Without it Chrome requests `/favicon.ico`, SvelteKit answers 404, and `errors-in-console` — a weighted Best Practices audit — fails, costing 4 points deterministically (3/3 runs). Declaring the icon restored 100 (2/2 runs). It is the cheapest four points in the report.

## Client-side navigation is invisible to a normal audit

A navigation audit measures one cold load. Everything SvelteKit is fast at — client-side routing, preloaded data, `goto` — happens after the run ends, and `data-sveltekit-preload-data="hover"` (on `<body>` in the default template) never fires because nothing hovers.

To measure a route change or an interaction, use a **timespan** step in a flow (see [running.md](running.md)): navigate first, then `startTimespan`, click the link, `endTimespan`. You get TBT, CLS and `inp-breakdown-insight` for that window; you do not get LCP or FCP, because there was no navigation.
