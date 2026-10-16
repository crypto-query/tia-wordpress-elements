<script lang="ts" module>
    import { LineChart, type LineSeriesOption } from "echarts/charts";
    import {
        GridComponent,
        MarkAreaComponent,
        MarkLineComponent,
        type GridComponentOption,
        type MarkAreaComponentOption,
        type MarkLineComponentOption
    } from "echarts/components";
    import { use, type ComposeOption } from "echarts/core";
    import { CanvasRenderer } from "echarts/renderers";

    use([LineChart, GridComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

    type Option = ComposeOption<LineSeriesOption | GridComponentOption | MarkLineComponentOption | MarkAreaComponentOption>;
</script>

<script lang="ts">
    import { ChevronLeft, ChevronRight, Info } from "lucide-svelte";
    import { onMount } from "svelte";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import Checkbox from "tia-design-system/ui/checkbox/Checkbox.svelte";
    import Combobox from "tia-design-system/ui/combobox/Combobox.svelte";
    import Chart from "tia-design-system/ui/chart/Chart.svelte";
    import { chartTheme, type ChartTheme } from "tia-design-system/ui/chart/chart-theme";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import Tooltip from "tia-design-system/ui/tooltip/Tooltip.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import type { Card as BootCard } from "../shared/boot";
    import { getAssets, getPredictiveCycles, type Asset, type Curve, type PredictiveCycles, type Selection } from "./api";
    import {
        chips,
        curveInfo,
        curveSlots,
        cutoffCase,
        dataRequest,
        monthStarts,
        notice,
        pickSelection,
        stepYear,
        toggleYear,
        zoneLabel,
        type Chip,
        type Exclusions
    } from "./transforms";

    // `instance` is null in the editor preview; nothing reads it until picks are stored.
    let { attributes, card }: { attributes: Record<string, unknown>; card: BootCard | null; instance: string | null } = $props();

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const uid = $props.id();
    let root = $state<HTMLDivElement>();
    let theme = $state.raw<(ChartTheme & { zone: string }) | null>(null);
    let assets = $state.raw<Asset[]>([]);
    let selection = $state.raw<Selection | null>(null);
    // Excluded years per asset id, kept across Base Years.
    let exclusions = $state.raw<Record<string, Exclusions>>({});
    // Ids of the curves hidden on the current asset.
    let hidden = $state.raw<number[]>([]);
    let shown = $state.raw<PredictiveCycles | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let waiting = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);

    const excluded = $derived(selection ? (exclusions[selection.asset.id] ?? {}) : {});
    const loading = $derived(waiting || request !== null);

    const firstAt = $derived(shown ? Date.UTC(shown.data.base_year, 0, 1) : 0);
    // The last day comes from the data: a year has 365 or 366 points, or fewer.
    const lastAt = $derived(shown ? (shown.data.curves[0]?.points.at(-1)?.[0] ?? Date.UTC(shown.data.base_year, 11, 31)) : 0);
    const cutoff = $derived(shown?.cutoff ?? null);
    const zone = $derived(cutoffCase(cutoff, firstAt, lastAt));
    const option = $derived(theme && shown ? chartOption(theme, shown, hidden) : null);
    const noneShown = $derived(selection !== null && selection.asset.curves.every(({ id }) => hidden.includes(id)));

    function chartOption(theme: ChartTheme & { zone: string }, { data }: PredictiveCycles, hidden: number[]): Option {
        const slots = curveSlots(data.curves.map(({ name }) => name));
        // With no curve shown, every curve stays as an invisible line, so the empty plot keeps its axes in place.
        const empty = data.curves.every(({ id }) => hidden.includes(id));
        const ticks = monthStarts(data.base_year);
        const label = theme.axis.axisLabel;
        const helper: LineSeriesOption = { type: "line", data: [], silent: true };
        if (cutoff && zone !== "none") {
            const from = zone === "before" ? firstAt : cutoff.at;
            helper.markArea = {
                silent: true,
                itemStyle: { color: theme.zone },
                // Rotated 90° about its anchor: align "right" ends the text at the anchor near the top,
                // verticalAlign "top" puts its height right of the anchor, so it clears the line.
                label: { ...label, position: [4, 8], rotate: 90, align: "right", verticalAlign: "top" },
                data: [[{ name: zoneLabel(cutoff), xAxis: from }, { xAxis: lastAt }]]
            };
            if (zone === "inside") {
                helper.markLine = {
                    silent: true,
                    symbol: "none",
                    label: { show: false },
                    lineStyle: { color: label.color, type: "dashed", width: 1 },
                    data: [{ xAxis: cutoff.at }]
                };
            }
        }
        return {
            useUTC: true,
            color: theme.color,
            textStyle: theme.textStyle,
            animation: false,
            grid: { left: 8, right: 16, top: 16, bottom: 8 },
            xAxis: {
                ...theme.axis,
                type: "time",
                min: firstAt,
                max: lastAt,
                splitLine: { show: false },
                axisTick: { ...theme.axis.axisTick, customValues: ticks },
                axisLabel: {
                    ...label,
                    customValues: ticks,
                    hideOverlap: true,
                    formatter: (value: number) => MONTHS[new Date(value).getUTCMonth()]
                }
            },
            yAxis: { ...theme.axis, type: "value", axisLabel: { ...label, formatter: "{value}%" } },
            series: [
                ...data.curves.flatMap((curve, index): LineSeriesOption[] =>
                    hidden.includes(curve.id) && !empty
                        ? []
                        : [
                              {
                                  type: "line",
                                  name: curve.name,
                                  data: curve.points,
                                  showSymbol: false,
                                  silent: empty,
                                  lineStyle: { width: 2, opacity: empty ? 0 : 1 },
                                  color: theme.color[slots[index] - 1]
                              }
                          ]
                ),
                helper
            ]
        };
    }

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    async function loadAssets() {
        failure = null;
        try {
            assets = await getAssets();
            selection = pickSelection(attributes, assets, new Date());
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
        clearTimeout(timer);
        waiting = false;
        const current = selection;
        if (!current) {
            return;
        }
        request?.abort();
        const own = new AbortController();
        request = own;
        failure = null;
        try {
            const data = await getPredictiveCycles(dataRequest(current, excluded), own.signal);
            if (request === own) {
                shown = data;
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

    /** A newer pick aborts the request in flight and loads after a short pause, so quick picks send one request. */
    function refetch() {
        request?.abort();
        request = null;
        clearTimeout(timer);
        waiting = true;
        timer = setTimeout(loadData, 150);
    }

    function pickAsset(id: string) {
        if (!selection || id === selection.asset.id) {
            return;
        }
        // The Base Year is kept by value when the new asset lists it.
        selection = pickSelection({ asset: id, baseYear: selection.baseYear }, assets, new Date());
        hidden = [];
        refetch();
    }

    function pickBaseYear(baseYear: number | null) {
        if (selection && baseYear !== null) {
            selection = { ...selection, baseYear };
            refetch();
        }
    }

    function pickYear(curve: Curve, year: number) {
        if (!selection) {
            return;
        }
        const next = toggleYear(curve, excluded[curve.id] ?? [], year);
        exclusions = { ...exclusions, [selection.asset.id]: { ...excluded, [curve.id]: next } };
        refetch();
    }

    /** Reads the chart colours once from the tokens on the Block root. */
    function readTheme(root: HTMLDivElement) {
        theme = { ...chartTheme(root), zone: getComputedStyle(root).getPropertyValue("--muted").trim() };
    }

    onMount(() => {
        if (!card) {
            loadAssets();
        }
        return () => {
            clearTimeout(timer);
            request?.abort();
        };
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

{#snippet stepper(step: -1 | 1, picked: Selection)}
    {@const target = stepYear(picked.asset.base_years, picked.baseYear, step)}
    <Button
        variant="ghost"
        size="icon"
        class="size-10 pointer-coarse:size-11"
        aria-label={step < 0 ? "Older Base Year" : "Newer Base Year"}
        aria-disabled={target === null}
        onclick={() => pickBaseYear(target)}>
        {#if step < 0}
            <ChevronLeft class="size-4" aria-hidden="true" />
        {:else}
            <ChevronRight class="size-4" aria-hidden="true" />
        {/if}
    </Button>
{/snippet}

{#snippet chip(curve: Curve, { value, text, name }: Chip, included: boolean, locked: boolean, props: Record<string, unknown> = {})}
    <button
        {...props}
        type="button"
        role="checkbox"
        aria-checked={included}
        aria-label={name === text ? undefined : name}
        aria-disabled={locked ? "true" : undefined}
        class={[
            "min-h-6 rounded-full border px-2 text-xs font-medium tabular-nums pointer-coarse:min-h-11 pointer-coarse:px-3",
            included ? "border-border-input bg-surface text-foreground" : "border-dashed border-border-input text-foreground-subtle",
            locked ? "cursor-not-allowed" : "cursor-pointer hover:border-border-input-hover"
        ]}
        onclick={() => {
            if (!locked) {
                pickYear(curve, value);
            }
        }}>
        {text}
    </button>
{/snippet}

{#snippet curveRow(curve: Curve, slot: number, baseYear: number)}
    {@const id = `${uid}-curve-${curve.id}`}
    {@const name = curve.name ?? `Curve ${curve.id}`}
    {@const info = curveInfo(curve)}
    {@const out = excluded[curve.id] ?? []}
    {@const included = (curve.years ?? []).filter((year) => !out.includes(year))}
    <li class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span class="flex items-center gap-2">
            <!-- The box sits inside its label, so the whole row is its tap target on touch. -->
            <label for={id} class="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground pointer-coarse:min-h-11">
                <Checkbox
                    {id}
                    size="sm"
                    bind:checked={
                        () => !hidden.includes(curve.id),
                        (checked) => (hidden = checked ? hidden.filter((other) => other !== curve.id) : [...hidden, curve.id])
                    } />
                <span aria-hidden="true" class="-mr-0.5 size-2.5 rounded-full" style:background-color="var(--chart-{slot})"></span>
                {name}
            </label>
            {#if info}
                <Tooltip content={info} class="max-w-72 whitespace-pre-line" portalTarget={root}>
                    {#snippet trigger({ props })}
                        <button
                            {...props}
                            type="button"
                            aria-label="About {name}"
                            class="grid size-6 cursor-help place-items-center rounded-full text-foreground-muted hover:text-foreground pointer-coarse:size-11">
                            <Info class="size-4" aria-hidden="true" />
                        </button>
                    {/snippet}
                </Tooltip>
            {/if}
        </span>
        {#if curve.years}
            <span class="flex flex-wrap gap-1">
                {#each chips(curve, baseYear) as one (one.value)}
                    {@const on = !out.includes(one.value)}
                    {#if on && included.length === 1}
                        <!-- Only the one locked chip per curve mounts a Tooltip. -->
                        <Tooltip content="At least one year must stay included" portalTarget={root}>
                            {#snippet trigger({ props })}
                                {@render chip(curve, one, on, true, props)}
                            {/snippet}
                        </Tooltip>
                    {:else}
                        {@render chip(curve, one, on, false)}
                    {/if}
                {/each}
            </span>
        {/if}
    </li>
{/snippet}

<!-- Positioned, so panels portalled here are placed from it; floating-ui misplaces them by the admin bar's html margin otherwise. -->
<div bind:this={root} class="relative" {@attach readTheme}>
    {#if card}
        <AccessCard feature="Predictive Cycles" {card} />
    {:else}
        <Card padding="none" class="@container flex flex-col">
            {#if selection}
                {@const picked = selection}
                <div class="flex flex-col gap-4 border-b border-border-muted px-4 py-5 @lg:px-5 @2xl:flex-row @2xl:items-end">
                    <Combobox
                        label="Asset"
                        class="@lg:w-64"
                        searchPlaceholder="Search assets…"
                        items={assets.map((asset) => ({ value: asset.id, label: asset.name, group: asset.group }))}
                        portalTarget={root}
                        value={picked.asset.id}
                        onValueChange={pickAsset} />
                    <div class="flex flex-col gap-1.5">
                        <span id="{uid}-base-year" class="text-sm font-medium text-foreground">Base Year</span>
                        <div role="group" aria-labelledby="{uid}-base-year" class="flex items-center gap-1">
                            {@render stepper(-1, picked)}
                            <span
                                role="status"
                                aria-labelledby="{uid}-base-year"
                                class="min-w-12 text-center text-md font-medium text-foreground tabular-nums">
                                {picked.baseYear}
                            </span>
                            {@render stepper(1, picked)}
                        </div>
                    </div>
                </div>
            {/if}
            <div class="flex flex-col px-4 pt-4 pb-5 @lg:px-5">
                {#if failure}
                    {@render problem(failure)}
                {:else if !shown || !option}
                    <div class="flex h-90 items-center justify-center sm:h-120">
                        <Spinner size="lg" tone="muted" label="Loading Predictive Cycles" />
                    </div>
                {:else}
                    {#if cutoff && zone !== "none"}
                        <p class="mb-3 text-sm text-foreground-muted">{notice(cutoff)}</p>
                    {/if}
                    <div class="relative">
                        <Chart
                            {option}
                            setOptionOpts={{ replaceMerge: ["series"] }}
                            class={["h-90 w-full transition-opacity sm:h-120", loading && "opacity-50"]}
                            role="group"
                            aria-label="Predictive Cycles chart, {shown.data.id.toUpperCase()}, Base Year {shown.data.base_year}" />
                        {#if loading}
                            <div class="absolute inset-0 flex items-center justify-center">
                                <Spinner size="lg" tone="muted" label="Loading Predictive Cycles" />
                            </div>
                        {:else if noneShown}
                            <p class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-foreground-muted">
                                Select a curve to show
                            </p>
                        {/if}
                    </div>
                {/if}
                {#if selection}
                    {@const picked = selection}
                    {@const slots = curveSlots(picked.asset.curves.map(({ name }) => name ?? ""))}
                    <ul aria-label="Curves" class="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                        {#each picked.asset.curves as curve, index (curve.id)}
                            {@render curveRow(curve, slots[index], picked.baseYear)}
                        {/each}
                    </ul>
                {/if}
            </div>
        </Card>
    {/if}
</div>
