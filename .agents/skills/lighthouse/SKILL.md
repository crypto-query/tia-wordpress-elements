---
name: lighthouse
description: Lighthouse 13 for Svelte and SvelteKit apps — running an audit, what the score is actually made of, the harness flags that move it by 50 points, insight audits, and CI gating. Use when auditing or profiling a page, reading a Lighthouse or PageSpeed report, acting on an LCP / CLS / TBT / INP finding, or gating performance in CI.
version: 1.0.0
scope: performance
distribution: author-only
---

# Lighthouse 13

Verified against **lighthouse 13.4.1** driving **Chrome 151**, run against a SvelteKit 2.63 / Svelte 5.56 production build. Lighthouse 13 requires **Node ≥ 22.19** and refuses to start below it. Every number in these files was measured on that rig; none is quoted from a docs page.

A Lighthouse run is **lab** data: one synthetic load, on your hardware, under a chosen **harness** (form factor + throttling method + emulation). Ranking uses **field** data — real Chrome users at the 75th percentile over 28 days. Both matter, they disagree routinely, and only field data is what Google acts on.

## Where to look

| File | Read it for |
|---|---|
| [running.md](references/running.md) | the CLI surface worth knowing, what each `--preset` really changes, the four harnesses, verified Node-API / Playwright / puppeteer recipes, timespan and flow runs, JSON output for agents |
| [scoring.md](references/scoring.md) | the five scored metrics and their weights, the exact p10/median curve per form factor, the 17 `*-insight` audits and what each replaced, all five categories, `notApplicable` semantics |
| [sveltekit.md](references/sveltekit.md) | audit a production build, hydration as the TBT source, `enhanced:img` measured, `<svelte:head>`, the favicon that costs 4 points, asset caching, client-side navigation |
| [ci.md](references/ci.md) | gating on medians, LHCI's pin to lighthouse 12.6.1, unlighthouse on 13.4, the removed budget feature, which assertions survive contact with noise |
| [troubleshooting.md](references/troubleshooting.md) | symptom-first: numbers that don't add up, CLS that appears and vanishes, INP reported n/a, an LCP element you didn't expect, failures only localhost produces |

## Working rules

**The score is a property of the harness, not of the page.** One build, one URL, five harnesses, measured back to back:

| harness | perf | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|
| default (`mobile` / `simulate` / cpu 4×) | **42** | 5122 ms | 585 ms | 0.877 | 1477 ms |
| `--throttling-method=devtools` | **93** | 635 ms | 325 ms | 0.000 | 2356 ms |
| `--throttling-method=provided` | **70** | 90 ms | 285 ms | 0.877 | 444 ms |
| `--preset=desktop` (`simulate` / cpu 1×) | **74** | 492 ms | 127 ms | 0.911 | 505 ms |
| `--preset=perf` | **93** | 624 ms | 327 ms | 0.000 | 2336 ms |

A 51-point spread with nothing changed but flags. Fix one harness, record it beside every number you report, and never compare a number against one taken under a different harness. Note the last row: `--preset=perf` is not a category filter — it also switches throttling to `devtools`, which is the whole reason it reads 93 where the default reads 42.

**Audit a production build.** A `vite dev` server ships unbundled modules — measured on one page, 3449 KiB over 69 requests against the built app's 771 KiB over 11 — so its diagnostics describe Vite, not your app, and its score is noise on top of noise (four runs: 61 / 26 / 28 / 61). Build, serve the build, then audit. [sveltekit.md](references/sveltekit.md) has the commands and the trap where a stale server makes a dead app look perfect.

**Only `devtools` numbers reconcile; `simulate` numbers are estimates that don't.** Under the default `simulate`, Chrome loads the page at full local speed and **Lantern** models what a slow connection would have done, so the trace-derived insight tables describe a different load than the metric does: LCP breakdown summed to 63 ms while the LCP metric read 4815 ms on that same run. Under `--throttling-method=devtools` the throttling is real and the two agree exactly (616 ms subpart sum, 616 ms metric). Diagnose under `devtools`; keep `simulate` for scores you intend to compare against PageSpeed Insights.

**Gate on TBT and CLS; treat a single simulated LCP as noise.** Four consecutive runs, same server, same build, default harness:

```
run 1: perf=42  LCP=5109ms  TBT=586ms  CLS=0.877
run 2: perf=60  LCP=1934ms  TBT=586ms  CLS=0.877
run 3: perf=42  LCP=5104ms  TBT=586ms  CLS=0.877
run 4: perf=60  LCP=1935ms  TBT=586ms  CLS=0.877
```

Lantern flips which resource it credits as LCP, so the score alternates 18 points while TBT lands on 586 ms every single time and CLS is bit-identical. Run at least three times and take the median (LHCI already defaults to `numberOfRuns: 3`); a dev-server URL swung 35 points across four runs the same way.

**Read the LCP node before optimising anything.** `lcp-breakdown-insight` names the element, with a selector and a bounding rect. On a page with a 694 KiB hero above the fold, that element was the `<h1>` — compressing the image could not have moved LCP at all.

The corollary is a trap worth knowing by name. Making the hero arrive *later* raises the score: an eager `fetchpriority="high"` hero scored 83 three times out of three (LCP ~4807 ms), while the identical page with `loading="lazy"` on that hero scored 100 / 100 / 83 — because Lantern then usually credits a cheap text node as LCP instead of the image. Median score up 17 points, user experience unchanged or worse. Under `devtools` throttling both versions scored 100. Score movements that survive only under one harness are artefacts, not wins.

**INP never appears in an ordinary run.** The `interaction-to-next-paint` audit declares `supportedModes: ['timespan']`, so a normal navigation audit omits it entirely, and its first line returns `notApplicable` whenever `throttlingMethod === 'simulate'`. Even in a `devtools` timespan with clicks that demonstrably registered (TBT rose 250 ms → 510 ms for one click vs two), the audit still reported `notApplicable` while `inp-breakdown-insight` returned the real subparts — input delay 1 ms, processing 302 ms, presentation 24 ms. For responsiveness, read that insight or field data.

**Lighthouse 13 renamed the whole diagnostic surface.** Seventeen `*-insight` audits replaced roughly thirty classic ones, and eight were deleted outright. Any config, CI assertion, or report parser written against `render-blocking-resources`, `uses-responsive-images`, `uses-long-cache-ttl` or friends now matches nothing and fails silently. [scoring.md](references/scoring.md) has the full mapping — including two ids the release blog gets wrong.

## Corrections to common assumptions

- **Performance budgets are gone.** `budget.json` and `--budget-path` were removed in **12.0.0**; there is no budget flag in 13. Assert thresholds in the CI runner instead — see [ci.md](references/ci.md).
- **There is no PWA category.** The five are `performance`, `accessibility`, `best-practices`, `seo`, and `agentic-browsing`. Nothing audits manifests or service workers for a score any more.
- **`agentic-browsing` is new, runs by default, and a stock app fails it.** A scaffolded SvelteKit app scored **50** there. It scores whether an AI agent can use the page: a well-formed accessibility tree, `llms.txt`, and WebMCP tool registration. Adding a `<title>`, a `<meta name="description">`, a `<main>`, and a `static/llms.txt` took accessibility 91 → 100, SEO 82 → 100 and agentic-browsing 50 → 100 in one pass.
- **FID is dead and `max-potential-fid` is unweighted.** It survives only as a hidden diagnostic; INP replaced FID in the field in March 2024.
- **The perf score is five metrics, nothing else.** TBT 30%, LCP 25%, CLS 25%, FCP 10%, SI 10%. All 45 other performance entries — every insight, every diagnostic — are worth zero. A report full of green diagnostics and a bad score is normal, and so is the reverse.
- **Lighthouse scoring thresholds are not the Core Web Vitals thresholds.** Core Web Vitals want LCP ≤ 2.5 s; a *desktop* Lighthouse run needs LCP ≤ 1200 ms to score 90 on that metric. Same name, different bar.
- **The DevTools *panel* is being sunset, not Lighthouse.** The npm module, the CLI and the PageSpeed Insights report all stay; performance work in DevTools moves to the Performance panel's Insights sidebar. Chrome DevTools MCP's own `lighthouse_audit` tool excludes the performance category for exactly this reason and points at traces instead.
- **The PageSpeed Insights API needs a key.** Keyless calls return HTTP 429 (`Quota exceeded for quota metric 'Queries'`) — the shared anonymous quota is permanently exhausted.
- **`--only-audits` recomputes the category score from the audits you kept.** Filtering to two metrics reported `performance: 100` on a page that scores 42. Filter to save tokens if you like, then ignore the category scores in that report.
- **A dead server reads as `CHROME_INTERSTITIAL_ERROR`, not a connection error.** When a run fails, `runtimeError.code` in the JSON is the diagnosis and every metric audit carries the same message; the category score is `null`, not 0.

## Related skills

- **svelte-sveltekit** — the framework itself: SSR, hydration, preload settings, adapters
- **playwright-cli** — driving the browser when you need interaction rather than a score
- **playwright-trace** — reading a trace once Lighthouse has told you where to look
