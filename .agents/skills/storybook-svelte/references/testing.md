# Testing stories

Every story is already a render test. Adding `play` makes it an interaction test. `@storybook/addon-vitest` runs both — in the Storybook sidebar, from the CLI, and in CI — by transforming stories into Vitest tests that execute in a real browser.

## Play functions

```svelte
<Story
  name="Submits"
  args={{ onsubmit: fn() }}
  play={async ({ args, canvas, userEvent, step }) => {
    await step('fill the form', async () => {
      await userEvent.type(canvas.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(canvas.getByLabelText('Password'), 'hunter2');
    });
    await userEvent.click(canvas.getByRole('button', { name: 'Log in' }));
    await expect(args.onsubmit).toHaveBeenCalled();
    await expect(canvas.getByText('Welcome back')).toBeInTheDocument();
  }}
/>
```

The context carries `args`, `canvas`, `canvasElement`, `userEvent`, `parameters`, `globals`, `step` and `mount`. `canvas` is a Testing Library query object scoped to the story — `within(canvas)` is an error, `within(canvasElement)` is the older equivalent. Await every `userEvent` and every `expect` so the Interactions panel can step through them.

`mount()` — for running setup before the component renders — throws in Svelte CSF; write those stories in CSF 3.

## `storybook/test`

One module, exporting Vitest's `expect`, `fn`, `spyOn`, `mocked`, the reset helpers, Testing Library's `within`, `screen`, `waitFor`, `waitForElementToBeRemoved`, `fireEvent`, every `getBy*` / `queryBy*` / `findBy*`, and `sb` for module mocking. `@storybook/test` is the pre-9 package name and no longer exists.

`fn()` spies are best declared as args so they show in the Actions panel *and* are assertable:

```ts
args: { onselect: fn() }
```

## Module mocking

```ts
// .storybook/preview.ts — the only place mocks may be registered
import { sb } from 'storybook/test';

sb.mock(import('../src/lib/session.ts'), { spy: true }); // keeps behaviour, records calls
sb.mock(import('../src/lib/db.ts'));                     // automock, or use a __mocks__ file
sb.mock(import('uuid'), { spy: true });
```

Rules that bite: paths are relative to `preview.*`, must include the file extension, and may not use aliases or subpath imports; wrapping in `import()` gives TypeScript the types. `sb.mock()` inside a story file does nothing — mocking is resolved at build time by a Vite plugin that only scans the preview file. There is no factory argument.

Per-story behaviour goes through `beforeEach` and `mocked()`:

```ts
import { mocked } from 'storybook/test';
import { getSession } from '../src/lib/session';

beforeEach: async () => { mocked(getSession).mockResolvedValue({ user: 'ada' }); }
```

Network calls are better intercepted with MSW (`msw-storybook-addon`) than mocked module-by-module.

## The Vitest addon

`npx storybook add @storybook/addon-vitest` installs the addon, Vitest, Playwright and the browser provider, then writes a Vitest project. On SvelteKit it lands **inside the existing `vite.config.ts`**:

```ts
export default defineConfig({
  plugins: [sveltekit({ /* … */ })],
  test: {
    projects: [{
      extends: true,
      plugins: [storybookTest({ configDir: `${import.meta.dirname}/.storybook` })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),          // from @vitest/browser-playwright, Vitest 4
          instances: [{ browser: 'chromium' }],
        },
      },
    }],
  },
});
```

Vitest 4 takes the provider as a function from `@vitest/browser-playwright`; Vitest 3 takes the string `'playwright'`. Vitest below 3.2 uses a workspace file instead of `test.projects`.

No `setupFiles` and no `.storybook/vitest.setup.ts` are required. The plugin always injects its own setup file, and injects the project-annotations one as well whenever your `setupFiles` do not already call `setProjectAnnotations` — so global parameters, decorators, tags and `sb.mock` registrations all reach the runner unaided. The docs' example configs still show a setup file; keep one only for per-test setup that `preview.ts` cannot express.

`storybookTest` options and their defaults:

| Option | Default | Notes |
|---|---|---|
| `configDir` | `.storybook` | |
| `tags` | `{ include: ['test'], exclude: [], skip: [] }` | `exclude` wins over `include` for the same tag |
| `storybookScript` | — | watch mode starts Storybook with it, but only if `storybookUrl` is not already answering |
| `storybookUrl` | `http://localhost:6006` | what failure links point at; set the published URL in CI |
| `disableAddonDocs` | `true` | MDX is mocked during test runs unless you turn this off |
| `initialGlobals` | `{}` | global values applied to every story in the project |

## Running

```bash
vitest --project=storybook          # watch
vitest --project=storybook --run    # once, for CI
```

A `test-storybook` script wrapping that is the convention. In the Storybook UI the testing widget runs everything, a sidebar item's menu runs one story or one component, and the eye icon turns on watch mode. Failures land in the Interactions panel with a step-by-step debugger. Vitest's editor extensions work too, since these are ordinary Vitest tests.

Behaviour under test: each story is smoke-tested for render, and its `play` function is executed with all assertions validated. Snapshot tests are the one test type the addon does not cover — that stayed with the older test-runner.

## Filtering by tag

```ts
storybookTest({
  configDir: '…',
  tags: { include: ['test'], exclude: ['experimental'], skip: ['flaky'] },
})
```

Default is every story tagged `test` (implicit on all stories). Excluded stories are not run; skipped ones are counted as skipped. Story-level `tags: ['!test']` opts a single story out.

## Accessibility

`@storybook/addon-a11y` runs axe-core against the rendered story and reports Violations / Passes / Incomplete in its panel. With the Vitest addon installed it becomes a test type:

```ts
parameters: { a11y: { test: 'todo' } }   // 'todo' report only | 'error' fail the run | 'off'
```

Under `'error'` the violations surface from an `afterEach`, each naming the axe rule and the selector it fired on.

`parameters.a11y.context`, `.config` and `.options` map onto `axe.run` / `axe.configure`; the `region` rule is disabled by default because it misfires on isolated components. `globals: { a11y: { manual: true } }` stops the automatic check on story visit.

Fix structural violations (roles, labels, alt text, heading order, focus handling) directly; contrast, spacing and focus-ring changes are design decisions — surface them rather than silently restyling.

## Portable stories

`composeStories` from the framework package turns CSF 3 stories into functions any Vitest test can render — `const { Primary } = composeStories(stories); await Primary.run()`. The Vitest addon is built on the same API, which is why calling it by hand is rarely worth it, and two things make hand-rolling it worse on this stack:

- **A `.stories.svelte` module composes to `{}`.** No error, no warning — just an object with no stories, so a test file built on one runs zero tests and reports success.
- **`parameters.sveltekit_experimental` did not reach the mocks.** In a plain Vitest browser project the component renders, but the configured page URL is ignored: without `storybookSveltekitPlugin()` from `@storybook/sveltekit/vite-plugin` in that project's `plugins`, `$app/state` is not mocked at all; with it, the mock serves its own defaults instead of the story's values, even with `setProjectAnnotations` from `@storybook/sveltekit` in a setup file. The identical story passes under `vitest --project=storybook`.

So reach for the Vitest addon, and keep `composeStories` for stories that touch no `$app/*` module.

## Coverage and CI

`@vitest/coverage-v8` is installed by the CLI; coverage comes from the same run, and only for the projects you pass on the command line. In CI, run `vitest --project=storybook --run` after `playwright install --with-deps chromium`, and set `storybookUrl` so failures link to a published Storybook. A CI run that fails with `Failed to fetch dynamically imported module` or "cannot connect to the iframe" is usually resource exhaustion: `test.isolate: false`, or `--shard=1/3` across jobs. The older `@storybook/test-runner` (Playwright driving a built Storybook) remains the option for Webpack-built projects only.
