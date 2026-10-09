# Structural patterns

How objects are composed. Structural typing removes the need for most of the wrapper classes; the two that survive survive as framework features.

## Adapter

**Dissolved.** GoF wraps an incompatible object in a class because the type system demands a nominal match. TypeScript matches structurally, so the adapter is the mapping function itself:

```ts
type ApiUser = { user_id: number; display_name: string; avatar_url: string | null };
type User = { id: string; name: string; avatar?: string };

export const toUser = (raw: ApiUser): User => ({
	id: String(raw.user_id),
	name: raw.display_name,
	avatar: raw.avatar_url ?? undefined
});
```

When the boundary is untrusted — an HTTP response, `localStorage`, a webhook — validate rather than assert. A schema parses and types in one step, so the adapter cannot drift from the type it claims to produce:

```ts
import * as v from 'valibot';

const ApiUser = v.object({
	user_id: v.number(),
	display_name: v.string(),
	avatar_url: v.nullable(v.string())
});

export function toUser(raw: unknown): User {
	const parsed = v.parse(ApiUser, raw);
	return { id: String(parsed.user_id), name: parsed.display_name, avatar: parsed.avatar_url ?? undefined };
}
```

A hand-written `as ApiUser` is the failure mode here: it silences the compiler at exactly the point where the data is least trustworthy.

## Bridge

**Dissolved.** Abstraction and implementation vary independently through an injected object plus generics — no parallel class hierarchy:

```ts
export interface Storage {
	read(key: string): Promise<string | null>;
	write(key: string, value: string): Promise<void>;
}

export class Preferences {
	constructor(private storage: Storage) {}

	async load<T>(key: string, fallback: T): Promise<T> {
		const raw = await this.storage.read(key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	}
}
```

Swap `Storage` for a local, remote or in-memory implementation and `Preferences` never changes. SvelteKit's adapters are the same idea at framework scale: one build, many deployment targets, selected in config.

## Composite

**Dissolved.** A part-whole tree is a component that imports itself:

```svelte
<!-- TreeNode.svelte -->
<script lang="ts">
	import Self from './TreeNode.svelte';

	type Node = { label: string; children?: Node[] };
	let { node }: { node: Node } = $props();
</script>

<li>
	{node.label}
	{#if node.children?.length}
		<ul>
			{#each node.children as child (child.label)}
				<Self node={child} />
			{/each}
		</ul>
	{/if}
</li>
```

`<svelte:self>` is legacy — a plain self-import is the current form. When the recursion is markup rather than a component, a snippet can call itself in the same way.

Keyed `{#each}` matters more here than elsewhere: an unkeyed recursive list rebuilds whole subtrees on every reorder.

## Decorator

**Shipped**, in two forms depending on what you are adding.

Adding *behaviour* to an element is an attachment. Attachments take reactive arguments, stack freely on one element, and return their own teardown:

```ts
// tooltip.ts
import type { Attachment } from 'svelte/attachments';

export function tooltip(text: () => string): Attachment<HTMLElement> {
	return (node) => {
		const show = () => (node.dataset.tooltip = text());
		node.addEventListener('mouseenter', show);
		return () => node.removeEventListener('mouseenter', show);
	};
}
```

```svelte
<button {@attach tooltip(() => label)} {@attach trackClicks()}>Save</button>
```

Two decorators, one element, each cleaning up after itself. `use:` actions are the previous generation of this seam — they take no reactive argument and do not spread; `fromAction` adapts a library action that still ships as one.

Adding *markup* is a wrapper component that renders `children`:

```svelte
<!-- Card.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section>
	<h2>{title}</h2>
	{@render children()}
</section>
```

Wrappers nest, which is the stacking property the pattern is named for.

## Facade

**Dissolved.** A facade is a module. Export the few functions callers need and keep the rest unexported:

```ts
// payments.ts
import { createClient } from './vendor-sdk.ts';
import { retry } from './retry.ts';

const client = createClient(/* ... */);

export async function charge(amount: number, token: string) {
	return retry(() => client.payments.create({ amount, source: token }));
}

export async function refund(id: string) {
	return retry(() => client.refunds.create({ payment: id }));
}
```

No `PaymentsFacade` class, no instance to thread around. Module privacy is the encapsulation the pattern wants.

On the server, name the file `*.server.ts` or place it under a server-only directory so a stray client import fails at build time rather than shipping the SDK and its credentials to the browser.

## Flyweight

**Dissolved.** Interning is a `Map`:

```ts
const cache = new Map<string, Intl.NumberFormat>();

export function formatter(locale: string, currency: string) {
	const key = `${locale}:${currency}`;
	let f = cache.get(key);
	if (!f) {
		f = new Intl.NumberFormat(locale, { style: 'currency', currency });
		cache.set(key, f);
	}
	return f;
}
```

Two Svelte-specific notes:

- **Use `$state.raw` for large collections you replace rather than mutate.** Deep proxying costs per property; raw state skips it and can still *contain* reactive objects. API responses are the usual case.
- **`SvelteMap` and `SvelteSet` are shallow.** Membership and `size` are reactive; the values inside are not. A reactive cache of mutable entries needs `$state` on the entries as well.

A cache in a module is process-scoped, so on the server it is shared across users. That is correct for locale-keyed formatters and wrong for anything keyed by user.

## Proxy

**Shipped.** `$state` is implemented with `Proxy` — that is how mutation triggers granular updates:

```ts
let todos = $state([{ done: false, text: 'write it down' }]);
todos[0].done = true; // tracked
```

The GoF variants map onto features rather than wrappers:

| Variant | Reach for |
|---|---|
| Lazy loading | `$derived`, which computes on read and caches |
| Access logging | `$inspect(value)` in development |
| Remote proxy | A remote function or a `+server.ts` endpoint |
| Caching proxy | The `Map` above |

Writing your own `Proxy` over reactive state fights the runtime. If you genuinely need custom traps, wrap the object **before** passing it to `$state`, never after.
