---
title: "Variants and custom extensions"
summary: "The full built-in variant list, group/peer, not-* in-* **: starting:, and the three extension directives — @custom-variant, @utility with --value(), @plugin."
verified_against: "tailwindcss 4.3.3"
docs: ["/docs/hover-focus-and-other-states", "/docs/adding-custom-styles", "/docs/functions-and-directives"]
---

# Variants and custom extensions

## Built-ins

Check this list before writing a `@custom-variant`. Most variants people define by hand already exist.

**State** — `hover focus focus-within focus-visible active visited target`
**Structure** — `first last only odd even first-of-type last-of-type only-of-type empty`, plus `nth-[3n+1]` `nth-last-[…]` `nth-of-type-[…]`
**Forms** — `disabled enabled checked indeterminate default required optional valid invalid user-valid user-invalid in-range out-of-range placeholder-shown autofill read-only`
**Pseudo-elements** — `before after first-letter first-line marker selection file placeholder backdrop`
**Media** — `sm md lg xl 2xl`, `max-sm`…`max-2xl`, `min-[900px]`, `max-[60rem]`
**Preferences** — `dark motion-safe motion-reduce contrast-more contrast-less inverted-colors forced-colors`
**Input device** — `pointer-fine pointer-coarse pointer-none`, `any-pointer-*`
**Environment** — `portrait landscape print noscript`
**Support** — `supports-[display:grid]`, `not-supports-[…]`
**Attributes** — `aria-expanded` `aria-*` `data-[state=open]`, `open`, `inert`, `details-content`, `rtl` `ltr`
**Animation** — `starting` (for `@starting-style`)

`user-valid` / `user-invalid` are worth singling out: unlike `valid` / `invalid` they only apply after the user has actually interacted, so an empty required field isn't red before it's been touched.

## Composition

Stack variants left to right — `dark:md:hover:bg-fuchsia-600`. In v4 they apply in the order written; v3 applied them right to left, which matters when you stack `*` or `group-*` with something else.

**`group` and `peer`** — style off an ancestor's or a sibling's state. Name them when they nest:

```svelte
<div class="group/item">
    <div class="group/edit">
        <span class="group-hover/edit:text-white group-hover/item:underline">…</span>
    </div>
</div>
```

`peer` requires the peer to precede the target in the DOM (`peer-checked:`, `peer-invalid:`); `group` has no such constraint.

**`not-*`** negates: `not-hover:opacity-50`, `not-supports-[backdrop-filter]:bg-black`.

**`in-*`** is `group-*` without needing to mark the ancestor — `in-focus:underline` styles the element whenever any ancestor has focus.

**`has-*`** styles the parent from the child: `has-checked:bg-indigo-50`, `has-[>img]:p-0`.

**`*` and `**`** reach children. `*:` targets direct children, `**:` every descendant — `**:data-avatar:size-12` hits every descendant carrying `data-avatar`. Useful for markup you don't control; a code smell in markup you do.

**Arbitrary variants** cover the rest without a definition: `[&.is-dragging]:cursor-grabbing`, `[&_p]:mt-4`, `[@supports(display:grid)]:grid`.

## `@custom-variant`

`@custom-variant` **defines** a variant. `@variant` **applies** an existing one inside a rule. Conflating them is the single most common v4 CSS error.

```css
/* define */
@custom-variant theme-midnight (&:where([data-theme="midnight"] *));
@custom-variant dark (&:where(.dark, .dark *));
```

```css
/* apply */
.button {
    background: var(--color-sky-500);
    @variant dark {
        background: var(--color-sky-900);
    }
}
```

`4.3` lets `@variant` take stacked and compound forms: `@variant hover:focus { … }` for both at once, `@variant hover, focus { … }` for either.

A block form of `@custom-variant` handles at-rules and multi-step selectors:

```css
@custom-variant any-hover {
    @media (any-hover: hover) {
        &:hover {
            @slot;
        }
    }
}
```

Define a variant when it encodes a project convention — a theme attribute, a state class your JS toggles. Don't define `landscape`, `rtl`, `pointer-coarse`, `supports-*`, or `reduced-motion`; those ship.

## `@utility`

Custom utilities go through `@utility`, which registers them properly so variants (`hover:`, `md:`, `dark:`) compose onto them. `@layer utilities` from v3 does not do this — a class defined there is invisible to variants.

```css
@utility content-auto {
    content-visibility: auto;
}
```

Nest for anything beyond a flat declaration. **A `@utility` name cannot contain a colon** — `@utility card:hover` is a syntax error:

```css
@utility interactive-card {
    transition:
        transform 180ms ease,
        box-shadow 180ms ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
    }
}
```

```css
@utility scrollbar-hidden {
    &::-webkit-scrollbar {
        display: none;
    }
}
```

### Functional utilities

A trailing `-*` makes the utility take an argument, resolved by `--value()`:

```css
/* against a theme namespace */
@theme {
    --tab-size-github: 8;
}
@utility tab-* {
    tab-size: --value(--tab-size-*);
}

/* bare values — number, integer, ratio, percentage */
@utility tab-* {
    tab-size: --value(integer);
}

/* named literals */
@utility tab-* {
    tab-size: --value("inherit", "initial", "unset");
}

/* arbitrary values — length, color, url, ratio, … or [*] for anything */
@utility tab-* {
    tab-size: --value([integer]);
}
```

List several to accept all of them — unmatched forms are dropped, so the declarations simply stack:

```css
@utility tab-* {
    tab-size: --value([integer]);
    tab-size: --value(integer);
    tab-size: --value(--tab-size-*);
}
```

`--default()` (`4.3`) gives the bare class a value, so `tab` works alongside `tab-2`:

```css
@utility tab-* {
    tab-size: --value(integer, --default(4));
}
```

`--modifier()` handles the slash half — this is how `text-lg/7` sets size and line-height together:

```css
@utility text-* {
    font-size: --value(--text-*, [length]);
    line-height: --modifier(--leading-*, [length], [*]);
}
```

Negatives are a separate registration:

```css
@utility -inset-* {
    inset: --spacing(--value(integer) * -1);
}
```

## `@layer base` and `@apply`

Element defaults belong in `@layer base`, so utilities still win:

```css
@layer base {
    h1 {
        font-size: var(--text-2xl);
    }
}
```

`@apply` is not deprecated — it is the right tool when you must style markup you don't control (a third-party widget, `@html` output). It is the wrong tool for re-creating a utility you could have written in the class attribute. Inside a Svelte `<style>` block it needs `@reference` — see [setup.md](setup.md).

## `@plugin`

`@plugin "@tailwindcss/forms";` loads a v3-era JavaScript plugin. It exists for the ecosystem — `forms`, `typography`, `tailwindcss-animate` — not for your own code, where `@utility` and `@custom-variant` are simpler and need no JS. If you do write one, the plugin's `theme()` lookups follow the v3 key names (`colors.blue.500`), not the v4 variable names.
