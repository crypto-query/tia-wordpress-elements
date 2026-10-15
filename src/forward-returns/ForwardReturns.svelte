<script lang="ts">
    import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-svelte";
    import { onMount } from "svelte";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Checkbox from "tia-design-system/ui/checkbox/Checkbox.svelte";
    import Combobox from "tia-design-system/ui/combobox/Combobox.svelte";
    import RadioGroup from "tia-design-system/ui/radio-group/RadioGroup.svelte";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import Tooltip from "tia-design-system/ui/tooltip/Tooltip.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import type { Boot } from "../shared/boot";
    import { getAssets, getForwardReturns, type Asset, type ForwardReturns, type Selection } from "./api";
    import {
        MONTH_NAMES,
        assetKey,
        cellKey,
        cellState,
        cellValue,
        columnResults,
        entryMonths,
        formatRate,
        formatReturn,
        periodLabel,
        periodOptions,
        pickSelection,
        selectAsset,
        toggle,
        toneOf,
        type CellState,
        type Exclusions,
        type Results,
        type Tone
    } from "./transforms";

    let { boot }: { boot: Boot } = $props();

    let root = $state<HTMLDivElement>();
    let assets = $state.raw<Asset[]>([]);
    let selection = $state.raw<Selection | null>(null);
    // The table on screen; headers and rows both come from it, so a refetch never mixes old data with new headers.
    let shown = $state.raw<{ period: number; data: ForwardReturns } | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);
    let entryOffset = $state(0);
    // Keyed by the shown table's `base/quote/period`.
    let excluded = $state.raw<Record<string, Exclusions>>({});
    // The one Return Cell under the pointer mounts a Tooltip; one per cell blocks the page for seconds on long histories.
    let hinted = $state<string | null>(null);

    const now = new Date();
    const currentAsset = $derived(assets.find((asset) => selection !== null && assetKey(asset) === assetKey(selection)));
    const years = $derived(shown?.data.periods.find(({ period }) => period === shown?.period)?.returns ?? []);
    const period = $derived(shown?.period ?? 1);
    const months = $derived(shown ? entryMonths(period, entryOffset) : []);
    const tableKey = $derived(shown ? `${assetKey(shown.data)}/${period}` : "");
    const exclusions = $derived(excluded[tableKey] ?? { years: [], cells: [] });
    const results = $derived(months.map((month) => columnResults(years, month, period, exclusions, now)));
    const changed = $derived(entryOffset > 0 || exclusions.years.length > 0 || exclusions.cells.length > 0);

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

    function exclude(change: Partial<Exclusions>) {
        excluded = { ...excluded, [tableKey]: { ...exclusions, ...change } };
    }

    function reset() {
        if (!changed) {
            return;
        }
        entryOffset = 0;
        exclude({ years: [], cells: [] });
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

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    async function loadAssets() {
        failure = null;
        try {
            assets = await getAssets();
            selection = pickSelection(boot.attributes, assets);
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
        loadData();
    }

    function pickPeriod(value: string) {
        const period = Number(value);
        if (!selection || period === selection.period) {
            return;
        }
        selection = { ...selection, period };
        loadData();
    }

    onMount(() => {
        if (!boot.card) {
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
                variant="ghost"
                size="icon"
                class="size-7 pointer-coarse:size-11"
                aria-label={step < 0 ? "Previous Entry Offset" : "Next Entry Offset"}
                aria-disabled={bound}
                onclick={() => {
                    if (!bound) {
                        entryOffset = target;
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

{#snippet cell(year: number, month: number, value: number | null, state: CellState)}
    {@const key = cellKey(year, month)}
    {@const locked = state === "partial" || state === "year-excluded"}
    <button
        type="button"
        role="checkbox"
        aria-checked={state === "counted"}
        aria-disabled={locked ? "true" : undefined}
        class={[
            "grid w-full min-w-20 items-center rounded-md border text-right whitespace-nowrap pointer-coarse:min-h-11",
            state === "partial" ? "border-dotted border-foreground-muted" : "border-transparent",
            state === "counted" || (state === "partial" && !exclusions.years.includes(year))
                ? tones[toneOf(value)]
                : "text-foreground-muted",
            locked ? "cursor-not-allowed" : "cursor-pointer"
        ]}
        onpointerenter={() => (hinted = key)}
        onclick={() => {
            if (!locked) {
                exclude({ cells: toggle(exclusions.cells, key) });
            }
        }}>
        {@render hint(key, year, month, value, state)}
    </button>
{/snippet}

{#snippet hint(key: string, year: number, month: number, value: number | null, state: CellState)}
    {#if hinted === key}
        <!-- No offset beyond the arrow: rows sit closer than the default gap, so its tip would touch the row above. -->
        <Tooltip content={cellHint(year, month, value, state)} class="whitespace-pre-line" offset={0} portalTarget={root}>
            {#snippet trigger({ props })}
                <span {...withoutFocusStop(props)} class="block px-2 py-1.5">{formatReturn(value)}</span>
            {/snippet}
        </Tooltip>
    {:else}
        <span class="block px-2 py-1.5">{formatReturn(value)}</span>
    {/if}
{/snippet}

{#snippet loading()}
    <div class="flex min-h-80 items-center justify-center">
        <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
    </div>
{/snippet}

<div bind:this={root}>
    {#if boot.card}
        <AccessCard feature="Forward Returns" card={boot.card} />
    {:else if !selection}
        {#if failure}
            {@render problem(failure)}
        {:else}
            {@render loading()}
        {/if}
    {:else}
        <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Combobox
                label="Asset"
                class="sm:w-64"
                searchPlaceholder="Search assets…"
                items={assets.map((asset) => ({ value: assetKey(asset), label: asset.title, group: asset.group }))}
                portalTarget={root}
                value={assetKey(selection)}
                onValueChange={pickAsset} />
            <RadioGroup
                label="Holding Period"
                orientation="horizontal"
                size="sm"
                items={currentAsset ? periodOptions(currentAsset) : []}
                value={String(selection.period)}
                onValueChange={pickPeriod} />
            <Button variant="outline" size="sm" class="self-start sm:ml-auto sm:self-auto" aria-disabled={!changed} onclick={reset}>
                {#snippet leadingIcon()}
                    <RotateCcw class="size-4" aria-hidden="true" />
                {/snippet}
                Reset
            </Button>
        </div>
        {#if failure}
            {@render problem(failure)}
        {:else if !shown}
            {@render loading()}
        {:else}
            <div class="relative" aria-busy={request ? "true" : undefined}>
                <div class={["overflow-x-auto transition-opacity duration-150", request && "opacity-50"]}>
                    <table class="border-collapse text-right tabular-nums">
                        <thead>
                            <tr>
                                <th scope="col" class="sticky left-0 bg-background px-3 py-2 text-left font-semibold">
                                    {#if period > 1}
                                        <span class="sr-only">Year</span>
                                        <span class="flex gap-1">
                                            {@render arrow(-1)}
                                            {@render arrow(1)}
                                        </span>
                                    {:else}
                                        Year
                                    {/if}
                                </th>
                                {#each months as month (month)}
                                    <th scope="col" class="px-3 py-2 font-semibold">{MONTH_NAMES[month - 1]}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody>
                            {#each years as row (row.year)}
                                <tr class="border-t border-border-muted">
                                    <th scope="row" class="sticky left-0 bg-background px-3 py-1 text-left font-semibold">
                                        <Checkbox
                                            size="sm"
                                            label={String(row.year)}
                                            checked={!exclusions.years.includes(row.year)}
                                            onCheckedChange={() => exclude({ years: toggle(exclusions.years, row.year) })} />
                                    </th>
                                    {#each months as month (month)}
                                        <!-- `{@const}`, not the `{const}` declaration tag: that one runs once and misses exclusion changes. -->
                                        {@const value = cellValue(row, month)}
                                        {@const state = cellState(row.year, month, value, period, exclusions, now)}
                                        <td class="p-1">
                                            {#if state !== "empty"}
                                                {@render cell(row.year, month, value, state)}
                                            {/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                        <tfoot>
                            <tr class="border-t border-border">
                                <th scope="colgroup" colspan={months.length + 1} class="px-3 pt-4 pb-1 text-left font-semibold">
                                    <span class="sticky left-3">Forward Return results</span>
                                </th>
                            </tr>
                            {#each resultRows as { label, hint, value } (label)}
                                <tr>
                                    <th scope="row" class="sticky left-0 bg-background px-3 py-1 text-left font-semibold">
                                        <Tooltip content={hint} portalTarget={root}>
                                            {#snippet trigger({ props })}
                                                <span {...withoutFocusStop(props)}>{label}</span>
                                            {/snippet}
                                        </Tooltip>
                                    </th>
                                    {#each results as column, index (months[index])}
                                        <td class="px-3 py-1">{value(column)}</td>
                                    {/each}
                                </tr>
                            {/each}
                        </tfoot>
                    </table>
                </div>
                {#if request}
                    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
                    </div>
                {/if}
            </div>
        {/if}
    {/if}
</div>
