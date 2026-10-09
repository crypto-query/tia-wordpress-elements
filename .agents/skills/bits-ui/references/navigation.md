# Navigation and disclosure

Tabs, Accordion, Collapsible, NavigationMenu, Pagination, Command, Toolbar, ScrollArea. Verified against bits-ui 2.18.1.

## Tabs

`Root` `List` `Trigger` `Content`, keyed by `value`. `activationMode="automatic"` (the default) selects a tab as the arrow keys move over it; `"manual"` waits for Enter or Space. Manual is the right choice when a panel triggers a fetch. `orientation` picks the arrow-key axis and `loop` wraps.

## Accordion and Collapsible

Accordion needs the `type` discriminant; Collapsible is a single `open` boolean. Both animate through a measured CSS variable — see [styling.md](styling.md).

`hiddenUntilFound` (`2.11`) hides collapsed content with `hidden="until-found"` instead of removing it, so the browser's find-in-page can locate the text and expand the section on a hit. It also makes the text indexable. The trade: the content is in the DOM the whole time, so it pays render cost even when closed.

`Accordion.Header` takes `level` for the heading level — the accordion's structure is only correct to a screen reader if that matches the surrounding document outline.

## NavigationMenu

A site-navigation menubar, not a dropdown menu: `Root` `List` `Item` `Trigger` `Content` `Link` `Indicator` `Viewport` `Sub`.

- `Viewport` is where `Content` renders when you want one shared panel area rather than a panel per item — it exposes `--bits-navigation-menu-viewport-width` / `-height` for animating between panels of different sizes.
- `Content` carries `data-motion` — `from-start`, `from-end`, `to-start`, `to-end` — naming which way the user moved along the menu. That is what makes a panel slide in from the side the previous panel left towards, rather than fading in place.
- `Indicator` is the little arrow or underline that follows the active trigger.
- `openOnHover` sits on `NavigationMenu.Item` (`1.8`), opting each item in or out of hover opening; `delayDuration` and `skipDelayDuration` on `Root` tune the timing the same way Tooltip's Provider does.
- `NavigationMenu.Link` takes `active` (mark the current page) and `onSelect`.
- `Content` accepts the escape and dismissible props, but not the floating ones — position it with your own CSS.

## Pagination

`Root` `PrevButton` `NextButton` `Page`, driven by `count` (total items), `perPage`, and a bindable `page`. The `children` snippet hands you `pages` and `range`, where each entry is `{ type: 'page', value }` or `{ type: 'ellipsis' }` — render the ellipsis yourself; there is no `Pagination.Ellipsis` part.

```svelte
<script lang="ts">
	import { Pagination } from 'bits-ui';
	let page = $state(1);
</script>

<Pagination.Root count={120} perPage={10} bind:page>
	{#snippet children({ pages })}
		<Pagination.PrevButton>‹</Pagination.PrevButton>
		{#each pages as item (item.key)}
			{#if item.type === 'ellipsis'}
				<span>…</span>
			{:else}
				<Pagination.Page page={item}>{item.value}</Pagination.Page>
			{/if}
		{/each}
		<Pagination.NextButton>›</Pagination.NextButton>
	{/snippet}
</Pagination.Root>
```

`siblingCount` controls how many pages flank the current one before the ellipsis takes over.

## Command

A command palette / filterable list: `Root` `Input` `List` `Viewport` `Empty` `Loading` `Group` `GroupHeading` `GroupItems` `Item` `LinkItem` `Separator`.

- **Every `Item` needs a unique `value`.** Two items sharing one value make selection and keyboard navigation ambiguous. When the display text repeats, set `value` explicitly and let the text be display-only — suffix it with an id so filtering still matches.
- Filtering and sorting are built in through a scoring function. `computeCommandScore` is exported so a custom `filter` can extend the default instead of replacing it; return `0` to hide an item, `1` for a perfect match. Set `shouldFilter={false}` to own filtering entirely — the right move for server-side search.
- `keywords` on an item adds search terms that are not in its visible text.
- `Command.LinkItem` renders an `<a>` and keeps framework prefetching; `Command.Item` renders a `div` with `onSelect`.
- `columns` (`2.6`) turns the list into a grid and makes left/right arrows navigate it. `disableInitialScroll` (`2.6`) stops the jump to the selected item on mount.
- `Command.Root` exposes an imperative API through `bind:this`: `getValidItems()`, `updateSelectedToIndex(i)`, `updateSelectedByItem(±1)`, `updateSelectedByGroup(±1)` — for custom keybindings.
- `vimBindings` (on by default) adds Ctrl-N / Ctrl-P navigation.

## Toolbar

`Root` `Button` `Link` `Group` `GroupItem` — a roving-tabindex container, so the whole toolbar is one tab stop and the arrow keys move within it. `Group` carries the `type` discriminant for toggle groups inside the toolbar.

## ScrollArea

`Root` `Viewport` `Scrollbar` `Thumb` `Corner`, with `type` deciding when scrollbars appear:

| `type` | Behaviour |
|---|---|
| `hover` (default) | visible while the pointer is over the area and the content overflows |
| `scroll` | visible while scrolling, fading after `scrollHideDelay` |
| `auto` | visible whenever the content overflows, like native scrollbars |
| `always` | always visible, as with `overflow: scroll` |

`Viewport` wraps your content in an undocumented inner `<div data-scroll-area-content>`, so your markup is a grandchild of the viewport rather than its child — size and lay out against that element, not with a `>` selector from the viewport.

`Scrollbar` takes a required `orientation`, so a two-axis area renders two of them plus a `Corner`. Both carry the same `data-scroll-area-scrollbar` and are told apart by `data-orientation` — the docs site's `data-scroll-area-scrollbar-x` / `-y` and `data-scroll-area-thumb-x` / `-y` do not exist, and a selector using them silently never matches. The thumb reads its size from `--bits-scroll-area-thumb-width` / `-height`. The custom scrollbars are cosmetic — native keyboard scrolling and wheel behaviour continue to work through the viewport.
