# SvelteKit modules in stories

`@storybook/sveltekit` renders components on the client only. Kit's server-side and service-worker modules therefore cannot work, and the client-side ones are supplied as mocks you configure through `parameters.sveltekit_experimental`.

## Module support

| Module | Status | Note |
|---|---|---|
| `$app/environment` | works | `version` is always empty |
| `$app/paths` | works | needs SvelteKit 1.4+ |
| `$env/static/public` | works | |
| `$lib`, `@sveltejs/kit/*` | works | |
| `$app/state` | mockable | needs SvelteKit 2.12+ |
| `$app/stores` | mockable | the pre-2.12 store form |
| `$app/navigation` | mockable | |
| `$app/forms` | mockable | |
| `$env/dynamic/public` | dev only | the built Storybook is static, with no server to serve values |
| `$env/static/private`, `$env/dynamic/private` | unsupported | server-only |
| `$service-worker` | unsupported | |

## Where the configuration goes

In `parameters`, on a meta or a single story — never in `.storybook/main.ts`.

```svelte
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fn } from 'storybook/test';
  import Nav from './Nav.svelte';

  const goto = fn();

  const { Story } = defineMeta({
    component: Nav,
    parameters: {
      sveltekit_experimental: {
        navigation: { goto },
        state: { page: { url: new URL('https://example.com/dashboard') } },
      },
    },
  });
</script>

<Story
  name="Navigates"
  play={async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
    await expect(goto).toHaveBeenCalledWith('/next');
  }}
/>
```

Declaring the spy outside `defineMeta` is what lets the play function assert on it. The same object shape works verbatim as `parameters` on a CSF 3 story.

## The parameter API

### `state` — `$app/state` (SvelteKit 2.12+)

`state.page` is a partial `page`: `url`, `params`, `route.id`, `data`, `form`, `status`, `error`. `state.navigating` is a partial `navigating`: `from`, `to`, `type`, `willUnload`, `delta`, `complete`. `state.updated` is `{ current: boolean }`, and `updated.check()` is a no-op.

```ts
sveltekit_experimental: {
  state: {
    page: { data: { test: 'passed' }, params: { id: '42' }, route: { id: '/items/[id]' }, status: 200 },
    navigating: { to: { route: { id: '/next' }, params: {}, url: new URL('https://example.com/next') } },
    updated: { current: true },
  },
}
```

### `stores` — `$app/stores`

The same shapes under `stores.page`, `stores.navigating`, `stores.updated`, for components still reading the store API. `stores.updated` is a boolean here, not `{ current }`.

### `navigation` — `$app/navigation`

`goto`, `pushState`, `replaceState`, `invalidate`, `invalidateAll` each take a callback that fires when the component calls them; without one, the call is logged to the Actions panel. `afterNavigate` takes an **object**, which is passed to the component's `afterNavigate` callback when the story mounts.

### `forms` — `$app/forms`

`forms.enhance` is a callback fired when a form using `use:enhance` submits.

### `hrefs` — link clicks

Clicking an `<a href>` inside a story logs an action by default. To intercept:

```ts
sveltekit_experimental: {
  hrefs: {
    '/basic-href': (to, event) => { /* … */ },
    '/items/.*': { callback: (to, event) => { /* … */ }, asRegex: true },
  },
}
```

## Everything that is not a `$app/*` module

Load functions, API clients, `$lib` helpers, packages — mock them with `sb.mock()` in `.storybook/preview.ts`. That file is the only legal place to register a mock; stories then reshape the behaviour per story. Full rules in [testing.md](testing.md).

```ts
// .storybook/preview.ts
import { sb } from 'storybook/test';

sb.mock(import('../src/lib/session.ts'), { spy: true });
sb.mock(import('uuid'));
```

## Stories for routes

A `+page.svelte` is a component like any other: import it, feed it `data` through args, and mock what its children reach for. Its `+page.server.ts` load never runs — the props are yours to supply. Layout wrappers belong in a decorator or a `template` snippet.

## Under the Vitest runner

The mocks are installed by a Vite plugin the framework adds, so `parameters.sveltekit_experimental` behaves identically in the browser and under `@storybook/addon-vitest` — a `play` function can assert on the spies either way. Outside those two, in a hand-rolled `composeStories` test, the parameters did not reach the mocks at all; [testing.md](testing.md#portable-stories) has the measurements.

## No `svelte.config.js`

Recent SvelteKit scaffolds put their configuration in the `sveltekit()` plugin options inside `vite.config.ts` and ship no `svelte.config.js`. Storybook builds and tests fine, and logs `no Svelte config found … using default configuration` once per stories file. What that costs you is where compiler options have to live — [setup.md](setup.md#svelte-compiler-options).
