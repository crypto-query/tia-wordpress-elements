<script lang="ts" module>
    import { Stored } from "../shared/storage.svelte";
    import { EMPTY_MEMORY, isMemory } from "./transforms";

    /** Shared by every instance in this bundle, so exclusions update live across them. */
    export const memory = new Stored("tia-elements:forward-returns", isMemory, EMPTY_MEMORY);

    /** The editor previews' own exclusions, kept apart from the site's and gone on reload. */
    export const previewMemory = new Stored(null, isMemory, EMPTY_MEMORY);
</script>

<script lang="ts">
    import { ChevronLeft, ChevronRight, MessageSquareText, Palette, RotateCcw, Settings } from "lucide-svelte";
    import { onMount } from "svelte";
    import { MediaQuery } from "svelte/reactivity";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import Combobox from "tia-design-system/ui/combobox/Combobox.svelte";
    import DropdownMenu from "tia-design-system/ui/dropdown-menu/DropdownMenu.svelte";
    import DropdownMenuGroup from "tia-design-system/ui/dropdown-menu/DropdownMenuGroup.svelte";
    import DropdownMenuItem from "tia-design-system/ui/dropdown-menu/DropdownMenuItem.svelte";
    import DropdownMenuSeparator from "tia-design-system/ui/dropdown-menu/DropdownMenuSeparator.svelte";
    import Kbd from "tia-design-system/ui/kbd/Kbd.svelte";
    import Popover from "tia-design-system/ui/popover/Popover.svelte";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import Toggle from "tia-design-system/ui/toggle/Toggle.svelte";
    import ToggleGroup from "tia-design-system/ui/toggle/ToggleGroup.svelte";
    import Tooltip from "tia-design-system/ui/tooltip/Tooltip.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import type { Card as BootCard } from "../shared/boot";
    import { formatReturn } from "../shared/format";
    import { clamp, normalise, storedPick, withoutKey } from "../shared/load-rules";
    import { getAssets, getForwardReturns, type Asset, type ForwardReturns, type Selection } from "./api";
    import {
        ATTRIBUTE_KEYS,
        MONTH_NAMES,
        assetKey,
        cellKey,
        cellName,
        cellState,
        cellValue,
        columnLabel,
        columnResults,
        entryMonths,
        formatRate,
        periodLabel,
        periodOptions,
        rateTone,
        restore,
        selectAsset,
        thumb,
        toggle,
        toneOf,
        withExclusions,
        type CellState,
        type Exclusions,
        type Results,
        type Tone
    } from "./transforms";

    // `instance` is null in the editor preview, which neither restores nor stores a pick.
    let { attributes, card, instance }: { attributes: Record<string, unknown>; card: BootCard | null; instance: string | null } = $props();

    const uid = $props.id();
    let root = $state<HTMLDivElement>();
    let width = $state(0);
    const coarse = new MediaQuery("(pointer: coarse)");
    // Below the `@lg` container step, the help opens as a bottom sheet.
    const narrow = $derived(width > 0 && width < 512);
    let assets = $state.raw<Asset[]>([]);
    let selection = $state.raw<Selection | null>(null);
    // The table on screen; headers and rows both come from it, so a refetch never mixes old data with new headers.
    let shown = $state.raw<{ period: number; data: ForwardReturns } | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);
    let entryOffset = $state(0);
    let showTooltips = $state(true);
    let showColours = $state(true);
    // The one Return Cell or year under the pointer mounts a Tooltip; one per cell blocks the page for seconds on long histories.
    let hinted = $state<string | null>(null);
    // A Return Cell or year focused by keyboard opens its hint; the grid's one Tab stop is the item focused last.
    let focused = $state<string | null>(null);
    let lastFocused = $state<string | null>(null);
    let scroller: HTMLDivElement | undefined;
    // In px: the scroll area, the table, its sticky header, results and Year column, its first two rows,
    // and the rest of the card around the scroll area (`chrome`).
    let sizes = $state.raw({ width: 0, height: 0, tableWidth: 0, tableHeight: 0, head: 0, foot: 0, year: 0, twoRows: 0, chrome: 0 });
    let scroll = $state.raw({ top: 0, left: 0 });
    // The overlay thumbs show while the pointer is over the year rows or a thumb, while a drag runs, and while the rows scroll.
    let overRows = $state(false);
    let overThumb = $state(false);
    let scrolling = $state(false);
    let dragging = $state(false);
    let idle: ReturnType<typeof setTimeout> | undefined;

    const now = new Date();
    const currentAsset = $derived(assets.find((asset) => selection !== null && assetKey(asset) === assetKey(selection)));
    const years = $derived(shown?.data.periods.find(({ period }) => period === shown?.period)?.returns ?? []);
    const period = $derived(shown?.period ?? 1);
    const months = $derived(shown ? entryMonths(period, entryOffset) : []);
    const tableKey = $derived(shown ? `${assetKey(shown.data)}/${period}` : "");
    const exclusionStore = $derived(instance === null ? previewMemory : memory);
    const exclusions = $derived(exclusionStore.current.excluded[tableKey] ?? { years: [], cells: [] });
    const results = $derived(months.map((month) => columnResults(years, month, period, exclusions, now)));
    const navKeys = $derived([
        ...(period > 1 ? ["previous", "next"] : []),
        ...months.map((month) => `month-${month}`),
        ...years.flatMap((row) => [
            `year-${row.year}`,
            ...months.filter((month) => cellValue(row, month) !== null).map((month) => cellKey(row.year, month))
        ])
    ]);
    const tabStop = $derived(lastFocused !== null && navKeys.includes(lastFocused) ? lastFocused : navKeys[0]);
    const changed = $derived(entryOffset > 0 || exclusions.years.length > 0 || exclusions.cells.length > 0);
    const rowsThumb = $derived(thumb(sizes.height - sizes.head - sizes.foot, sizes.tableHeight - sizes.head - sizes.foot, scroll.top));
    const columnsThumb = $derived(thumb(sizes.width, sizes.tableWidth, scroll.left));
    const thumbsShown = $derived(overRows || overThumb || scrolling || dragging);

    const resultRows: { label: string; hint: string; value: (results: Results) => string }[] = [
        { label: "Totals", hint: "Return Cells that count: not Excluded, not Partial, with data", value: ({ totals }) => String(totals) },
        { label: "Wins", hint: "Counted Return Cells above 0", value: ({ wins }) => String(wins) },
        { label: "Losses", hint: "Counted Return Cells below 0", value: ({ losses }) => String(losses) },
        { label: "Returns", hint: "Wins as a share of Totals", value: ({ returns }) => formatRate(returns) }
    ];

    const tones: Record<Tone, string> = {
        positive: "bg-success-light text-success-strong",
        negative: "bg-error-light text-error-strong",
        zero: "bg-muted text-foreground-muted",
        none: ""
    };

    const rateTones: Record<Tone, string> = {
        positive: "text-success-strong",
        negative: "text-error-strong",
        zero: "text-foreground",
        none: "text-foreground"
    };

    function exclude(change: Partial<Exclusions>) {
        exclusionStore.set({
            ...exclusionStore.current,
            excluded: withExclusions(exclusionStore.current.excluded, tableKey, { ...exclusions, ...change })
        });
    }

    /** Stores this instance's pick; called on user actions only, so a load never overwrites it. */
    function remember() {
        if (instance === null || !selection) {
            return;
        }
        const entry = {
            attributes: normalise(attributes, ATTRIBUTE_KEYS),
            pick: {
                ...selection,
                entryOffset: clamp(entryOffset, 0, selection.period - 1),
                tooltips: showTooltips,
                colours: showColours
            }
        };
        memory.set({ ...memory.current, instances: { ...memory.current.instances, [instance]: entry } });
    }

    function reset() {
        if (!changed) {
            return;
        }
        entryOffset = 0;
        exclude({ years: [], cells: [] });
        remember();
    }

    function cellHint(year: number, month: number, value: number | null, state: CellState): string {
        const months = periodLabel(year, month, period, now);
        if (state === "partial") {
            return `${months} · partial`;
        }
        const reason = state === "year-excluded" ? `${year} is excluded` : state === "excluded" ? "Click to include" : "Click to exclude";
        return `${months} · ${formatReturn(value)}\n${reason}`;
    }

    /**
     * Trigger props for a hint that only adds information, so it is no extra focus stop.
     * A spread keeps the primitive's Symbol-keyed ref attachment, which places the panel.
     */
    function withoutFocusStop(props: Record<string, unknown>) {
        const rest = { ...props };
        delete rest.tabindex;
        delete rest.type;
        return rest;
    }

    /** Grid props for one item of the roving set; both Entry Offset arrows and the Year sit in column 0. */
    const navItem = (key: string, column: number) => ({ "data-nav": key, "data-column": column, tabindex: key === tabStop ? 0 : -1 });

    function navigate(event: KeyboardEvent & { currentTarget: HTMLTableElement }) {
        const item = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-nav]") : null;
        if (!item) {
            return;
        }
        const rows = [...event.currentTarget.rows]
            .map((row) => [...row.querySelectorAll<HTMLElement>("[data-nav]")])
            .filter((row) => row.length > 0);
        const rowIndex = rows.findIndex((row) => row.includes(item));
        const row = rows[rowIndex];
        const index = row.indexOf(item);
        let target: HTMLElement | undefined;
        switch (event.key) {
            case "ArrowLeft":
                target = row[index - 1];
                break;
            case "ArrowRight":
                target = row[index + 1];
                break;
            case "Home":
                target = row[0];
                break;
            case "End":
                target = row.at(-1);
                break;
            case "ArrowUp":
            case "ArrowDown": {
                // Rows without a cell in this column are skipped.
                const step = event.key === "ArrowUp" ? -1 : 1;
                for (let next = rowIndex + step; !target && next >= 0 && next < rows.length; next += step) {
                    target = rows[next].find((candidate) => candidate.dataset.column === item.dataset.column);
                }
                break;
            }
            case " ":
                // An Entry Month header has no action; Space would scroll the page.
                if (item.tagName === "TH") {
                    event.preventDefault();
                }
                return;
            default:
                return;
        }
        event.preventDefault();
        target?.focus();
    }

    function measure() {
        const table = scroller?.querySelector("table");
        if (!scroller || !table) {
            return;
        }
        const card = scroller.closest<HTMLElement>("[data-card]");
        const [first, second] = table.tBodies[0]?.rows ?? [];
        sizes = {
            width: scroller.clientWidth,
            height: scroller.clientHeight,
            tableWidth: table.offsetWidth,
            tableHeight: table.offsetHeight,
            head: table.tHead?.offsetHeight ?? 0,
            foot: table.tFoot?.offsetHeight ?? 0,
            year: table.tHead?.rows[0]?.cells[0]?.offsetWidth ?? 0,
            twoRows: (first?.offsetHeight ?? 0) + (second?.offsetHeight ?? 0),
            chrome: card ? card.getBoundingClientRect().height - scroller.getBoundingClientRect().height : 0
        };
    }

    /** Remeasures the scroll area whenever it, the table or the card changes size. */
    function scrollArea(element: HTMLDivElement) {
        scroller = element;
        const observer = new ResizeObserver(measure);
        for (const target of [element, element.querySelector("table"), element.closest("[data-card]")]) {
            if (target) {
                observer.observe(target);
            }
        }
        return () => {
            observer.disconnect();
            clearTimeout(idle);
            scroller = undefined;
        };
    }

    function scrolled(event: Event & { currentTarget: HTMLDivElement }) {
        scroll = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
        scrolling = true;
        clearTimeout(idle);
        idle = setTimeout(() => (scrolling = false), 800);
    }

    /** A drag on a thumb scrolls the rows (`y`) or the columns (`x`). */
    function drag(event: PointerEvent & { currentTarget: HTMLDivElement }, axis: "x" | "y", ratio: number) {
        const area = scroller;
        if (!area || event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging = true;
        const start = axis === "y" ? event.clientY : event.clientX;
        const from = axis === "y" ? area.scrollTop : area.scrollLeft;
        const move = (next: PointerEvent) => {
            const to = from + ((axis === "y" ? next.clientY : next.clientX) - start) * ratio;
            area.scrollTo(axis === "y" ? { top: to } : { left: to });
        };
        // On the window, so the drag still ends when the thumb unmounts mid-drag.
        const end = () => {
            dragging = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
    }

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    async function loadAssets() {
        failure = null;
        try {
            assets = await getAssets();
            const entry = instance === null ? undefined : memory.current.instances[instance];
            if (instance !== null && entry && !storedPick(entry, attributes, ATTRIBUTE_KEYS)) {
                // Changed defaults drop the pick, so reverting them later does not bring it back.
                memory.set({ ...memory.current, instances: withoutKey(memory.current.instances, instance) });
            }
            const restored = restore(attributes, entry, assets);
            selection = restored && { base: restored.base, quote: restored.quote, period: restored.period };
            entryOffset = restored?.entryOffset ?? 0;
            showTooltips = restored?.tooltips ?? true;
            showColours = restored?.colours ?? true;
        } catch (error) {
            fail(error, loadAssets);
            return;
        }
        if (selection) {
            await loadData();
        } else {
            failure = { kind: "unavailable", retry: loadAssets };
        }
    }

    async function loadData() {
        const current = selection;
        if (!current) {
            return;
        }
        request?.abort();
        const own = new AbortController();
        request = own;
        failure = null;
        try {
            const data = await getForwardReturns(current, own.signal);
            if (request === own) {
                shown = { period: current.period, data };
                entryOffset = Math.min(entryOffset, current.period - 1);
            }
        } catch (error) {
            if (request === own) {
                fail(error, loadData);
            }
        } finally {
            if (request === own) {
                request = null;
            }
        }
    }

    function pickAsset(key: string) {
        const asset = assets.find((candidate) => assetKey(candidate) === key);
        if (!asset || !selection || key === assetKey(selection)) {
            return;
        }
        selection = selectAsset(asset, selection.period);
        remember();
        loadData();
    }

    // A click on the picked period hands back null; the pick stays.
    function pickPeriod(value: string | null) {
        const period = Number(value);
        if (!selection || value === null || period === selection.period) {
            return;
        }
        selection = { ...selection, period };
        remember();
        loadData();
    }

    /** The toggle's arrow keys only move focus; picking the focused period makes them work as a radio group. */
    function pickFocused(event: KeyboardEvent & { currentTarget: HTMLDivElement }) {
        const focused = document.activeElement;
        if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) &&
            focused instanceof HTMLElement &&
            event.currentTarget.contains(focused)
        ) {
            pickPeriod(focused.dataset.value ?? null);
        }
    }

    onMount(() => {
        if (!card) {
            loadAssets();
        }
    });
</script>

{#snippet problem({ kind, retry }: { kind: ErrorKind; retry: () => void })}
    <Alert variant="destructive">
        {#if kind === "access"}
            Your access has changed. Reload the page.
        {:else}
            <p>This data is not available right now.</p>
            <Button variant="outline" size="sm" class="mt-3" onclick={retry}>Try again</Button>
        {/if}
    </Alert>
{/snippet}

{#snippet arrow(step: -1 | 1)}
    {@const target = entryOffset + step}
    {@const bound = target < 0 || target >= period}
    <Tooltip content={bound ? "" : `Show Entry Months from ${MONTH_NAMES[target]}`} disabled={bound} portalTarget={root}>
        {#snippet trigger({ props })}
            <Button
                {...props}
                {...navItem(step < 0 ? "previous" : "next", 0)}
                variant="ghost"
                size="icon"
                class="size-7 pointer-coarse:size-11"
                aria-label={step < 0 ? "Previous Entry Offset" : "Next Entry Offset"}
                aria-disabled={bound}
                onclick={() => {
                    if (!bound) {
                        entryOffset = target;
                        remember();
                    }
                }}>
                {#if step < 0}
                    <ChevronLeft class="size-4" aria-hidden="true" />
                {:else}
                    <ChevronRight class="size-4" aria-hidden="true" />
                {/if}
            </Button>
        {/snippet}
    </Tooltip>
{/snippet}

{#snippet cell(year: number, month: number, column: number, value: number | null, state: CellState)}
    {@const key = cellKey(year, month)}
    {@const locked = state === "partial" || state === "year-excluded"}
    <button
        {...navItem(key, column)}
        type="button"
        role="checkbox"
        aria-checked={state === "counted"}
        aria-label={cellName(year, month, value, period, state)}
        aria-disabled={locked ? "true" : undefined}
        class={[
            "grid w-full min-w-20 items-center rounded-md border text-center text-md font-medium whitespace-nowrap pointer-coarse:min-h-11",
            state === "partial" ? "border-dashed border-border-input" : "border-transparent",
            state === "counted" || (state === "partial" && !exclusions.years.includes(year))
                ? (showColours ? tones : rateTones)[toneOf(value)]
                : "text-foreground-muted",
            locked ? "cursor-not-allowed" : "cursor-pointer hover:border-current"
        ]}
        onpointerenter={() => (hinted = key)}
        onfocus={(event) => {
            hinted = key;
            focused = event.currentTarget.matches(":focus-visible") ? key : null;
        }}
        onblur={() => (focused = null)}
        onclick={() => {
            if (!locked) {
                exclude({ cells: toggle(exclusions.cells, key) });
            }
        }}>
        {@render hint(key, year, month, value, state)}
    </button>
{/snippet}

{#snippet hint(key: string, year: number, month: number, value: number | null, state: CellState)}
    {#if showTooltips && hinted === key}
        <!-- No offset beyond the arrow: rows sit closer than the default gap, so its tip would touch the row above. -->
        <Tooltip
            content={cellHint(year, month, value, state)}
            class="whitespace-pre-line"
            offset={0}
            open={focused === key}
            portalTarget={root}>
            {#snippet trigger({ props })}
                <span {...withoutFocusStop(props)} class="block px-2 py-1.5">{formatReturn(value)}</span>
            {/snippet}
        </Tooltip>
    {:else}
        <span class="block px-2 py-1.5">{formatReturn(value)}</span>
    {/if}
{/snippet}

{#snippet scrollThumb(axis: "x" | "y", span: { size: number; offset: number; ratio: number })}
    <!-- No layout space: both thumbs sit in the card's padding, beside the rows and under the results, so no tile
         lies under them. Wheel, touch and the keyboard grid scroll too, so screen readers skip it. -->
    <div
        data-thumb={axis === "y" ? "rows" : "columns"}
        aria-hidden="true"
        class={[
            "absolute z-3 touch-none rounded-full transition-[opacity,background-color] duration-200 before:absolute",
            axis === "y"
                ? "-right-2.5 w-1.5 before:-inset-x-1.5 before:inset-y-0"
                : "top-full mt-1 h-1.5 before:inset-x-0 before:-inset-y-1.5",
            // Hidden, it lets clicks through to the tiles under it.
            thumbsShown ? "opacity-100" : "pointer-events-none opacity-0",
            dragging ? "bg-foreground-muted" : "bg-(--scrollbar-thumb) hover:bg-foreground-muted"
        ]}
        style:top={axis === "y" ? `${sizes.head + span.offset}px` : undefined}
        style:height={axis === "y" ? `${span.size}px` : undefined}
        style:left={axis === "x" ? `${span.offset}px` : undefined}
        style:width={axis === "x" ? `${span.size}px` : undefined}
        onpointerenter={(event) => (overThumb = event.pointerType !== "touch")}
        onpointerleave={() => (overThumb = false)}
        onpointerdown={(event) => drag(event, axis, span.ratio)}>
    </div>
{/snippet}

{#snippet helpItem(title: string, text: string)}
    <li><span class="block text-sm font-semibold text-foreground">{title}</span>{text}</li>
{/snippet}

{#snippet help()}
    {@const act = coarse.current ? "Tap" : "Click"}
    <Popover title="How to use this table" sheet={narrow} align="end" class={narrow ? undefined : "w-85"} portalTarget={root}>
        {#snippet trigger({ props })}
            <button
                {...props}
                type="button"
                aria-label="How to use this table"
                class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border-input bg-surface text-sm font-semibold text-foreground hover:bg-muted aria-expanded:border-primary aria-expanded:bg-background @max-lg:size-11 @max-lg:text-base pointer-coarse:size-11">
                ?
            </button>
        {/snippet}
        <ul class="grid gap-2 text-xs/normal text-foreground-muted">
            {@render helpItem("Exclude a return", `${act} a cell. It stops counting in the results below. ${act} it again to include it.`)}
            {@render helpItem("Exclude a year", `${act} the year. The whole row stops counting.`)}
            {@render helpItem("Holding Period", "How long each return is held: 1, 3, 6 or 12 months.")}
            <li>
                <span class="block text-sm font-semibold text-foreground">Entry Months</span>
                With a Holding Period longer than a month, the
                <span class="whitespace-nowrap"><Kbd>‹</Kbd> <Kbd>›</Kbd></span>
                arrows in the top-left corner shift the start month.
            </li>
            <li>
                <span class="block text-sm font-semibold text-foreground">Partial</span>
                A cell with a dashed border
                <span class="rounded-md border border-dashed border-border-input px-1.5 font-medium text-foreground tabular-nums"
                    >+1.00%</span> is still running. It is not counted.
            </li>
            {@render helpItem("Results", "Wins are counted returns above 0. Returns is Wins as a share of Totals.")}
            {#if !coarse.current}
                <li>
                    <span class="block text-sm font-semibold text-foreground">Keyboard</span>
                    Tab into the table. Use
                    <span class="whitespace-nowrap"><Kbd>←</Kbd> <Kbd>→</Kbd> <Kbd>↑</Kbd> <Kbd>↓</Kbd></span>
                    to move, <Kbd>Home</Kbd> and <Kbd>End</Kbd> to jump, and <Kbd>Space</Kbd> to exclude or include.
                </li>
            {/if}
            {@render helpItem(
                "Settings",
                "The cog holds Reset, Tooltips and Colours. Reset includes everything again and moves the Entry Months back. It keeps the asset, the Holding Period and what Show sets."
            )}
        </ul>
    </Popover>
{/snippet}

{#snippet settings()}
    <DropdownMenu aria-label="Settings" portalTarget={root}>
        {#snippet trigger({ props })}
            <button
                {...props}
                type="button"
                aria-label="Settings"
                class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border-input bg-surface text-foreground hover:bg-muted aria-expanded:border-primary aria-expanded:bg-background @max-lg:size-11 pointer-coarse:size-11">
                <Settings class="size-4" aria-hidden="true" />
            </button>
        {/snippet}
        <DropdownMenuGroup heading="Actions">
            <DropdownMenuItem
                label="Reset"
                description="Includes all cells and years, Entry Months back to the start."
                disabled={!changed}
                onSelect={reset}>
                {#snippet leadingIcon()}<RotateCcw />{/snippet}
            </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup heading="Show">
            <DropdownMenuItem
                label="Tooltips"
                description="Months, value and click hint on hover."
                bind:checked={
                    () => showTooltips,
                    (on) => {
                        showTooltips = on;
                        remember();
                    }
                }>
                {#snippet leadingIcon()}<MessageSquareText />{/snippet}
            </DropdownMenuItem>
            <DropdownMenuItem
                label="Colours"
                description="Green and red fill on returns."
                bind:checked={
                    () => showColours,
                    (on) => {
                        showColours = on;
                        remember();
                    }
                }>
                {#snippet leadingIcon()}<Palette />{/snippet}
            </DropdownMenuItem>
        </DropdownMenuGroup>
    </DropdownMenu>
{/snippet}

{#snippet loading()}
    <div class="flex min-h-80 items-center justify-center">
        <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
    </div>
{/snippet}

<!-- Positioned, so panels portalled here are placed from it; floating-ui misplaces them by the admin bar's html margin otherwise. -->
<div bind:this={root} bind:clientWidth={width} class="relative">
    {#if card}
        <AccessCard feature="Forward Returns" {card} />
    {:else}
        <!-- A container: the Block may sit in a narrow column on a wide screen, so the layout follows the card's width. -->
        <!-- At most the viewport height, below the admin bar when there is one; then only the year rows scroll.
             It keeps room for the header, the results and about two rows; in a shorter viewport the page scrolls. -->
        <Card
            padding="none"
            class="@container flex flex-col"
            data-card
            style="max-height: max(100dvh - var(--wp-admin--admin-bar--height, 0px), {sizes.chrome +
                sizes.head +
                sizes.foot +
                sizes.twoRows}px)">
            {#if selection}
                {@const picked = selection}
                <!-- Below `@lg` the cog and help share the Asset row and the toggle wraps under it; up to `@3xl` Asset has a row of its own.
                     The toggle stays before the cog in the DOM, so Tab from Asset reaches it first. -->
                <div class="flex flex-wrap items-end gap-4 border-b border-border-muted px-4 py-5 @lg:px-6">
                    <div class="min-w-0 grow @lg:basis-full @3xl:grow-0 @3xl:basis-auto">
                        <Combobox
                            label="Asset"
                            class="@lg:w-64"
                            searchPlaceholder="Search assets…"
                            items={assets.map((asset) => ({ value: assetKey(asset), label: asset.title, group: asset.group }))}
                            portalTarget={root}
                            value={assetKey(selection)}
                            onValueChange={pickAsset} />
                    </div>
                    <!-- On a narrow card the toggle fills the row with smaller labels; narrower than those, it scrolls sideways. -->
                    <div class="order-last flex w-full flex-col gap-1.5 @max-lg:overflow-x-auto @lg:order-0 @lg:w-auto @3xl:ml-auto">
                        <span id="{uid}-period" class="text-sm font-medium text-foreground">Holding Period</span>
                        <ToggleGroup
                            type="single"
                            variant="solid"
                            size="sm"
                            indicator="sliding"
                            class="min-w-max rounded-full"
                            aria-labelledby="{uid}-period"
                            bind:value={() => String(picked.period), pickPeriod}
                            onkeydown={pickFocused}>
                            {#each currentAsset ? periodOptions(currentAsset) : [] as option (option.value)}
                                <Toggle
                                    value={option.value}
                                    class="rounded-full whitespace-nowrap @max-lg:flex-auto @max-lg:px-1 @max-lg:text-xs"
                                    >{option.label}</Toggle>
                            {/each}
                        </ToggleGroup>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                        {@render settings()}
                        {@render help()}
                    </div>
                </div>
            {/if}
            <div class="flex min-h-0 flex-col px-4 pt-4 pb-5 @lg:px-5">
                {#if failure}
                    {@render problem(failure)}
                {:else if !shown}
                    {@render loading()}
                {:else}
                    <div class="relative flex min-h-0 flex-col" aria-busy={request ? "true" : undefined}>
                        <!-- One scroll area for both directions. The scroll padding keeps a focused row clear of the sticky parts. -->
                        <div
                            {@attach scrollArea}
                            class={[
                                "scrollbar-none overflow-auto transition-opacity duration-150 [&::-webkit-scrollbar]:hidden",
                                request && "opacity-50"
                            ]}
                            style:scroll-padding="{sizes.head}px 0 {sizes.foot}px {sizes.year}px"
                            onscroll={scrolled}>
                            <!-- On a touch screen the Year column widens to fit both 44 px Entry Offset arrows. -->
                            <table
                                role="grid"
                                aria-label="Forward Returns"
                                class="w-full table-fixed border-separate border-spacing-0 text-right tabular-nums [--year:--spacing(21)] pointer-coarse:[--year:--spacing(22)]"
                                style:min-width="calc(var(--year) + {months.length} * 6.25rem)"
                                onkeydown={navigate}
                                onfocusin={(event) => {
                                    const key = event.target instanceof HTMLElement ? event.target.dataset.nav : undefined;
                                    if (key) {
                                        lastFocused = key;
                                    }
                                }}>
                                <thead class="sticky top-0 z-2">
                                    <tr class="text-xs tracking-wider text-foreground-muted uppercase">
                                        <!-- The corner cells' grey sits on a layer over the card colour, so their rounded corners hide what scrolls under them. -->
                                        <th
                                            scope="col"
                                            class="sticky left-0 z-1 w-(--year) bg-card-background px-0 py-1 text-center font-semibold before:absolute before:inset-0 before:-z-10 before:rounded-l-md before:bg-muted">
                                            {#if period > 1}
                                                <span class="sr-only">Year</span>
                                                <span class="flex justify-center gap-1 pointer-coarse:gap-0">
                                                    {@render arrow(-1)}
                                                    {@render arrow(1)}
                                                </span>
                                            {:else}
                                                Year
                                            {/if}
                                        </th>
                                        {#each months as month, index (month)}
                                            <!-- Inset ring: outside it the scroll box clips the top and the sticky Year column covers the left. -->
                                            <th
                                                scope="col"
                                                class="bg-muted px-2 py-2.5 text-center font-semibold last:relative last:z-0 last:bg-card-background last:before:absolute last:before:inset-0 last:before:-z-10 last:before:rounded-r-md last:before:bg-muted focus-visible:-outline-offset-2"
                                                {...navItem(`month-${month}`, index + 1)}>
                                                {columnLabel(month, period)}
                                            </th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody
                                    onpointerenter={(event) => (overRows = event.pointerType !== "touch")}
                                    onpointerleave={() => (overRows = false)}>
                                    {#each years as row (row.year)}
                                        {@const counted = !exclusions.years.includes(row.year)}
                                        <tr class="first:*:pt-2 last:*:pb-2">
                                            <!-- `h-px` lets the year fill the row's height; the inset ring keeps the scroll box from clipping it. -->
                                            <th scope="row" class="sticky left-0 h-px bg-card-background p-0.5">
                                                <button
                                                    {...navItem(`year-${row.year}`, 0)}
                                                    type="button"
                                                    role="checkbox"
                                                    aria-checked={counted}
                                                    aria-label="Count {row.year}"
                                                    class={[
                                                        "block size-full cursor-pointer rounded-md text-center text-xs font-semibold hover:bg-muted focus-visible:-outline-offset-2 pointer-coarse:min-h-11",
                                                        counted ? "text-foreground" : "text-foreground-subtle"
                                                    ]}
                                                    onpointerenter={() => (hinted = `year-${row.year}`)}
                                                    onfocus={(event) => {
                                                        hinted = `year-${row.year}`;
                                                        focused = event.currentTarget.matches(":focus-visible") ? hinted : null;
                                                    }}
                                                    onblur={() => (focused = null)}
                                                    onclick={() => exclude({ years: toggle(exclusions.years, row.year) })}>
                                                    {#if showTooltips && hinted === `year-${row.year}`}
                                                        <Tooltip
                                                            content={`${row.year} · whole row\nClick to ${counted ? "exclude" : "include"}`}
                                                            class="whitespace-pre-line"
                                                            offset={0}
                                                            open={focused === hinted}
                                                            portalTarget={root}>
                                                            {#snippet trigger({ props })}
                                                                <span {...withoutFocusStop(props)} class="block px-2 py-1">{row.year}</span>
                                                            {/snippet}
                                                        </Tooltip>
                                                    {:else}
                                                        <span class="block px-2 py-1">{row.year}</span>
                                                    {/if}
                                                </button>
                                            </th>
                                            {#each months as month, index (month)}
                                                <!-- `{@const}`, not the `{const}` declaration tag: that one runs once and misses exclusion changes. -->
                                                {@const value = cellValue(row, month)}
                                                {@const state = cellState(row.year, month, value, period, exclusions, now)}
                                                <td class="p-0.5">
                                                    {#if state !== "empty"}
                                                        {@render cell(row.year, month, index + 1, value, state)}
                                                    {/if}
                                                </td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tbody>
                                <tfoot class="sticky bottom-0 z-2 bg-card-background">
                                    <tr>
                                        <th scope="colgroup" colspan={months.length + 1} class="p-0">
                                            <span class="sr-only">Forward Return results</span>
                                        </th>
                                    </tr>
                                    {#each resultRows as { label, hint, value }, row (label)}
                                        <tr class={[row === 0 && "*:border-t *:border-border-muted *:pt-3.5"]}>
                                            <th
                                                scope="row"
                                                class="sticky left-0 bg-card-background px-1 py-1.5 text-xs font-semibold text-foreground">
                                                <!-- An invisible year sizes the box, so each label ends where the centred years end. -->
                                                <span class="relative mx-auto block w-max">
                                                    <span class="invisible" aria-hidden="true">{years[0]?.year}</span>
                                                    {#if showTooltips}
                                                        <Tooltip content={hint} portalTarget={root}>
                                                            {#snippet trigger({ props })}
                                                                <span
                                                                    {...withoutFocusStop(props)}
                                                                    class="absolute inset-y-0 right-0 flex items-center">{label}</span>
                                                            {/snippet}
                                                        </Tooltip>
                                                    {:else}
                                                        <span class="absolute inset-y-0 right-0 flex items-center">{label}</span>
                                                    {/if}
                                                </span>
                                            </th>
                                            {#each results as column, index (months[index])}
                                                <td
                                                    class={[
                                                        "px-1 py-1.5 text-center",
                                                        label === "Returns"
                                                            ? ["text-md font-semibold", rateTones[rateTone(column.returns)]]
                                                            : "text-sm text-foreground-muted"
                                                    ]}>{value(column)}</td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tfoot>
                            </table>
                        </div>
                        {#if rowsThumb}
                            {@render scrollThumb("y", rowsThumb)}
                        {/if}
                        {#if columnsThumb}
                            {@render scrollThumb("x", columnsThumb)}
                        {/if}
                        {#if request}
                            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </Card>
    {/if}
</div>
