# SvelteKit — `runed/kit`

Runed has a second entry point that exists purely because of SvelteKit coupling.

## Why it is separate

`runed/kit` exports exactly three things — `useSearchParams`, `validateSearchParams` and `createSearchParamsSchema` — and its source imports `$app/state`, `$app/navigation` and `$app/environment`. Those are virtual modules the SvelteKit Vite plugin supplies, so the import resolves **only inside a SvelteKit app**. A plain Svelte + Vite project cannot use it, which is why it is not in the root barrel.

```ts
import { useSearchParams } from "runed/kit";   // ✅
import { useSearchParams } from "runed";       // ❌ not exported
```

`@sveltejs/kit ^2.21.0` is an *optional* peer dependency — install-time silence, build-time failure if you reach for this entry point without it. The `$app/state` dependency is what sets the `2.21` floor.

## useSearchParams

Reactive, schema-validated URL search params. Reading a property parses and validates; assigning one rewrites the URL.

```ts
// schemas.ts
import { z } from "zod";

export const productSearchSchema = z.object({
  page: z.coerce.number().default(1),
  filter: z.string().default(""),
  sort: z.enum(["newest", "oldest", "price"]).default("newest"),
});
```

```svelte
<script lang="ts">
  import { useSearchParams } from "runed/kit";
  import { productSearchSchema } from "./schemas";

  const params = useSearchParams(productSearchSchema);

  const page = $derived(params.page);   // number, defaults to 1
</script>

<input bind:value={params.filter} />
<button onclick={() => params.update({ page: 3, sort: "oldest" })}>Go</button>
```

Methods: `update(partial)` (one URL write for many params — cheaper than assigning each), `reset(showDefaults?)`, `toURLSearchParams()`.

Options:

| Option | Default | Effect |
|---|---|---|
| `showDefaults` | `false` | Keep params equal to their default in the URL |
| `debounce` | `0` | Delay URL writes — use it for anything bound to a text input |
| `pushHistory` | `true` | `false` replaces instead of pushing a history entry |
| `compress` | `false` | lz-string everything into one param |
| `compressedParamName` | `"_data"` | Rename that param to avoid a schema collision |
| `updateURL` | `true` | `false` keeps params in memory only (disables `compress`) |
| `noScroll` | `false` | Preserve scroll position across URL writes |
| `dateFormats` | — | Per-field `"date"` (`YYYY-MM-DD`) or `"datetime"` (ISO8601) |

Bind an input directly and you get a history entry per keystroke. **Set both `debounce` and `pushHistory: false` for text inputs**, and `noScroll: true` for anything below the fold.

### Top-level reactivity only

Assignment to a top-level key is what triggers a URL write. Mutating inside a value does nothing:

```ts
params.page = 2;                                  // ✅
params.config = { ...params.config, theme: "d" }; // ✅
params.items = [...params.items, item];           // ✅

params.config.theme = "dark";                     // ❌ no URL update
params.items.push(item);                          // ❌
params.items[0].name = "x";                       // ❌
delete params.config.old;                         // ❌
```

This is a deliberate design trade, not a bug to work around — reassign the whole value.

## Schemas

Any [Standard Schema](https://standardschema.dev) validator works: Zod, Valibot, Arktype. Defaults in the schema become the defaults for missing params.

```ts
// Valibot
v.object({ page: v.optional(v.fallback(v.number(), 1), 1) });

// Arktype
type({ page: "number = 1", sort: '"newest" | "oldest" = "newest"' });
```

`createSearchParamsSchema` avoids a validator dependency entirely:

```ts
import { createSearchParamsSchema } from "runed/kit";

const schema = createSearchParamsSchema({
  page:      { type: "number", default: 1 },
  tags:      { type: "array",  default: ["new"], arrayType: "" },
  config:    { type: "object", default: { theme: "light" }, objectType: { theme: "" } },
  eventDate: { type: "date",   default: new Date(), dateFormat: "date" },
});
```

It handles type conversion and defaults, and nothing else — no item validation inside arrays, no nested object validation, no refinements. Move to a real validator the moment you need any of those.

URL storage format: primitives directly (`?page=2`), arrays and objects as JSON (`?tags=["sale"]`), dates as ISO8601 or `YYYY-MM-DD` under `dateFormat: "date"`.

Zod v4.1+ **codecs** give full control over serialisation, and `validateSearchParams` applies them automatically on the server:

```ts
const unixTimestamp = z.codec(z.coerce.number(), z.date(), {
  decode: (ts) => new Date(ts * 1000),
  encode: (d) => Math.floor(d.getTime() / 1000),
});

const schema = z.object({ createdAfter: unixTimestamp.optional() });
```

Codec support arrived in `0.36.0`, alongside `Date` support and a fix for treating comma-separated strings as arrays when the field is not typed as one. `zod ^4.1.0` is an optional peer.

## Server side

`validateSearchParams(url, schema, options?)` applies the same schema in a `load` function without mutating the URL.

```ts
import { validateSearchParams } from "runed/kit";
import { productSearchSchema } from "./schemas";

export const load = async ({ url, fetch }) => {
  const { searchParams, data } = validateSearchParams(url, productSearchSchema);

  const res = await fetch(`/api/products?${searchParams.toString()}`);
  return { products: await res.json() };
};
```

**It returns `{ searchParams, data }`, not a bare `URLSearchParams`** — changed in `0.33.0`, and the older single-value form is a common training-data mistake. `searchParams` is the validated `URLSearchParams` for forwarding to an API; `data` is the validated object for use in code.

Pass the same `compressedParamName` and `dateFormats` you gave `useSearchParams`, or the server decodes a different URL than the client wrote.

Invalid values are replaced with defaults and stripped from the URL, so a hand-edited query string degrades rather than throwing.

## Choosing the data-fetching tool

- **`load` functions** stay the default for page data: server-side, streamable, integrated with navigation and invalidation.
- **`useSearchParams`** for state that belongs in the URL — filters, pagination, sort. Pair it with `validateSearchParams` in `load` so one schema drives both sides.
- **`resource`** ([reactivity.md](reactivity.md)) for fetching owned by a component rather than a route — typeaheads, dependent selects, polling. It is client-side and does not participate in SSR.

## SSR

Nothing in `runed/kit` blocks server rendering, and no `browser` guard is needed — the same as the rest of Runed ([lifecycle.md](lifecycle.md)). `useSearchParams` opens an `$effect`, so it must be called during component initialisation.
