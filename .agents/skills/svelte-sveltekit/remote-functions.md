---
title: "Remote functions"
summary: "Type-safe client/server communication in SvelteKit: query, query.batch, query.live, form, command, prerender, single-flight mutations, and validation. Experimental — requires kit.experimental.remoteFunctions."
verified_against: "@sveltejs/kit 2.70.2, svelte 5.56.8"
mcp_sections: ["kit/remote-functions", "kit/$app-server", "kit/hooks"]
---

# Remote functions

Functions you **call anywhere** that **always run on the server**. Exported from a `.remote.ts` / `.remote.js` file; the client gets a `fetch` wrapper around a generated HTTP endpoint. Because the body only ever runs server-side, it can import `$lib/server/*`, `$env/static/private`, and database clients directly.

Available since **kit 2.27**. Still experimental: no semver protection, breaking changes ship in any release.

## Opt in

Both flags are required — remote functions are designed around Svelte's `await` support.

```js
/// file: svelte.config.js
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		experimental: {
			remoteFunctions: true
		}
	},
	compilerOptions: {
		experimental: {
			async: true
		}
	}
};

export default config;
```

Or scaffold both: `npx sv add experimental="features:async,remoteFunctions"`.

Since kit 2.62 the same config can live in `vite.config.js` under the `sveltekit()` plugin — see [config.md](config.md). If you configure it there, `svelte.config.js` is ignored entirely.

## Choosing a flavour

| Need | Use | Degrades without JS |
|---|---|---|
| Read dynamic data | `query` | n/a (rendered on the server) |
| Read data, avoid n+1 | `query.batch` | n/a |
| Read a real-time stream | `query.live` | first value only |
| Write data from a `<form>` | `form` | ✅ yes |
| Write data from anywhere else | `command` | ❌ no |
| Read data fixed until redeploy | `prerender` | n/a |

Two rules that decide most cases:

- **Prefer `form` over `command`.** `form` works with JavaScript disabled or still loading; `command` does not.
- **Prefer `prerender` over `query`** for data that changes at most once per deployment — it moves onto the CDN. `query` cannot be used at all on a fully prerendered page (`export const prerender = true`).

### Remote functions vs `load`

They coexist; neither replaces the other.

- `load` still owns anything the **route** needs before it renders — auth gates, redirects on entry, data keyed to `params` that must exist before the page appears, and `depends`/`invalidate` flows.
- Remote functions own data a **component** needs, data that is fetched from more than one place (deduped for free), and every mutation.

A remote function called from a universal `load` is deduped against component-level calls of the same query.

## query

```js
/// file: src/routes/blog/data.remote.js
import { query } from '$app/server';
import * as db from '$lib/server/database';

export const getPosts = query(async () => {
	return await db.sql`SELECT title, slug FROM post ORDER BY published_at DESC`;
});
```

```svelte
<!--- file: src/routes/blog/+page.svelte --->
<script>
	import { getPosts } from './data.remote';
</script>

<ul>
	{#each await getPosts() as { title, slug }}
		<li><a href="/blog/{slug}">{title}</a></li>
	{/each}
</ul>
```

`await` is the recommended form. While the promise is pending — and if it rejects — the nearest [`<svelte:boundary>`](async-svelte.md) takes over.

The non-`await` form exposes `loading`, `error` and `current`, which is what you want when the boundary is the wrong granularity:

```svelte
<script>
	import { getPosts } from './data.remote';
	const query = getPosts();
</script>

{#if query.error}
	<p>oops!</p>
{:else if query.loading}
	<p>loading...</p>
{:else}
	<ul>
		{#each query.current as { title, slug }}<li>{title}</li>{/each}
	</ul>
{/if}
```

### Arguments must be validated

A query with an argument **is a public HTTP endpoint**. Pass a [Standard Schema](https://standardschema.dev/) (Zod, Valibot, ArkType) as the first argument:

```js
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { query } from '$app/server';

export const getPost = query(v.string(), async (slug) => {
	const [post] = await db.sql`SELECT * FROM post WHERE slug = ${slug}`;
	if (!post) error(404, 'Not found');
	return post;
});
```

```svelte
<script>
	import { getPost } from '../data.remote';
	let { params } = $props();

	const post = $derived(await getPost(params.slug));
</script>
```

Arguments and return values are serialized with [devalue](https://github.com/sveltejs/devalue), so `Date`, `Map`, `Set` and any custom types registered in your [`transport` hook](ssr-hooks.md) survive the round trip — not just JSON.

To skip validation deliberately, pass the literal `'unchecked'`. TypeScript will then describe a shape the runtime does not enforce, so treat the argument as hostile:

```ts
export const getStuff = query('unchecked', async ({ id }: { id: string }) => { /* ... */ });
```

Shape the 400 response for failed validation with the `handleValidationError` server hook:

```js
/// file: src/hooks.server.js
/** @type {import('@sveltejs/kit').HandleValidationError} */
export function handleValidationError({ event, issues }) {
	return { message: 'Nice try, hacker!' };
}
```

### Deduplication and caching

The serialized argument is the cache key. On the server this is a request-scoped cache; on the client, identical invocations point at one instance — so `getPosts() === getPosts()` and you never need to hoist a `const posts = getPosts()` just to share it.

Object, map and set arguments are **key-sorted**, so `getPosts({ limit: 10, offset: 10 })` and `getPosts({ offset: 10, limit: 10 })` hit the same entry. When order carries meaning, use an array.

The cached value is released once nothing references the query — rendered in a component, being awaited, or otherwise held.

Refresh on demand:

```svelte
<button onclick={() => getPosts().refresh()}>Check for new posts</button>
```

## query.batch

Solves n+1. Calls made within the same macrotask arrive as an array; you return a lookup function `(input, index) => output` that SvelteKit applies per call. Since kit 2.35.

```js
/// file: weather.remote.js
export const getWeather = query.batch(v.string(), async (cityIds) => {
	const weather = await db.sql`SELECT * FROM weather WHERE city_id = ANY(${cityIds})`;
	const lookup = new Map(weather.map((w) => [w.city_id, w]));

	return (cityId) => lookup.get(cityId);
});
```

Now a `{#each}` over 50 cities issues one database call, and the call site is unchanged:

```svelte
{#each cities as city}
	<CityWeather weather={await getWeather(city.id)} />
{/each}
```

## query.live

Real-time data. The callback is normally an async generator; the client holds a streaming connection while the query is in use, and multiple instances share one connection.

```js
export const getTime = query.live(async function* () {
	while (true) {
		yield new Date();
		await new Promise((f) => setTimeout(f, 1000));
	}
});
```

During SSR, `await getTime()` takes the first yielded value, closes the iterator, and serializes that value for hydration.

```svelte
<p>{await time}</p>
<p>connected: {time.connected}</p>
<button onclick={() => time.reconnect()}>Reconnect</button>
```

Reconnection is passive (exponential backoff) plus active when `navigator.onLine` flips back to `true`. There is no `refresh()` — live queries update themselves.

For imperative access, the instance is itself async-iterable: `for await (const value of getTime())`. Consumers share the underlying connection, the first yield is the most recent value already received, and only the latest pending value is retained — **a live stream is not an event log**, so don't build an audit trail on it.

> **Service worker hazard:** never cache a live query response. The cloned response keeps streaming after the page closes. Exclude any response whose `Cache-Control` contains `no-store`.

## form

Takes a schema plus a handler, and returns an object you spread onto `<form>`.

```js
/// file: src/routes/blog/data.remote.js
import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { form } from '$app/server';

export const createPost = form(
	v.object({
		title: v.pipe(v.string(), v.nonEmpty()),
		content: v.pipe(v.string(), v.nonEmpty())
	}),
	async ({ title, content }) => {
		const user = await auth.getUser();
		if (!user) error(401, 'Unauthorized');

		const slug = title.toLowerCase().replace(/ /g, '-');
		await db.sql`INSERT INTO post (slug, title, content) VALUES (${slug}, ${title}, ${content})`;

		redirect(303, `/blog/${slug}`);
	}
);
```

```svelte
<form {...createPost}>
	<label>
		Title
		<input {...createPost.fields.title.as('text')} />
	</label>
	<button>Publish!</button>
</form>
```

The spread supplies `method` and `action` so the form submits and reloads without JavaScript, plus an [attachment](runes.md) that progressively enhances it when JavaScript is available.

### Fields

`.as(type)` returns the attributes for an input: the right `type`, the generated `name`, the repopulated `value`, and `aria-invalid`. Pass a second argument — `.as(type, value)` — to control the rendered value; this is **required** for `radio`, `submit` and `hidden` inputs, and for `checkbox` inputs representing one option in an array field. `file` inputs can't be populated this way.

Fields nest through objects and arrays, and hold strings, numbers, booleans or `File`s:

```svelte
<form {...createProfile} enctype="multipart/form-data">
	<input {...name.as('text')} />
	<input {...photo.as('file')} />
	<input {...info.height.as('number')} />
	<input {...info.likesDogs.as('checkbox')} />
	<input {...attributes[0].as('text')} />
</form>
```

`multiple` belongs in the **type string**, not on the element — the spread emits the attribute itself:

```svelte
<select {...survey.fields.os.as('select')}>...</select>
<select {...survey.fields.languages.as('select multiple')}>...</select>
<input {...createProfile.fields.photos.as('file multiple')} />
```

Two coercion rules worth internalising, because they surface as confusing validation failures:

- **Every boolean in a form schema must be optional.** An unchecked checkbox sends nothing, so `v.optional(v.boolean(), false)` — not `v.boolean()`. In Zod, `z.coerce.boolean<boolean>()`. The type signature enforces this and the error message says so.
- **Empty multi-selects are `undefined`, not `[]`.** Use `v.optional(v.array(...), [])`.

Under the hood boolean and number field names are prefixed `b:` and `n:` to drive coercion before validation. Generated names use JS object notation (`nested.array[0].value`); keys needing quotes aren't supported.

### Validation and issues

If the schema rejects, the handler never runs and each field's `issues()` returns `{ message }[]`:

```svelte
{#each createPost.fields.title.issues() as issue}
	<p class="issue">{issue.message}</p>
{/each}
```

`issues()` returns `undefined` when the field is valid or untested. `fields.allIssues()` collects every issue, including form-level ones.

Validate before submit with `createPost.validate()` — e.g. `oninput={() => createPost.validate()}`. Issues on controls the user hasn't touched are suppressed; override with `validate({ includeUntouched: true })`.

For client-side validation that blocks the request entirely, pass a **preflight** schema:

```svelte
<form {...createPost.preflight(schema)}>
```

> You cannot export a schema from a `.remote.ts` file. Put the shared schema in a normal module, or in a `<script module>` block in the component.

For failures you only discover while doing the work, throw `invalid` — it behaves like `redirect`/`error`, and `issue` gives you type-safe field targeting:

```js
import { invalid } from '@sveltejs/kit';

export const buyHotcakes = form(
	v.object({ qty: v.pipe(v.number(), v.minValue(1, 'buy at least one')) }),
	async (data, issue) => {
		try {
			await db.buy(data.qty);
		} catch (e) {
			if (e.code === 'OUT_OF_STOCK') invalid(issue.qty(`not enough hotcakes`));
		}
	}
);
```

Bare strings passed to `invalid` are form-level and appear only in `fields.allIssues()`.

### Reading and setting values

`fields.title.value()` tracks the live input value; `fields.value()` returns the whole object. Defaults passed via `.as('text', '...')` are **not** reflected in `value()` until the field is edited or submitted. Write with `fields.title.set(...)` or `fields.set({ title, content })`.

### Sensitive fields

On a non-enhanced submission, invalid data is echoed back so the user doesn't retype everything. **Prefix a field name with an underscore to keep it out of that response:**

```svelte
<input {...register.fields._password.as('password')} />
```

### Results, redirects, enhance

A returned value lands on `createPost.result` and is ephemeral — gone on resubmit, navigation or reload. An uncaught error renders the nearest `+error.svelte`.

```svelte
{#if createPost.result?.success}<p>Published!</p>{/if}
```

`enhance` customises submission:

```svelte
<form {...createPost.enhance(async (form) => {
	try {
		if (await form.submit()) {
			form.element.reset();
			showToast('Published!');
		} else {
			showToast('Invalid data!');
		}
	} catch {
		showToast('Something went wrong');
	}
})}>
```

The callback receives a copy of the form instance with everything except `enhance`; `form.submit()` runs the submission without re-entering the callback, and `form.element` is always defined. **With `enhance`, the form is not reset for you** — call `form.element.reset()`.

For a list of forms, `for(id)` isolates instances:

```svelte
{#each await getTodos() as todo}
	{const modify = modifyTodo.for(todo.id)}
	<form {...modify}>
		<input {...modify.fields.description.as('text', todo.description)} />
		<button disabled={!!modify.pending}>save</button>
	</form>
{/each}
```

Multiple submit buttons: add the button to the schema and bind with `as('submit', value)`.

```svelte
<button {...loginOrRegister.fields.action.as('submit', 'login')}>login</button>
<button {...loginOrRegister.fields.action.as('submit', 'register')}>register</button>
```

## command

Same job as `form`, callable from anywhere — but no graceful degradation, so reach for it only when there is no form.

```js
export const addLike = command(v.string(), async (id) => {
	await db.sql`UPDATE item SET likes = likes + 1 WHERE id = ${id}`;
});
```

```svelte
<button onclick={async () => { await addLike(item.id); }}>add like</button>
```

**Commands cannot be called during render**, and `redirect()` is unavailable inside them — return `{ redirect: location }` and handle it client-side if you must.

## Single-flight mutations

The default behaviours are both wrong for most apps: a successful `form` invalidates *every* query and load function (wasteful), while `command` invalidates *nothing* (stale UI). Either way the naive fix costs two round trips. Single-flight mutations refresh queries and ship the new values back **inside the mutation response**.

### Server-driven (preferred)

When the handler knows what changed, say so:

```js
export const createPost = form(schema, async (data) => {
	// ...

	// re-runs on the server, result rides back with the mutation.
	// safe to discard the promise — SvelteKit awaits it before responding
	void getPosts().refresh();

	redirect(303, `/blog/${slug}`);
});

export const updatePost = form(v.object({ id: v.string() }), async (post) => {
	const result = externalApi.update(post);

	// we already have the new value — no refetch needed
	getPost(post.id).set(result);
});
```

Queries are keyed by argument, so `getPost(post.id).set(...)` on the server finds the matching client instance.

### Client-requested

The server knows which query *functions* changed but not which *instances* are on screen — it can't guess that `getPosts({ filter: 'author:santa' })` is currently rendered. The client asks — `submit().updates(...)` inside `enhance`, `myCommand(arg).updates(...)` for a command:

```ts
await submit().updates(
	getPosts,                                                      // all active instances
	getPosts({ filter: 'author:santa' }),                          // one instance
	getPosts({ filter: 'author:santa' }).withOverride((posts) => [newPost, ...posts])  // + optimistic
);
```

…and the server must **explicitly accept** them:

```js
import { query, form, requested } from '$app/server';

export const createPost = form(schema, async (data) => {
	// ...
	for (const { arg, query } of requested(getPosts, 1)) {
		void query.refresh();
	}
	redirect(303, `/blog/${slug}`);
});

// shorthand for the loop above
await requested(getPosts, 1).refreshAll();
```

Each entry is `{ arg, query }`: `arg` is the argument *after* schema validation, `query` is bound to the client's original cache key. An argument that fails to parse errors that one query without failing the command.

> **`limit` is mandatory, and it is a security control.** The refresh list comes from the client — each entry makes the server validate an argument and usually re-fetch. Anyone can read your network tab and POST thousands of refreshes. `Infinity` is accepted but you are opting into the DoS. The same reasoning is why a command must name the queries it will refresh: otherwise every query's code would have to be bundled into every command's server bundle.

For live queries the equivalents are `.reconnect()` and `reconnectAll()` — useful when the mutation changes a cookie the stream needs to re-read:

```js
export const markAllRead = form(v.object({ userId: v.string() }), async ({ userId }) => {
	// ...
	getNotifications(userId).reconnect();
});
```

## prerender

Runs at build time. Use for data that changes at most once per redeployment; it lives on the CDN with your other static assets, and the browser keeps it in the [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) across reloads until a new deployment lands.

```js
export const getPost = prerender(
	v.string(),
	async (slug) => { /* ... */ },
	{
		inputs: () => ['first-post', 'second-post', 'third-post'],
		dynamic: true
	}
);
```

The crawler saves any call it finds while prerendering pages; `inputs` declares the rest. By default prerender functions are **excluded from the server bundle**, so an un-prerendered argument fails — `dynamic: true` keeps them callable at runtime.

This gives you partial prerendering: a dynamic page whose expensive, rarely-changing parts are still static.

## `getRequestEvent` inside remote functions

```js
import { getRequestEvent, query } from '$app/server';

export const getProfile = query(async () => {
	const user = await getUser();
	return user && { name: user.name, avatar: user.avatar };
});

// called from several places, runs once per request
const getUser = query(async () => {
	const { cookies } = getRequestEvent();
	return await findUser(cookies.get('session_id'));
});
```

Two differences from a normal `RequestEvent`, both easy to get wrong:

- **You cannot set headers.** Cookies are writable, and only inside `form` and `command`.
- **`route`, `params` and `url` describe the calling page, not the endpoint.** They are attacker-controllable, so **never authorize against them.** Queries also don't re-run on navigation unless their argument changed, so these values go stale.

In environments without `AsyncLocalStorage`, `getRequestEvent()` must be called synchronously — before any `await`.

## Gotchas

- Remote files may live anywhere under `src` **except `src/lib/server`**. Third-party libraries can ship them too.
- `redirect()` works in `query`, `form` and `prerender`; not in `command`.
- `query` is unusable on a fully prerendered page — use `prerender` functions instead.
- Tracing covers remote functions when `kit.experimental.tracing.server` is on; see [experimental.md](experimental.md).
