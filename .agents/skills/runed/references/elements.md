# Elements and sensors

Everything that observes the DOM, the pointer, the keyboard or the device. All of these take the element as `MaybeElementGetter` — a getter is the correct form, because the class is constructed before `bind:this` has assigned anything.

```svelte
<script lang="ts">
  let el = $state<HTMLElement>();
  const rect = new ElementRect(() => el);   // ✅ getter — resolves after bind
</script>

<div bind:this={el}></div>
```

Passing `el` directly reads `undefined` at construction and never recovers.

Most of this file's utilities need an effect context; `activeElement`, `ElementSize`, `IsFocusWithin` and `PressedKeys` do not. See [lifecycle.md](lifecycle.md).

## Measurement

**`ElementSize`** — `width` and `height` only, backed by a `ResizeObserver`. The one real option is `box: "border-box" | "content-box"` (default `"border-box"`), plus `window`. Uses `createSubscriber`, so it needs no effect context but only observes while something reads it reactively.

Its own doc comment advertises an `initialSize` option that `ElementSizeOptions` does not declare — the comment is stale; passing it is a type error. `ElementRect` is the one with a real `initialRect`.

**`ElementRect`** — the full `DOMRect` surface: `x`, `y`, `width`, `height`, `top`, `right`, `bottom`, `left`, plus `current` for the whole object. Option: `initialRect`. Unlike `ElementSize` this one opens an `$effect`, so it needs an owner.

Reach for `ElementSize` when size is all you need — it is the cheaper of the two and skips a state update when the dimension is unchanged.

**`TextareaAutosize`** — grows a `<textarea>` to fit its content by measuring an off-screen clone. Both `element` and `input` are required, and `input` must be the reactive value getter, since content changes are what trigger remeasurement.

```svelte
<script lang="ts">
  let el = $state<HTMLTextAreaElement>(null!);
  let value = $state("");

  new TextareaAutosize({ element: () => el, input: () => value });
</script>

<textarea bind:this={el} bind:value></textarea>
```

Options: `maxHeight`, `onResize`, and `styleProp` — `"height"` (default, grows and shrinks) or `"minHeight"` (grows only).

## Observers

`useIntersectionObserver`, `useResizeObserver` and `useMutationObserver` share a shape: `(target, callback, options?)`, where `target` may be one element, an array of elements, or a getter for either.

```ts
const observer = useIntersectionObserver(
  () => target,
  (entries) => { const entry = entries[0]; if (entry) isVisible = entry.isIntersecting; },
  { root: () => rootEl, once: true }
);
```

All three return `{ stop }`; the intersection observer adds `pause()`, `resume()` and `isActive`. Options carry `immediate` (start on creation), `root` as a getter, and — since `0.37.1` — `once`, which disconnects after the first intersection.

**`isActive` is a getter and cannot be destructured.** `const { stop } = observer` is fine because `stop` is a method; `const { isActive } = observer` gives you a dead boolean.

**`IsInViewport`** wraps `useIntersectionObserver` for the common case:

```ts
const inViewport = new IsInViewport(() => el, { once: true });
// inViewport.current
// inViewport.observer.pause() / .resume() / .stop() / .isActive
```

The `observer` property was added in `0.37.1`; before that the underlying observer was unreachable.

## Focus

**`activeElement`** is an exported **singleton**, not a class — `activeElement.current` is the focused `Element` or `null`. It pierces shadow DOM boundaries to find the true active element and is SSR-safe (`null` on the server). Construct `new ActiveElement({ document })` only to scope tracking to a specific document or shadow root.

**`IsFocusWithin`** — whether focus sits anywhere inside a container. Derived from `activeElement`, so it needs no effect context.

```svelte
<script lang="ts">
  let form = $state<HTMLFormElement>();
  const focused = new IsFocusWithin(() => form);
</script>

<form bind:this={form}>…</form>
<p>{focused.current}</p>
```

## Dismissal

**`onClickOutside(container, callback, options?)`** — calls back on pointer or focus events outside the container, and returns `{ start, stop, enabled }`.

```svelte
<script lang="ts">
  let dialog = $state<HTMLDialogElement>()!;

  const clickOutside = onClickOutside(
    () => dialog,
    () => { dialog.close(); clickOutside.stop(); },
    { immediate: false }
  );

  function open() { dialog.showModal(); clickOutside.start(); }
</script>
```

Options: `immediate` (default `true` — set `false` to arm it manually, which is what a dialog wants), `detectIframe` (default `false`; iframe clicks do not bubble, so enable it to catch focus moving into one), plus `document` and `window`.

`enabled` is a getter — read it through the returned object.

## Scrolling

**`ScrollState`** — position, direction, edge arrival and programmatic scrolling for an element, the window or the document.

```ts
const scroll = new ScrollState({ element: () => el });
// scroll.x / scroll.y        — reactive and writable; assigning scrolls
// scroll.directions          — which way the user is currently moving
// scroll.arrived             — per-edge booleans
// scroll.progress            — fraction scrolled per axis
// scroll.scrollTo(x, y), scroll.scrollToTop(), scroll.scrollToBottom()
```

Options: `idle` (ms of quiet before `onStop`, default `200`), `offset` per edge for the `arrived` thresholds, `onScroll`, `onStop`, `behavior`, `eventListenerOptions` (default `{ passive: true, capture: false }`) and `onError`. RTL and reverse-flex layouts are accounted for when computing edges.

## Input sensors

**`PressedKeys`** — which keys are down right now.

```ts
const keys = new PressedKeys();

const ctrlA = $derived(keys.has("Control", "a"));
keys.onKeys(["meta", "k"], () => openPalette());
```

Key names are lower-cased internally, so `"Control"` and `"control"` both work. It clears state on window blur and tab hide, so a key held while switching apps does not get stuck. `has()` and `all` register the listener lazily via `createSubscriber` — read them from a reactive context or nothing subscribes.

**`useEventListener(target, event, handler, options?)`** — an auto-disposed listener. Target and event may both be getters, and the event may be an array. Its value is reaching targets markup cannot: `document.body`, `window`, or an element handed down from a parent. When the element is yours, `onclick={...}` in markup is simpler.

**`IsIdle`** — whether the user has gone quiet.

```ts
const idle = new IsIdle({ timeout: 5000 });
// idle.current, idle.lastActive
```

Options: `timeout` (default `60000`), `events` (default `mousemove`, `mousedown`, `resize`, `keydown`, `touchstart`, `wheel`), `detectVisibilityChanges` (default `false`), `initialState`, and — since `0.36.0` — `trackLastActive`, which you can switch off to avoid a state write on every tracked event.

**`IsDocumentVisible`** — the Page Visibility API as a boolean. `current` is `false` outside the browser.

**`useGeolocation(options?)`** — a reactive `watchPosition`. Returns `isSupported`, `position`, `error`, `isPaused`, `pause()` and `resume()`, plus the standard `PositionOptions`. `immediate` (default `true`) controls whether it starts watching at construction — set it `false` to avoid triggering the permission prompt before the user asks for the feature.

## Animation

**`AnimationFrames`** — `requestAnimationFrame` with FPS limiting and metrics.

```ts
const animation = new AnimationFrames(
  ({ delta, timestamp }) => { /* per frame */ },
  { fpsLimit: () => limit }
);
// animation.fps, animation.running, animation.start(), .stop(), .toggle()
```

`fpsLimit` is a `MaybeGetter<number>` and `0` means unlimited. `immediate` (default `true`) starts the loop at construction. The loop stops with its owner.

For sequenced or scrubbed motion, a dedicated animation library is the better tool — `AnimationFrames` is a frame loop, not a timeline.

## boolAttr

`boolAttr(value)` returns `""` for truthy and `undefined` for falsy. It exists because Svelte stringifies booleans into attributes, so `data-active={false}` renders `data-active="false"` and the CSS selector `[data-active]` matches in both states.

```svelte
<div data-active={boolAttr(isActive)}>…</div>
```

Only needed for attributes whose *presence* is the signal — `data-*` and `aria-*` hooks used by CSS. Real HTML boolean properties like `disabled` and `checked` are already handled by Svelte.
