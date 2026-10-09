# Creational patterns

How objects get made. Four of the five dissolve into a function or an object literal; the fifth, Singleton, is the one place where a literal GoF port causes a security bug.

## Singleton

**Shipped, with a trap.** Svelte gives you two singletons with different lifetimes, and picking the wrong one leaks data between users.

A module is already a singleton — it is evaluated once and cached. So the GoF `static #instance` dance buys nothing:

```ts
// theme.svelte.ts
class Theme {
	mode = $state<'light' | 'dark'>('light');
	toggle = () => {
		this.mode = this.mode === 'light' ? 'dark' : 'light';
	};
}

export const theme = new Theme();
```

That instance is **process-scoped**. In the browser a process serves one user and this is exactly right. On a server one process serves everyone, so the instance outlives the request and is shared by every visitor concurrently. Assign per-user data to it during SSR and the next visitor reads it:

```svelte
<script lang="ts">
	import { session } from './session.svelte.ts';
	let { data } = $props();

	// Leaks: runs during SSR, writes to a process-scoped object
	session.user = data.user;
</script>
```

For anything derived from the request, use **request-scoped** state instead. Context attaches to the component tree, and the server builds a fresh tree per request:

```ts
// session.ts
import { createContext } from 'svelte';

export type User = { name: string };

export class Session {
	#user: () => User | null;

	constructor(user: () => User | null) {
		this.#user = user;
	}

	get user() {
		return this.#user();
	}
}

export const [getSession, setSession] = createContext<Session>();
```

```svelte
<!-- +layout.svelte -->
<script lang="ts">
	import { Session, setSession } from './session.ts';

	let { data, children } = $props();
	setSession(new Session(() => data.user));
</script>

{@render children()}
```

```svelte
<!-- any descendant -->
<script lang="ts">
	import { getSession } from './session.ts';

	const session = getSession();
</script>

<p>{session.user?.name ?? 'signed out'}</p>
```

`createContext` (5.40+) returns a typed `[get, set]` tuple, so there is no string key to collide and no cast on the way out.

Two details carry the correctness here:

- **The constructor takes `() => data.user`, not `data.user`.** Passing the value captures it once, and the session then keeps the first navigation's user forever. Passing a function keeps the read live, which is why the framework's own context examples are written this way.
- **This file needs no runes**, so it is `session.ts` rather than `session.svelte.ts` — reactivity arrives through the getter closing over a prop. Rename it only when you add a `$state` field of genuinely local state.

**Choosing between them:**

| State | Scope | Home |
|---|---|---|
| Theme, sidebar open, client-only preferences | Process | A module instance in `.svelte.ts` |
| Session, current user, tenant, request-derived data | Request | `createContext`, set in a layout |
| A database client or connection pool | Process, server | A server-only module — deliberately shared, never per-user |

The last row is the case where a process-scoped singleton is the *point*: a pool exists to be shared. Keep it in a server-only module so it can never reach the client bundle.

**Setting up effects outside a component.** A module-level class has no lifecycle to hang an `$effect` on, so it needs its own root and an explicit teardown:

```ts
// clock.svelte.ts
export class Clock {
	now = $state(new Date());
	#destroy: () => void;

	constructor() {
		this.#destroy = $effect.root(() => {
			const id = setInterval(() => (this.now = new Date()), 1000);
			return () => clearInterval(id);
		});
	}

	destroy() {
		this.#destroy();
	}
}
```

Without `$effect.root` the effect throws, because there is no parent effect to own it. Nothing calls `destroy` for you.

## Factory Method

**Dissolved.** GoF defers instantiation to a subclass because Java has no first-class functions. TypeScript does, so the factory is a function and the "product hierarchy" is a discriminated union:

```ts
type Notification =
	| { kind: 'toast'; message: string; duration: number }
	| { kind: 'banner'; message: string; dismissible: boolean };

export function notify(kind: Notification['kind'], message: string): Notification {
	return kind === 'toast'
		? { kind, message, duration: 4000 }
		: { kind, message, dismissible: true };
}
```

The union gives you what the class hierarchy gave you — a closed set of products — plus exhaustiveness checking at every consumer. See the **typescript** skill for the `never` check that enforces it.

The pattern only re-earns its name when the caller picks the product at runtime from data, which is Abstract Factory below.

## Abstract Factory

**Earns its keep**, in registry form. When a family of related things is selected by a runtime key, a `Record` keyed by a union is the whole pattern:

```ts
import type { Component } from 'svelte';
import TextField from './TextField.svelte';
import Checkbox from './Checkbox.svelte';
import DatePicker from './DatePicker.svelte';

export type FieldKind = 'text' | 'checkbox' | 'date';

export const fields = {
	text: TextField,
	checkbox: Checkbox,
	date: DatePicker
} as const satisfies Record<FieldKind, Component<{ name: string }>>;
```

```svelte
<script lang="ts">
	import { fields, type FieldKind } from './fields.ts';

	let { kind, name }: { kind: FieldKind; name: string } = $props();

	const Field = $derived(fields[kind]);
</script>

<Field {name} />
```

`satisfies` checks every member against the shared shape while keeping the literal keys, so adding a `FieldKind` without adding a component is a compile error. A capitalised `const` renders as a component — `<svelte:component>` is gone.

The classical version — an `AbstractFactory` interface with a concrete class per family — earns its keep when a family member needs construction logic rather than a static reference. Keep the registry; make its values functions.

## Builder

**Dissolved.** Optional-heavy construction is an options object with defaults:

```ts
type ChartOptions = {
	data: number[];
	width?: number;
	height?: number;
	animate?: boolean;
};

export function chart({ data, width = 640, height = 400, animate = true }: ChartOptions) {
	// ...
}
```

The fluent `.setWidth().setHeight().build()` chain exists because Java lacks named and default arguments. It re-earns its keep on two conditions only: steps must happen in order, or an intermediate result feeds the next step. A query builder is the honest example — `where` before `orderBy` before `limit`, each returning a narrowed type.

## Prototype

**Dissolved.** Copying is a language feature:

```ts
const draft = { ...template, id: crypto.randomUUID() };  // shallow
const deep = structuredClone(template);                   // deep
```

Reactive state needs one extra step. A `$state` proxy is not structured-cloneable, so unwrap it first:

```ts
const copy = structuredClone($state.snapshot(config));
```

`$state.snapshot` also runs `toJSON` when the value defines one. Reach for it whenever reactive state crosses into a library, `structuredClone`, `JSON.stringify` or an IndexedDB write — all of which choke on or silently mis-serialise the proxy.
