# Gating performance in CI

## Pick the runner by which Lighthouse it ships

| tool | version checked | Lighthouse it runs | shape |
|---|---|---|---|
| `lighthouse` CLI | 13.4.1 | 13.4.1 | one URL per invocation; you write the loop and the assertions |
| `@lhci/cli` | 0.15.1 (published 2025-06-25) | **12.6.1, pinned exactly** | multi-run collection, assertions, history server |
| `unlighthouse` / `unlighthouse-ci` | 0.18.0 | `^13.4.0` | crawls a whole site, scores every route |
| `treosh/lighthouse-ci-action` | 12.6.2 (2026-03-12) | LHCI's 12.x | GitHub Action wrapper around LHCI |

That pin is the decision-maker, and the two versions overlap less than they look. Both reports were dumped side by side:

- **LHCI's 12.6.1 carries both audit families** — all 17 `*-insight` audits *and* the classic `render-blocking-resources`, `uses-responsive-images`, `uses-long-cache-ttl`, `uses-text-compression`, `modern-image-formats`, `critical-request-chains`, `third-party-summary`, `dom-size`, `font-display`, `uses-http2`, `legacy-javascript`.
- **13.4.1 kept only the insights.** Every classic id above returns undefined; `layout-shifts` survives as hidden data.
- 12.6.1 has **four categories** — no `agentic-browsing`.
- The five scored metrics and their weights are byte-identical in both, so scores remain comparable across the two.

So: **assert on the five metrics and on `*-insight` ids, which exist in both.** An assertion naming a classic id works today on LHCI and silently stops matching the moment anything moves to the 13.x CLI — a gate that passes because it no longer measures anything.

## Assert on medians, and on the stable metrics

Performance budgets are gone from Lighthouse itself (`budget.json` and `--budget-path` were removed in 12.0.0). Thresholds live in the runner.

LHCI's verified vocabulary: `minScore`, `maxNumericValue`, `maxLength`, and `aggregationMethod` (`median-run` | `optimistic` | `pessimistic`); presets are `lighthouse:recommended`, `lighthouse:no-pwa`, `lighthouse:all`. `numberOfRuns` defaults to 3.

This config was executed (`lhci collect` then `lhci assert`) — it collects at `formFactor: desktop` / `throttlingMethod: devtools` / cpu 1×, and the CLS assertion correctly failed a page with CLS 0.911:

```js
// lighthouserc.cjs
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'PORT=3000 node build/index.js',
      url: ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000/pricing'],
      numberOfRuns: 5,
      settings: { throttlingMethod: 'devtools', preset: 'desktop' },
    },
    assert: {
      assertions: {
        'total-blocking-time': ['error', { maxNumericValue: 300, aggregationMethod: 'median-run' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median-run' }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
  },
};
```

Why it is shaped that way, from the measurements in [SKILL.md](../SKILL.md):

- **TBT and CLS are `error`; LCP is `warn`.** Across four identical runs TBT varied by 0 ms and CLS was bit-identical, while simulated LCP alternated between 1934 ms and 5109 ms. An LCP gate at `error` on the default harness is a coin flip that will block merges at random.
- **`throttlingMethod: 'devtools'`** trades PSI comparability for numbers that reconcile and repeat. If your gate exists to catch regressions rather than to match a public score, that is the right trade.
- **Never gate on the category score.** It is five metrics blended, so a TBT regression can hide behind an LCP improvement in the same commit. Gate the metrics you care about and let the score be a report.
- **`numberOfRuns: 5`** for a metric gate. Three is the default and the minimum defensible.

`collect.staticDistDir` autodiscovers only **5** URLs by default (`maxAutodiscoverUrls`), which quietly under-covers a prerendered site — list URLs explicitly or raise it. `method: 'psi'` routes collection through the PageSpeed Insights API and needs `psiApiKey` plus a publicly reachable URL.

## Whole-site sweeps

`unlighthouse` is the one tracking Lighthouse 13, and it crawls rather than taking a URL list:

```bash
bunx unlighthouse-ci --site http://127.0.0.1:3000 --budget 75 --throttle --reporter jsonExpanded
```

Verified flags: `--site`, `--urls` (comma-separated relative paths, disables the crawler), `--exclude-urls`, `--samples`, `--throttle`, `--desktop` / `--mobile`, `--budget <1-100>` (a minimum score, per category), `--reporter csv|csvExpanded|json|jsonExpanded|false`, `--build-static`, `--extra-headers`, `--cookies`, `--auth user:pass`, `--sitemaps`, `--disable-robots-txt`. Note `--budget` gates *scores* — the noisy thing — so keep it low enough to catch collapses rather than drift, and take the per-route JSON for anything finer.

The `unlighthouse` binary lives in the `unlighthouse` package; `@unlighthouse/cli` alone installs `unlighthouse-ci`.

## Chrome in CI

Add `--no-sandbox` to `--chrome-flags` in a container, and set `CHROME_PATH` when the launcher cannot find a browser. A container's CPU share is the largest source of cross-environment score differences: the same commit will score differently on a shared runner than on your laptop, which is another reason to gate on TBT deltas against a baseline collected on the same runner class rather than on absolute numbers borrowed from anywhere else.
