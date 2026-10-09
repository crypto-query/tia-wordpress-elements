# Symptom first

## The score changed and no code did

Expected. Re-run three times before believing any delta. Measured on one unchanged build, default harness: 42 / 60 / 42 / 60, driven entirely by simulated LCP (5109 / 1934 / 5104 / 1935 ms) while TBT held at 586 ms on every run and CLS was bit-identical.

Ruled out as causes: server warm-up (three runs against a freshly started server gave 100 / 100 / 100 with LCP 1361 / 1358 / 1369 ms) and cold caches (each run gets a fresh Chrome profile anyway). What remains is Lantern's choice of which resource to credit for LCP, which has two discrete outcomes on some pages.

Before comparing any two numbers, diff `configSettings` from both reports — `formFactor`, `throttlingMethod`, `throttling.cpuSlowdownMultiplier`, `screenEmulation`. A flag difference explains up to 51 points on its own.

## The insight table doesn't add up to the metric

Under the default `simulate`, it never will. Measured on one page: `lcp-breakdown-insight` subparts summed to 63 ms; the LCP metric read 4815 ms. Chrome loaded the page unthrottled — so the trace, and every table derived from it, describes a fast load — while the metric is Lantern's estimate of a slow one.

Re-run with `--throttling-method=devtools` and they agree exactly (616 ms of subparts, 616 ms of metric). Any time you need to reason about *where* time went, that flag is the fix.

## CLS appears in one run and vanishes in another

Same page, same build, two runs each:

| harness | CLS |
|---|---|
| `simulate` | 0.877, 0.877 |
| `devtools` | 0.000, 0.000 |
| `provided` | 0.877 |
| `desktop` (simulate) | 0.911 |

Both are honest. Under `simulate` the late image really does arrive during the (unthrottled) trace and really does shift the layout. Under real `devtools` throttling the image is still downloading when the run ends, so no shift is recorded — the shift didn't disappear, the measurement window closed first. A CLS of 0 under `devtools` is not evidence of stability; check `cls-culprits-insight` and `unsized-images` regardless.

## INP is reported as n/a

Three separate gates, in order:

1. The audit declares `supportedModes: ['timespan']` — a navigation run (i.e. the CLI) omits it entirely.
2. Its first statement returns `notApplicable` when `throttlingMethod === 'simulate'`.
3. It returns `notApplicable` when the trace holds no `Responsiveness.Renderer.UserInteraction` event.

In a `devtools` timespan whose clicks demonstrably registered — TBT rose from 250 ms for one click to 510 ms for two — the audit still reported `notApplicable` and `inp-breakdown-insight` still returned usable subparts (input delay 1 ms, processing 302 ms, presentation 24 ms, reproduced across runs). Take the subparts; for a real INP number use field data.

## The LCP element isn't what I assumed

Read the `type: "node"` item in `lcp-breakdown-insight.details.items` — it carries the selector and bounding rect. A 694 KiB hero above the fold was *not* the LCP element on a page whose `<h1>` won it; the whole image-optimisation branch would have been wasted work.

The counter-trap: making the hero slower raises the score. Three runs each, same harness — eager `fetchpriority="high"` hero: 83 / 83 / 83 (LCP ~4807 ms, deterministic). Same page with `loading="lazy"` on it: 100 / 100 / 83 (LCP 1354 / 1362 / 4804 ms). Deferring the image just moves LCP onto a text node most of the time. Under `devtools` throttling both scored 100.

So when a "fix" improves the score, check two things before believing it: that the LCP element is still the same element, and that the improvement survives a second harness.

## Failures that are really about localhost

- `document-latency-insight` — a checklist; the failing item is usually "No compression applied", because a local Node server doesn't gzip.
- `cache-insight` — local static files carry no `Cache-Control`.
- `network-dependency-tree-insight` — flags a chain whose real cost is single-digit milliseconds.
- `errors-in-console` — a `/favicon.ico` 404 counts, and costs 4 Best Practices points.

`modern-http-insight` and `render-blocking-insight` both pass over plain HTTP/1.1 localhost, so they are worth trusting there.

## The run failed

`categories.*.score` is `null` and every metric audit repeats one message. Read `runtimeError.code`:

- `CHROME_INTERSTITIAL_ERROR` — "Chrome prevented page load with an interstitial". This is also what a **dead server** looks like; curl the URL before debugging anything else.
- `NO_FCP` / `NO_LCP` — the page never painted; usually a JS error or a redirect to a login page.
- `ERRORED_DOCUMENT_REQUEST` / `NOT_HTML` — the URL answered, but with an error status or a non-HTML body.
- `PAGE_HUNG`, `TARGET_CRASHED` — raise `--max-wait-for-load` or reduce the page.

(32 codes exist; those are the ones that actually turn up.)

A stale server serving a rebuilt app is the nastiest version of this, because it does *not* error: the hydration bundle 404s, the page still renders SSR HTML, and the report comes back *better* (TBT 0 ms, everything green) with the app completely dead. After every rebuild, restart the server and fetch one hashed asset from `_app/immutable/` to confirm a 200 before auditing.

## When the report isn't enough

A Lighthouse report tells you *which* metric and *which* element. For *why* — a specific long task, a forced reflow, a paint you can watch frame by frame — record a trace instead: `--save-assets` writes the trace next to the report for the Performance panel or `playwright-trace`.
