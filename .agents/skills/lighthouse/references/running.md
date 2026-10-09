# Running Lighthouse

Every command and script here was executed against lighthouse 13.4.1 / Chrome 151.

## The command

```bash
bunx lighthouse http://127.0.0.1:3000/ \
  --output=json --output-path=stdout \
  --chrome-flags="--headless=new" --quiet --only-categories=performance
```

`bunx` runs the CLI fine (verified end to end, not just `--version`). Chrome is found automatically; set `CHROME_PATH` when it isn't, and add `--no-sandbox` to `--chrome-flags` inside a container. Two runs against the same port are safe — each gets a fresh temporary profile.

Flags that change what you learn:

| flag | effect |
|---|---|
| `--output=json --output-path=stdout` | the JSON on stdout for piping; `--output=html` writes a file named after the URL and date |
| `--only-categories` | `performance`, `accessibility`, `best-practices`, `seo`, `agentic-browsing` |
| `--only-audits` / `--skip-audits` | filters audits **and recomputes category scores from the survivors** — the scores in a filtered report are fiction |
| `--throttling-method` | `simulate` (default), `devtools`, `provided` — the single biggest lever on the number |
| `--preset` | `desktop`, `perf`, `experimental`. `perf` = `onlyCategories: ['performance']` **plus `throttlingMethod: 'devtools'`** |
| `--form-factor` | scoring curve and mobile-only audits. For desktop use `--preset=desktop`, which also sets emulation, UA and throttling |
| `--throttling.cpuSlowdownMultiplier` | overrides CPU throttling alone; useful to check whether a finding is CPU-bound |
| `--extra-headers` | a JSON string or a path to a JSON file (both accepted) — how you audit behind auth |
| `--save-assets` | writes the trace and devtools log next to the report, for the Performance panel or `playwright-trace` |
| `--max-wait-for-load` | raise only when a slow page genuinely times out; it inflates traces |

There is no `--budget-path`: budgets were removed in 12.0.0.

## The four harnesses

`throttlingMethod` decides both what Chrome experiences and what the numbers mean.

- **`simulate`** (default): the page loads unthrottled; **Lantern** then models a slow 4G link (150 ms RTT, 1638 Kbps, cpu 4×) over the recorded dependency graph. This is what PageSpeed Insights reports, so it is the only method whose scores are comparable to PSI. Its metric values do not match its own insight tables, and its LCP estimate is the unstable part of the score.
- **`devtools`**: real CDP throttling at the same 150 ms / 1638 Kbps / cpu 4×. Numbers reconcile — the LCP subpart table sums to the LCP metric exactly. Slower to run, and by loading genuinely slowly it can push a late-arriving image out of the run entirely, which is how CLS 0.877 became 0.000 in the same page.
- **`provided`**: no throttling at all; you are measuring your own machine and a localhost link. Fine for tracking a bundle-size regression, useless as a user-facing number.
- **`--preset=desktop`**: `formFactor: desktop`, 40 ms RTT / 10240 Kbps / **cpu 1×**, 1350×940 at DPR 1, desktop UA — and `throttlingMethod` stays `simulate`. Desktop scoring curves are much stricter (see [scoring.md](scoring.md)).

Default mobile emulation is 412×823 at DPR 1.75. Turn emulation off with `--screenEmulation.disabled` only if you know why; scoring assumes the emulated device.

## Node API

The package has no `exports` map, so import from the root: `lighthouse` (default = navigation run), plus `startFlow`, `startTimespan`, `snapshot`, `navigation`, `desktopConfig`, `generateReport`, `auditFlowArtifacts`, `getAuditList`.

Verified against a Playwright-launched Chrome — this produced perf 83 / LCP 4807 ms, matching the CLI's 83 / 4808 ms on the same page:

```js
import { chromium } from 'playwright-core';
import lighthouse from 'lighthouse';

const browser = await chromium.launch({ channel: 'chrome', args: ['--remote-debugging-port=9222'] });
const page = await browser.newPage();          // keep a page open so Lighthouse has a target
const { lhr } = await lighthouse('http://127.0.0.1:3000/', {
  port: 9222,
  output: 'json',
  logLevel: 'error',
  onlyCategories: ['performance'],
});
console.log(Math.round(lhr.categories.performance.score * 100), lhr.audits['largest-contentful-paint'].numericValue);
await page.close();
await browser.close();
```

Lighthouse drives the browser over CDP and needs its own tab; it does not reuse Playwright's page state. For an authenticated run, either pass `--extra-headers` / cookies through the CDP session before the audit or use a flow (below), where you control the page between steps.

`chrome-launcher` + `puppeteer-core` works identically and is what the flow API expects.

## Flows: navigation, timespan, snapshot

A flow is how you measure anything past the first paint — client-side navigation, an interaction, a modal. Verified script shape:

```js
import { startFlow } from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import puppeteer from 'puppeteer-core';

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
const page = await browser.newPage();

const flow = await startFlow(page, {
  config: { extends: 'lighthouse:default', settings: { throttlingMethod: 'devtools' } },
});
await flow.navigate('http://127.0.0.1:3000/');   // full navigation report
await flow.startTimespan({ name: 'click' });     // no reload; records what you do next
await page.locator('button').click();
await new Promise((r) => setTimeout(r, 1500));   // let the interaction settle inside the timespan
await flow.endTimespan();

const result = await flow.createFlowResult();
for (const step of result.steps) console.log(step.name, step.lhr.gatherMode, step.lhr.categories.performance?.score);
```

What the modes actually return, measured:

| step | audits | categories | notes |
|---|---|---|---|
| `navigate` | 160 | all five | the same thing the CLI does |
| `startTimespan`/`endTimespan` | 49 | `performance`, `best-practices` | no LCP/FCP (there is no navigation); TBT, CLS and `inp-breakdown-insight` work |
| `snapshot` | — | — | audits the current DOM only; no trace, no timing metrics |

Set `throttlingMethod: 'devtools'` on a flow. Under `simulate` the responsiveness audits self-disable.

## Reading the JSON

```bash
bunx lighthouse "$URL" --output=json --output-path=stdout --quiet --only-categories=performance 2>/dev/null \
  | jq '{score: (.categories.performance.score*100|round),
         metrics: [.audits["largest-contentful-paint"], .audits["total-blocking-time"], .audits["cumulative-layout-shift"] | {id, numericValue}],
         failing: [.audits | to_entries[] | select(.value.score != null and .value.score < 0.9)
                   | {id: .key, score: .value.score, saving: .value.displayValue}]}'
```

Useful fields: `lighthouseVersion`, `configSettings` (the harness — always log it), `runtimeError.code`, `audits[id].scoreDisplayMode` (`numeric` / `binary` / `metricSavings` / `informative` / `notApplicable` / `manual`), `audits[id].details.items`, and `categories[id].auditRefs[].weight` for what actually counted.

Treat `score: null` as "no verdict", never as zero: it means `notApplicable`, `informative`, `manual`, or a failed run.
