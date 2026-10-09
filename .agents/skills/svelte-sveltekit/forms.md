---
title: "Forms"
summary: "Form actions, fail() validation errors, use:enhance and applyAction, custom submit handlers, file uploads, optimistic UI, and typing — plus when to use remote form functions instead."
verified_against: "@sveltejs/kit 2.70.2"
mcp_sections: ["kit/form-actions", "kit/$app-forms", "kit/remote-functions"]
---

# Forms

Two mechanisms, both progressively enhanced:

- **Form actions** — `export const actions` in `+page.server.ts`, posted to by a `<form>`. Stable, the default choice.
- **[Remote `form` functions](remote-functions.md)** — schema-first, callable from any component, with typed fields and built-in validation. Experimental (kit 2.27+), and the direction of travel.

This page covers form actions. Reach for a remote `form` when you want schema-driven validation, forms that live outside the route that handles them, or single-flight mutations.

## Actions

```js
/// file: src/routes/login/+page.server.js
/** @satisfies {import('./$types').Actions} */
export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const email = data.get('email');
		// ...
	}
};
```

```svelte
<form method="POST">
	<input name="email" type="email" />
	<button>Log in</button>
</form>
```

**Actions are always `POST`** — `use:enhance` errors on `method="GET"` or on a form pointing at a `+server.js` endpoint.

### Named actions

```js
export const actions = {
	login: async (event) => { /* ... */ },
	register: async (event) => { /* ... */ }
};
```

```svelte
<form method="POST" action="?/login">
	<button>Log in</button>
	<button formaction="?/register">Register</button>
</form>
```

From another route, prefix the path: `action="/login?/register"`.

**You cannot mix a `default` action with named actions.** POSTing to a named action without redirecting leaves the query parameter in the URL, so the next default POST would hit the old named action.

### Return values

The return value becomes the `form` prop on the page, and `page.form` app-wide, until the next update. It's ephemeral — a reload clears it.

```svelte
<script>
	/** @type {import('./$types').PageProps} */
	let { data, form } = $props();
</script>

{#if form?.success}<p>Welcome back, {data.user.name}</p>{/if}
```

The value must be JSON-serializable. With several forms on a page, tag the result (`{ id: 'login', ... }`) so each knows which result is its own.

### Validation errors with `fail`

```js
import { fail } from '@sveltejs/kit';

export const actions = {
	login: async ({ cookies, request }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

		if (!email) return fail(400, { email, missing: true });

		const user = await db.getUser(email);
		if (!user || user.password !== db.hash(password)) {
			return fail(400, { email, incorrect: true });
		}

		cookies.set('sessionid', await db.createSession(user), { path: '/' });
		return { success: true };
	}
};
```

```svelte
<form method="POST" action="?/login">
	{#if form?.missing}<p class="error">Email is required</p>{/if}
	{#if form?.incorrect}<p class="error">Invalid credentials</p>{/if}

	<input name="email" type="email" value={form?.email ?? ''} />
	<input name="password" type="password" />
	<button>Log in</button>
</form>
```

`fail` sets `page.status` and puts the data on `form`. **Send back the email, never the password** — anything you return is rendered into the page.

Use `fail` for invalid input. Use `error` for genuine failures — it renders the error page and loses the user's input.

### Redirects and errors

Same as in `load`, and in **SvelteKit 2 you don't `throw` them**:

```js
import { fail, redirect } from '@sveltejs/kit';

if (url.searchParams.has('redirectTo')) {
	redirect(303, url.searchParams.get('redirectTo'));
}
```

### Cookies and `locals`

`handle` runs **before** the action and does **not** re-run before the subsequent `load`. So if `handle` populates `event.locals` from a cookie, an action that changes that cookie must update `locals` itself:

```js
export const actions = {
	logout: async (event) => {
		event.cookies.delete('sessionid', { path: '/' });
		event.locals.user = null;   // otherwise the reloaded page still shows a user
	}
};
```

In kit 2, `cookies.set/delete/serialize` **require an explicit `path`** — usually `path: '/'`.

## Progressive enhancement

### `use:enhance`

`enhance` is an **action**, applied with `use:` — not a function you call to build one:

```svelte
<script>
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<form method="POST" use:enhance>
```

Bare `use:enhance` reproduces native behaviour minus the full reload: updates `form`, `page.form` and `page.status`; resets the `<form>`; calls `invalidateAll()` on success; follows redirects; renders the nearest `+error` on failure; and resets focus.

`form` and `page.form` update **only when the action lives on the page you submitted from**. For a cross-page `action="/somewhere/else"`, use `applyAction`.

### Customising

Pass a `SubmitFunction`. It runs before submission and may return a callback that receives the `ActionResult`:

```svelte
<script>
	import { enhance } from '$app/forms';

	let submitting = $state(false);
</script>

<form
	method="POST"
	use:enhance={({ formElement, formData, action, cancel, submitter }) => {
		submitting = true;

		return async ({ result, update }) => {
			submitting = false;
			await update();          // run the default behaviour
		};
	}}
>
	<button disabled={submitting}>{submitting ? 'Sending…' : 'Submit'}</button>
</form>
```

**Returning a callback overrides the default post-submission behaviour.** Get it back with `update({ reset: false, invalidateAll: false })`, or with `applyAction(result)`:

```svelte
use:enhance={() => async ({ result }) => {
	if (result.type === 'redirect') goto(result.location);
	else await applyAction(result);
}}
```

`applyAction` by `result.type`:

- `success` / `failure` — set `page.status`, update `form` and `page.form` **regardless of which page you submitted from** (this is the difference from `update`)
- `redirect` — `goto(result.location, { invalidateAll: true })`
- `error` — render the nearest `+error` boundary

### Hand-rolled submit handler

```svelte
<script>
	import { invalidateAll } from '$app/navigation';
	import { applyAction, deserialize } from '$app/forms';

	async function handleSubmit(event) {
		event.preventDefault();
		const data = new FormData(event.currentTarget, event.submitter);

		const response = await fetch(event.currentTarget.action, { method: 'POST', body: data });
		const result = deserialize(await response.text());

		if (result.type === 'success') await invalidateAll();
		applyAction(result);
	}
</script>

<form method="POST" onsubmit={handleSubmit}>…</form>
```

**`JSON.parse` is not enough** — actions can return `Date` and `BigInt`, so use `deserialize` from `$app/forms`.

If a `+server.js` sits alongside your `+page.server.js`, `fetch` routes there by default. Add the `x-sveltekit-action: 'true'` header to reach the action instead.

## `GET` forms

A form with `method="GET"` (or no method) is treated like an `<a>` — client-side navigation, load functions run, **no action is invoked**. This is what search inputs want:

```html
<form action="/search">
	<input name="q" />
</form>
```

The `data-sveltekit-*` link attributes work on these forms too.

## File uploads

```svelte
<form method="POST" enctype="multipart/form-data" use:enhance>
	<input type="file" name="avatar" accept="image/*" />
	<button>Upload</button>
</form>
```

```js
export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const file = data.get('avatar');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { missing: true });
		}
		if (file.size > 5_000_000) return fail(400, { tooLarge: true });

		await storage.put(file.name, Buffer.from(await file.arrayBuffer()));
		return { success: true };
	}
};
```

**A form containing `<input type="file">` must set `enctype="multipart/form-data"`.** Without it a non-JS submission silently drops the file — kit 2 throws during a `use:enhance` submission to stop you shipping that bug.

For upload progress you need `XMLHttpRequest`; `fetch` can't report it.

## Optimistic UI

Apply the change immediately, roll back if the server disagrees:

```svelte
<script>
	import { enhance } from '$app/forms';

	let { data } = $props();
	let optimistic = $state([]);

	let items = $derived([...data.items, ...optimistic]);
</script>

<form
	method="POST"
	action="?/add"
	use:enhance={({ formData }) => {
		const pending = { id: crypto.randomUUID(), text: formData.get('text'), pending: true };
		optimistic.push(pending);

		return async ({ result, update }) => {
			optimistic = optimistic.filter((i) => i !== pending);
			if (result.type === 'error') showToast('Failed to add');
			await update();
		};
	}}
>
	<input name="text" />
</form>

{#each items as item}
	<div class:pending={item.pending}>{item.text}</div>
{/each}
```

Keep pending items in a separate array and derive the merged list — that way `invalidateAll()` replacing `data.items` can't fight your local state.

Remote functions give you this with `withOverride` and a single round trip; see [remote-functions.md](remote-functions.md).

## Validation

Validate on the server always, on the client optionally.

```js
import * as v from 'valibot';
import { fail } from '@sveltejs/kit';

const schema = v.object({
	email: v.pipe(v.string(), v.email('Enter a valid email')),
	age: v.pipe(v.number(), v.minValue(18, 'Must be 18 or older'))
});

export const actions = {
	default: async ({ request }) => {
		const raw = Object.fromEntries(await request.formData());
		const result = v.safeParse(schema, { ...raw, age: Number(raw.age) });

		if (!result.success) {
			return fail(400, {
				values: { email: raw.email },
				errors: v.flatten(result.issues).nested
			});
		}

		// result.output is typed
	}
};
```

Note the manual `Number(raw.age)` — `FormData` values are always strings, and unchecked checkboxes are absent entirely. Remote `form` functions handle both coercions for you.

Client-side, native constraints (`required`, `type="email"`, `minlength`, `pattern`) cost nothing and work without JavaScript. Treat them as UX, never as validation.

## TypeScript

```ts
/// file: +page.server.ts
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ items: await db.items() });

export const actions = {
	create: async ({ request }) => {
		// ...
		return { success: true as const };
	}
} satisfies Actions;
```

`satisfies Actions` (rather than `: Actions`) preserves each action's specific return type, so `form` is narrowed properly in the component:

```svelte
<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>
```

## Pitfalls

- Missing `name` on an input — it never reaches `FormData`.
- Expecting `form` to survive a reload; it's ephemeral by design. Persist to the URL or the database if it must last.
- Using `error()` where `fail()` belongs, throwing away everything the user typed.
- Forgetting `path` when setting cookies (required in kit 2).
- Forgetting to update `event.locals` after an action changes the session cookie.
- `use:enhance` on a `GET` form, or on one posting to `+server.js` — both error.
- In kit 2, `form` and `data` were removed from `use:enhance` callbacks; use `formElement` and `formData`.
