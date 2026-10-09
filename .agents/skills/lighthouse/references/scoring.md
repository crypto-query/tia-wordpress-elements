# What the numbers mean

Read out of `lighthouse@13.4.1`'s own `core/config/default-config.js` and the metric audit classes, not from documentation.

## The performance score is five metrics

| metric | weight | mobile p10 (scores 90) | mobile median (scores 50) | desktop p10 | desktop median |
|---|---|---|---|---|---|
| Total Blocking Time | **30%** | 200 ms | 600 ms | 150 ms | 350 ms |
| Largest Contentful Paint | **25%** | 2500 ms | 4000 ms | **1200 ms** | 2400 ms |
| Cumulative Layout Shift | **25%** | 0.1 | 0.25 | 0.1 | 0.25 |
| First Contentful Paint | 10% | 1800 ms | 3000 ms | 934 ms | 1600 ms |
| Speed Index | 10% | 3387 ms | 5800 ms | 1311 ms | 2300 ms |

Each metric is scored on a log-normal curve through those two control points, then weighted. Nothing else in the performance category carries weight: of 50 entries, 5 are scored, 1 is an unweighted metric (INP), 17 are insights, 12 are diagnostics and 15 are hidden data holders (`metrics`, `network-requests`, `screenshot-thumbnails`, `script-treemap-data`, `redirects`, `server-response-time`, `layout-shifts`, `max-potential-fid` …).

Consequences worth internalising: **TBT and LCP together are 55% of the score**, CLS is worth as much as LCP, and the desktop LCP bar (1200 ms) is twice as strict as the mobile one. Fixing a "red" diagnostic that no metric depends on moves the score by exactly zero.

## Lab score vs Core Web Vitals

Core Web Vitals are field thresholds at the 75th percentile of real users over 28 days: LCP 2.5 s / 4.0 s, INP 200 ms / 500 ms, CLS 0.1 / 0.25. INP replaced FID in March 2024.

Only LCP and CLS appear in both places, and only the mobile curve happens to line up with the field threshold. TBT — the heaviest metric in the lab score — is not a Core Web Vital at all; it is a lab proxy for the responsiveness that INP measures in the field. A 100 in Lighthouse and a failing CWV assessment are perfectly consistent, and vice versa.

## The five categories

`performance`, `accessibility` (58 weighted audits), `best-practices` (13), `seo` (10), `agentic-browsing` (6). All five run by default and all five are valid `--only-categories` values. There is no `pwa` category.

`agentic-browsing` scores whether an AI agent can operate the page. Its six audits carry equal weight: `agent-accessibility-tree`, `llms-txt`, `webmcp-registered-tools`, `webmcp-form-coverage`, `webmcp-schema-validity`, and `cumulative-layout-shift`. The three WebMCP audits and `llms-txt` report `notApplicable` when the page ships neither, so on a normal site the category collapses to two live audits — which is how a stock app lands on exactly 50. `agent-accessibility-tree` re-runs a subset of the accessibility rules (a missing `<title>` failed it), so it is usually fixed by the same work that fixes accessibility and SEO. Serving a `llms.txt` that is Markdown with at least one H1 flips `llms-txt` from `notApplicable` to a pass.

## Lighthouse 13 renamed the diagnostics

Seventeen insight audits replaced about thirty classic audits. The old ids are gone from both the report and the JSON.

| insight audit | replaces |
|---|---|
| `lcp-breakdown-insight` | `largest-contentful-paint-element` |
| `lcp-discovery-insight` | `prioritize-lcp-image`, `lcp-lazy-loaded` |
| `cls-culprits-insight` | `layout-shifts` (still present as hidden data) |
| `render-blocking-insight` | `render-blocking-resources` |
| `document-latency-insight` | `redirects`, `server-response-time`, `uses-text-compression` |
| `image-delivery-insight` | `modern-image-formats`, `uses-optimized-images`, `uses-responsive-images`, `efficient-animated-content` |
| `network-dependency-tree-insight` | `critical-request-chains`, `uses-rel-preconnect` |
| `cache-insight` | `uses-long-cache-ttl` |
| `modern-http-insight` | `uses-http2` |
| `legacy-javascript-insight` | `legacy-javascript` |
| `duplicated-javascript-insight` | `duplicated-javascript` |
| `font-display-insight` | `font-display` |
| `dom-size-insight` | `dom-size` |
| `viewport-insight` | `viewport` |
| `third-parties-insight` | `third-party-summary` |
| `inp-breakdown-insight` | `work-during-interaction` |
| `forced-reflow-insight` | new in 13 |

Two ids in the Lighthouse 13 release post do not exist in the shipped package: it lists `use-cache-insight` (really `cache-insight`) and `interaction-to-next-paint-insight` (really `inp-breakdown-insight`). Read `getAuditList()` or `default-config.js` when an id matters.

Gone with no replacement: `first-meaningful-paint`, `font-size`, `no-document-write`, `offscreen-images`, `preload-fonts`, `third-party-facades`, `uses-passive-event-listeners`, `uses-rel-preload` (that last one had already disappeared before 13 — it is absent from 12.6.1 too). `non-composited-animations` and `unsized-images` survive as diagnostics.

Still-scored classic diagnostics (unweighted but read by humans): `unminified-css`, `unminified-javascript`, `unused-css-rules`, `unused-javascript`, `total-byte-weight`, `bootup-time`, `mainthread-work-breakdown`, `long-tasks`, `user-timings`, `bf-cache`.

## Score display modes

`scoreDisplayMode` tells you how to read `score`:

- `numeric` — a curve score; the only kind you can trend.
- `binary` — pass or fail (1 or 0).
- `metricSavings` — pass/fail plus an estimated saving; the saving is Lantern's guess, not a promise.
- `informative` — never scored, always worth reading (`lcp-breakdown-insight` lives here).
- `notApplicable` — the audit found nothing to judge, and it is **excluded from the category average**, which is why adding an applicable-but-failing feature can lower a score that was previously "clean".
- `manual` — a checklist item for a human.

## INP

`interaction-to-next-paint` is scored on p10 200 ms / median 500 ms but carries **weight 0** and declares `supportedModes: ['timespan']`, so it cannot appear in a navigation run at all. Its implementation returns `notApplicable` immediately when `throttlingMethod === 'simulate'` (the source comment: responsiveness isn't supported by Lantern), and again when the trace holds no `Responsiveness.Renderer.UserInteraction` event. In a headless `devtools` timespan with clicks that measurably registered, it still came back `notApplicable` — the usable output was `inp-breakdown-insight`'s subparts: input delay, processing duration, presentation delay.
