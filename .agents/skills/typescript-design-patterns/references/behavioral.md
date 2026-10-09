# Behavioral patterns

How responsibility is shared. This is where Svelte's reactivity has absorbed the most: Observer, Memento and Chain of Responsibility are framework features, and hand-rolling them costs SSR correctness.

## Observer

**Shipped.** Runes are a signals implementation — the subject/observer wiring is the runtime's job:

```svelte
<script lang="ts">
	let query = $state('');
	let results = $derived(items.filter((i) => i.name.includes(query)));
</script>
```

No `subscribe`, no observer list, no teardown. A class with `$state` fields carries this across components:

```ts
// cart.svelte.ts
export class Cart {
	items = $state<Array<{ id: string; price: number; qty: number }>>([]);
	total = $derived(this.items.reduce((sum, i) => sum + i.price * i.qty, 0));

	add(item: { id: string; price: number }) {
		const found = this.items.find((i) => i.id === item.id);
		if (found) found.qty += 1;
		else this.items.push({ ...item, qty: 1 });
	}
}
```

Hand out one instance through `createContext` so it is request-scoped — see [creational.md](creational.md#singleton).

**Bridging an external source.** When the thing to observe lives outside Svelte — a `WebSocket`, an `IntersectionObserver`, a media query — `createSubscriber` turns it into a reactive read without an effect at each call site:

```ts
// connection.svelte.ts
import { createSubscriber } from 'svelte/reactivity';
import { on } from 'svelte/events';

export class Connection {
	#socket: WebSocket;
	#subscribe: () => void;
	#last: string | null = null;

	constructor(url: string) {
		this.#socket = new WebSocket(url);
		this.#subscribe = createSubscriber((update) => {
			const off = on(this.#socket, 'message', (event: MessageEvent) => {
				this.#last = event.data;
				update();
			});
			return () => off();
		});
	}

	get message() {
		this.#subscribe();
		return this.#last;
	}
}
```

The listener starts when the first effect reads `message` and stops when the last one is destroyed — reference counting you would otherwise write by hand. `svelte/reactivity` already ships `MediaQuery` on exactly this mechanism.

Stores are the Svelte 4 form of this pattern. `svelte/store` stays useful for RxJS-style interop; for state you own, a class with `$state` fields is less machinery.

## State

**Earns its keep** past about three states. Model the states as a discriminated union so impossible combinations cannot be represented:

```ts
type Upload =
	| { status: 'idle' }
	| { status: 'uploading'; progress: number }
	| { status: 'done'; url: string }
	| { status: 'failed'; error: string };
```

Nothing can be `uploading` and carry a `url`, and every consumer must narrow before reading. Pair it with a transition table when the legal moves matter:

```ts
const transitions = {
	idle: ['uploading'],
	uploading: ['done', 'failed'],
	done: [],
	failed: ['uploading']
} as const satisfies Record<Upload['status'], readonly Upload['status'][]>;
```

In a component the union drives both behaviour and markup:

```svelte
<script lang="ts">
	let upload = $state<Upload>({ status: 'idle' });
	let canRetry = $derived(upload.status === 'failed');
</script>

{#if upload.status === 'uploading'}
	<progress value={upload.progress} max="100"></progress>
{:else if upload.status === 'failed'}
	<p>{upload.error}</p>
{/if}
```

The GoF version — one class per state, each with the full method set — earns its keep only when states carry substantial distinct behaviour. A union plus `switch` covers the rest, and the compiler checks you handled every case.

## Strategy

**Dissolved.** Functions are values, so a strategy is a prop:

```svelte
<script lang="ts">
	let { compare = (a: Row, b: Row) => a.name.localeCompare(b.name) } = $props();
	let sorted = $derived([...rows].sort(compare));
</script>
```

When the variation is *markup* rather than logic, the strategy is a typed snippet:

```svelte
<!-- List.svelte -->
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	let { items, row }: { items: T[]; row: Snippet<[T]> } = $props();
</script>

<ul>
	{#each items as item, i (i)}
		<li>{@render row(item)}</li>
	{/each}
</ul>
```

```svelte
<List items={users}>
	{#snippet row(user)}
		<strong>{user.name}</strong>
	{/snippet}
</List>
```

`generics="T"` ties the snippet's parameter to the item type, so the caller's `user` is fully typed. A named set of strategies is a `Record` keyed by a union — the same registry as [Abstract Factory](creational.md#abstract-factory).

## Command

**Earns its keep** for undo, and dissolves everywhere else. A command that is only ever executed once is a closure:

```ts
const onSave = () => save(draft); // not a SaveCommand class
```

Reversibility is what justifies the object, because you need the inverse stored alongside the action:

```ts
// history.svelte.ts
export type Command = { do(): void; undo(): void };

export class History {
	#done = $state<Command[]>([]);
	#undone = $state<Command[]>([]);

	canUndo = $derived(this.#done.length > 0);
	canRedo = $derived(this.#undone.length > 0);

	run(command: Command) {
		command.do();
		this.#done.push(command);
		this.#undone = [];
	}

	undo() {
		const command = this.#done.pop();
		if (!command) return;
		command.undo();
		this.#undone.push(command);
	}

	redo() {
		const command = this.#undone.pop();
		if (!command) return;
		command.do();
		this.#done.push(command);
	}
}
```

Note `this.#undone = []` on a new command — the standard redo-invalidation step that hand-rolled stacks forget.

## Chain of Responsibility

**Shipped.** `sequence` composes `handle` hooks into a middleware chain:

```ts
// hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';

const authenticate: Handle = async ({ event, resolve }) => {
	event.locals.user = await lookup(event.cookies.get('session'));
	return resolve(event);
};

const authorize: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/admin') && !event.locals.user?.isAdmin) {
		error(403, 'Forbidden');
	}
	return resolve(event);
};

export const handle = sequence(authenticate, authorize);
```

Each handler chooses whether to pass control on, which is the pattern exactly. Ordering is not uniform across the options: `transformPageChunk` applies in **reverse** order and merges, while `preload` and `filterSerializedResponseHeaders` take the first definition and ignore later ones.

In plain TypeScript, a chain is a reduce over handlers rather than a linked list of `setNext` calls:

```ts
type Middleware<T> = (input: T, next: (input: T) => T) => T;

export const chain = <T>(...steps: Middleware<T>[]) =>
	steps.reduceRight<(input: T) => T>(
		(next, step) => (input) => step(input, next),
		(input) => input
	);
```

## Memento

**Shipped**, three ways, by lifetime.

Within a session, `$state.snapshot` detaches a plain copy from the proxy:

```ts
const checkpoint = $state.snapshot(document);
```

Across a navigation, export `snapshot` from a page or layout and SvelteKit ties it to the history entry:

```svelte
<script lang="ts">
	let comment = $state('');

	export const snapshot = {
		capture: () => comment,
		restore: (value: string) => (comment = value)
	};
</script>
```

The value must be JSON-serialisable — it goes to `sessionStorage` — and stays in memory for the session, so keep it small.

Across the server/client boundary, the `transport` hook restores class instances that JSON alone would flatten:

```ts
// hooks.ts
import { Vector } from '$lib/math';

export const transport = {
	Vector: {
		encode: (value: unknown) => value instanceof Vector && [value.x, value.y],
		decode: ([x, y]: [number, number]) => new Vector(x, y)
	}
};
```

Without it, a class returned from `load` arrives on the client as a plain object with its methods gone.

## Mediator

**Dissolved.** The mediator is one class holding the shared state, handed out through context; components talk to it instead of to each other:

```ts
// wizard.svelte.ts
import { createContext } from 'svelte';

export class Wizard {
	step = $state(0);
	answers = $state<Record<string, string>>({});

	next = () => (this.step += 1);
	back = () => (this.step = Math.max(0, this.step - 1));
}

export const [getWizard, setWizard] = createContext<Wizard>();
```

A global event bus is the tempting alternative and the wrong one: it is process-scoped like any module state, so on the server one user's events reach another's render, and the emitter/listener pair is invisible to the type system.

For a parent that only needs to hear about one thing, a callback prop is lighter still — `onselect`, `onchange`. Reserve the mediator for genuinely many-to-many coordination.

## Template Method

**Dissolved.** The fixed skeleton with variable steps is a component rendering snippets:

```svelte
<!-- DataTable.svelte -->
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	let {
		rows,
		header,
		row,
		empty
	}: {
		rows: T[];
		header: Snippet;
		row: Snippet<[T]>;
		empty?: Snippet;
	} = $props();
</script>

{#if rows.length === 0}
	{@render empty?.()}
{:else}
	<table>
		<thead>{@render header()}</thead>
		<tbody>
			{#each rows as r, i (i)}{@render row(r)}{/each}
		</tbody>
	</table>
{/if}
```

The skeleton is fixed; `header`, `row` and the optional `empty` are the overridable steps — composition rather than inheritance, and the optional step is `Snippet | undefined` rather than an empty base method.

At route level, `+layout.svelte` is the same pattern: the layout fixes the shell and `{@render children()}` is the hole each page fills.

## Iterator

**Dissolved.** Generators and `Symbol.iterator` are the language's version:

```ts
export class Playlist {
	#tracks: Track[] = [];

	*[Symbol.iterator]() {
		yield* this.#tracks;
	}

	*shuffled() {
		yield* [...this.#tracks].sort(() => Math.random() - 0.5);
	}
}

for (const track of playlist) { /* ... */ }
```

Any object with `[Symbol.iterator]` works in `for...of`, spread, destructuring and `{#each}` — no `hasNext`/`next` interface to write.

Generators are lazy and single-use. `{#each}` needs a materialised list, so spread first (`{#each [...playlist] as track}`) rather than iterating the generator in the template.

## Visitor

**Dissolved.** Double dispatch exists to work around single-dispatch languages. A discriminated union plus an exhaustive `switch` does the same job and *checks* it:

```ts
type Shape =
	| { kind: 'circle'; radius: number }
	| { kind: 'rect'; width: number; height: number };

export function area(shape: Shape): number {
	switch (shape.kind) {
		case 'circle':
			return Math.PI * shape.radius ** 2;
		case 'rect':
			return shape.width * shape.height;
		default: {
			const never: never = shape;
			return never;
		}
	}
}
```

Add a variant to `Shape` and every `switch` missing a case fails to compile — the guarantee GoF's `accept`/`visit` pair only approximates.

The tradeoff is the classic one, inverted: unions make adding *operations* free and adding *variants* a compile error everywhere; class hierarchies make adding *variants* free and adding *operations* invasive. For the closed sets typical of UI code — statuses, node types, message kinds — the union is the better trade, and the compile errors are the feature.
