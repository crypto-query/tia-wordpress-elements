# Core API: the parts that bite

The shape of `gsap.to(targets, vars)` needs no explanation. These are the details that decide whether an animation survives being interrupted, reversed, or run twice.

## Which method

| Method | Animates | Reach for it when |
|---|---|---|
| `gsap.to()` | current → `vars` | the destination is known, the start is whatever is on screen |
| `gsap.from()` | `vars` → current | a one-shot entrance that will never be interrupted |
| `gsap.fromTo()` | `fromVars` → `toVars` | anything re-triggerable, reversible, or repeated |
| `gsap.set()` | immediately, no tween | establishing a start state outside a tween |

**`from()` is a trap under interruption.** Its end value is read from the element at first render, so re-triggering it mid-flight captures the *mid-animation* value as the new destination — a card fading in at `autoAlpha: 0.4` when clicked twice, and dimmer on every repeat. Same failure with `repeatRefresh: true`. `fromTo()` states both ends and cannot drift.

**`immediateRender` decides what is on screen before the tween runs.** It defaults to `true` for `from()` and `fromTo()`, so the start state is applied the moment the tween is *created* — which is what prevents a flash of the final layout on mount. Stack two `from()`/`fromTo()` tweens on the same property of the same target and the second one's immediate render wipes the first's end state; set `immediateRender: false` on the later one.

## Transforms

Use GSAP's aliases rather than a `transform` string — they apply in a fixed order (translate → scale → rotationX/Y → skew → rotation) and compose predictably.

| Property | Notes |
|---|---|
| `x`, `y`, `z` | translate, px by default |
| `xPercent`, `yPercent` | translate in %, and the only correct way to do percentage movement |
| `scale`, `scaleX`, `scaleY` | |
| `rotation`, `rotationX`, `rotationY` | degrees by default; `"1.25rad"` also works |
| `skewX`, `skewY` | |
| `transformOrigin` | `"left top"`, `"50% 50%"` |
| `svgOrigin` | SVG only, in the SVG's global coordinate space; mutually exclusive with `transformOrigin` |

- **Set the *initial* transform with GSAP too**, not in the stylesheet. The browser reports computed transforms as a `matrix()`, which loses the unit (`%`, `vw` all come back as px) and is ambiguous about rotation and scale — `0deg`, `360deg` and `720deg` share one matrix, and `scaleX: -1` is indistinguishable from `rotation: 180, scaleY: -1`. A `gsap.set()` at mount records exact values in GSAP's own cache instead. This is the two-owner rule applied to the start state.
- **`autoAlpha` over `opacity`.** At `0` it also sets `visibility: hidden`, so the element stops intercepting pointer events; at non-zero it restores `visibility: inherit`.
- **Directional rotation suffixes:** `rotation: "-170_short"` takes the shortest path, `_cw` and `_ccw` force a direction.
- **Relative values:** `x: "+=20"`, `rotation: "-=30"`, `"*=2"`, `"/=2"`.
- **Function-based values** run once per target: `x: (i) => i * 50`. Combined with `stagger` this replaces most `forEach` loops.
- **CSS custom properties animate:** `{ '--hue': 180 }`.
- **`clearProps`** removes the named inline styles on completion so a class can take over. Clearing any transform property clears the whole `transform`.

## Stagger

```javascript
gsap.from('.card', { autoAlpha: 0, y: 24, stagger: 0.08 });
gsap.from('.card', { autoAlpha: 0, stagger: { amount: 0.4, from: 'center' } });
```

`stagger: 0.08` is a fixed gap between each; `{ amount: 0.4 }` spreads the total across however many targets exist, which is what you want for a list of unknown length. `from` accepts `"start"`, `"center"`, `"end"`, `"edges"`, `"random"`, or an index. A `forEach` with incrementing `delay` is always the wrong version of this.

## Easing

String eases, `.in` / `.out` / `.inOut` on each family: `none`, `power1`–`power4`, `back`, `bounce`, `circ`, `elastic`, `expo`, `sine`. The bare name means `.out`. `power2.out` is a reasonable house default; `ease: 'none'` is mandatory for anything scrubbed or used as a `containerAnimation`.

Parameterised: `back.out(1.7)` for overshoot, `elastic.out(1, 0.3)` for a settle. `CustomEase.create()` takes either CSS-style cubic-bezier values or full SVG path data when a designer hands you a curve.

**`easeReverse` (`3.15`)** — reversing an animation normally reverses the curve too, so an ease-out plays as an ease-in and a closing drawer feels wrong. `easeReverse: true` reuses the forward ease when the playhead runs backwards; any ease string gives the reverse its own feel. GSAP recalculates from wherever the direction changed, so it survives mid-flight interruption. This deprecates `yoyoEase`, which `3.15` rewrites internally.

## Keyframes

A sub-timeline inside a single tween — the concise form for one target moving through several steps. **Only `to()` takes them:** GSAP builds the internal sequence out of `.to()` calls, so `keyframes` on a `from()` or `fromTo()` does not mean what it reads like.

```javascript
// array per property — values spread evenly across the tween's duration
gsap.to('.box', { keyframes: { x: [0, 100, 100, 0], y: [0, 0, 100, 0] }, duration: 2 });

// percentages — the CSS @keyframes shape, for porting an existing animation
gsap.to('.box', { duration: 2, keyframes: { '0%': { x: 100 }, '75%': { x: 0, ease: 'sine.out' }, '100%': { x: 50 } } });

// array of vars — each step carries its own duration; delay makes a gap, negative delay an overlap
gsap.to('.box', { keyframes: [{ x: 100, duration: 1 }, { y: 200, duration: 1, delay: -0.25 }] });
```

Two eases, and conflating them is the usual bug: **`ease`** shapes the block as a whole (default `none`), **`easeEach`** shapes the hop between steps (default `power1.inOut`, matching CSS). Properties written *outside* the `keyframes` object tween normally alongside it under the tween's own ease, and `stagger` still applies — so several elements can each run the whole sequence, offset.

Move up to a timeline once targets need *different* sequences, or once a `scrollTrigger` is involved.

## Timelines

```javascript
const tl = gsap.timeline({ defaults: { duration: 0.4, ease: 'power2.out' } });
tl.from('.heading', { autoAlpha: 0, y: 20 })
  .from('.card', { autoAlpha: 0, y: 20, stagger: 0.08 }, '-=0.2')
  .to('.badge', { scale: 1 }, 'reveal')
  .to('.rule', { scaleX: 1 }, 'reveal+=0.1');
```

The third argument is the **position parameter**, and it is the reason timelines beat chained `delay`s:

| Form | Means |
|---|---|
| omitted | at the end of the timeline |
| `"-=0.2"` | 0.2s before the end — overlap |
| `"+=0.2"` | 0.2s after the end — gap |
| `"<"` / `">"` | at the start / end of the previous animation |
| `"<0.1"` | 0.1s after the previous animation's start |
| `0` / `1.5` | absolute time from the timeline's start |
| `"label"` / `"label+=0.1"` | relative to `tl.addLabel('label')` |

`defaults` on the timeline propagates to every child, so the duration and ease are stated once.

Nesting timelines is how a long sequence stays readable — build each section in its own function returning a timeline, then `master.add(sectionOne()).add(sectionTwo())`. The one exception: never put a `scrollTrigger` on a nested child; it belongs on a top-level animation only.

## Control and overwrite

Store the return value when playback needs controlling: `.play()`, `.pause()`, `.reverse()`, `.restart()`, `.progress(0.5)`, `.timeScale(2)`, `.seek('label')`, `.revert()`.

`overwrite` defaults to `false`. Set `overwrite: 'auto'` on tweens that can collide — on first render it kills only the *individual conflicting properties* of other active tweens on the same targets, which is what makes rapid hover in/out behave. `overwrite: true` kills all tweens of those targets outright.

## High-frequency updates

Creating a tween per frame or per pointer move allocates on every call. Two purpose-built alternatives:

```typescript
// retargetable tween — pointer followers, parallax, anything continuously re-aimed
const follow: Attachment<HTMLElement> = (node) => {
	const xTo = gsap.quickTo(node, 'x', { duration: 0.4, ease: 'power3' });
	const yTo = gsap.quickTo(node, 'y', { duration: 0.4, ease: 'power3' });
	const move = (e: PointerEvent) => { xTo(e.clientX); yTo(e.clientY); };

	window.addEventListener('pointermove', move);
	return () => {
		window.removeEventListener('pointermove', move);
		gsap.set(node, { clearProps: 'transform' });
	};
};

// no tween at all — direct setter for values you compute yourself each frame
const setX = gsap.quickSetter(node, 'x', 'px');
```

`quickTo` still eases; `quickSetter` writes immediately and is for values already smoothed by something else (a `ScrollTrigger` `onUpdate`, a physics loop).

**`quickTo` buys its speed by skipping the conveniences**, so it takes one numeric value and nothing else: no unit strings, no relative values (`"+=20"`), no function-based values, no `"random()"`, and no plugin properties — `morphSVG` and `attr` targets are out. Transform aliases work (`x`), their CSS spellings do not (`translateX`). A compound property that expands into several — `borderRadius` — is rejected outright with *"not eligible for reset"*; drive the individual corners instead.

## Utilities

`gsap.utils` covers the arithmetic that otherwise gets hand-rolled: `clamp`, `mapRange`, `normalize`, `interpolate`, `snap`, `wrap`, `random`, `pipe`, `unitize`, `distribute`, `toArray`, `selector`, `splitColor`, `getUnit`.

`gsap.utils.toArray('.card')` is the idiomatic way to loop when each element needs its *own* tween or trigger — a bare selector string animates them all as one target set instead.
