---
title: "Dark mode"
summary: "@custom-variant dark, the FOUC-blocking inline script, semantic tokens through @theme inline, and the SSR-safe toggle."
verified_against: "tailwindcss 4.3.3, Svelte 5, SvelteKit 2"
docs: ["/docs/dark-mode", "/docs/theme"]
---

# Dark mode

## Configuration

Out of the box, `dark:` follows the OS setting via `prefers-color-scheme`. That needs no configuration and is the right answer when you aren't offering a toggle.

For a user-controlled toggle, redefine the variant to key off a class instead:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

Or off a data attribute, if you have more than two themes:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

`darkMode: 'class'`, `darkMode: 'media'`, and `darkMode: ['selector', …]` are v3 config keys. There is no config file in v4, and no `darkMode` option — the variant definition *is* the configuration.

The `:where()` wrapper matters: it holds specificity at zero, so `dark:` variants stay as easy to override as any other utility.

## Avoiding the flash

The theme class must be on `<html>` before first paint. Anything that runs after hydration — `onMount`, `$effect`, a component-level toggle — paints the light theme first and then corrects it, which is the flash. The fix is a blocking inline script in `app.html`, ahead of `%sveltekit.head%`:

```html
<!-- src/app.html -->
<head>
    <script>
        document.documentElement.classList.toggle(
            "dark",
            localStorage.theme === "dark" ||
                (!("theme" in localStorage) &&
                    window.matchMedia("(prefers-color-scheme: dark)").matches)
        );
    </script>
    %sveltekit.head%
</head>
```

Synchronous and inline is the point — it must complete before the body renders. It reads an explicit choice first and falls back to the OS preference, so a user who has never toggled still gets the theme they asked their OS for.

To avoid the flash without JavaScript at all, store the preference in a cookie and set the class server-side in `handle` — the only approach that also works with JS disabled.

## The toggle

With the inline script owning the initial state, the component only handles changes:

```svelte
<script lang="ts">
    let dark = $state(
        typeof document !== "undefined" &&
            document.documentElement.classList.contains("dark")
    );

    function toggle() {
        dark = !dark;
        document.documentElement.classList.toggle("dark", dark);
        localStorage.theme = dark ? "dark" : "light";
    }
</script>

<button onclick={toggle} aria-pressed={dark} class="rounded p-2 hover:bg-gray-200 dark:hover:bg-gray-700">
    {dark ? "Light" : "Dark"} mode
</button>
```

Read the initial value from the DOM the script already set, rather than from `localStorage` again — one source of truth, and no second chance to disagree with what's on screen. Guarding on `typeof document` keeps it safe during SSR; the button renders with `dark` false on the server and corrects on hydration, which is invisible because the *page* is already correct.

`aria-pressed` is not decoration. An icon-only toggle is otherwise unlabelled for a screen reader — pair it with an `aria-label` if the button has no text.

## Semantic tokens

Writing `bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100` on every element doubles the class list and drifts out of sync. Name the *role* instead and let the token change:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
    --surface: #ffffff;
    --surface-muted: #f8fafc;
    --content: #0f172a;
    --content-muted: #475569;
    --edge: #e2e8f0;
}

.dark {
    --surface: #0f172a;
    --surface-muted: #1e293b;
    --content: #f1f5f9;
    --content-muted: #94a3b8;
    --edge: #334155;
}

@theme inline {
    --color-surface: var(--surface);
    --color-surface-muted: var(--surface-muted);
    --color-content: var(--content);
    --color-content-muted: var(--content-muted);
    --color-edge: var(--edge);
}
```

```svelte
<div class="bg-surface text-content border-edge border">…</div>
```

`@theme inline` is what makes this work: the generated utility embeds `var(--surface)` rather than a resolved colour, so flipping the `.dark` class re-resolves every utility through the cascade. No `dark:` variant on the element, no rebuild, and adding a third theme is another selector block rather than a pass over every component. This is the pattern shadcn-svelte uses, so a project already on those tokens is halfway there.

Keep `dark:` for the exceptions — a shadow that needs to disappear, an image that needs dimming — not for the base palette.

## Checks worth making

- Contrast holds at **WCAG AA in both themes**. A palette that passes in light routinely fails inverted; muted text on muted surfaces is where it breaks.
- `hover`, `focus-visible`, and `disabled` states are defined for dark too — a hover that's invisible on a dark surface reads as a broken control.
- Images and charts are tested, not just blocks of colour. A white-background PNG or an SVG with hardcoded `#000` strokes stays white-on-dark. `dark:invert` is a blunt fix; a second asset is the honest one.
- Borders remain visible. `border-gray-200` vanishes on a dark surface, which is exactly what a semantic `--edge` token prevents.
- Form fields carry an explicit background. `@tailwindcss/forms` hardcodes `#fff` on every `input`, `select`, and `textarea` — see [setup.md](setup.md) — so an unstyled field is a white rectangle on a dark page.
