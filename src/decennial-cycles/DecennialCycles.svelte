<script lang="ts" module>
    import { LineChart, type LineSeriesOption } from "echarts/charts";
    import {
        DataZoomInsideComponent,
        DataZoomSliderComponent,
        GridComponent,
        MarkLineComponent,
        TooltipComponent,
        type DataZoomComponentOption,
        type GridComponentOption,
        type MarkLineComponentOption,
        type TooltipComponentOption
    } from "echarts/components";
    import { use, type ComposeOption } from "echarts/core";
    import { CanvasRenderer } from "echarts/renderers";
    import { Stored } from "../shared/storage.svelte";
    import { isMemory } from "./transforms";

    use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, DataZoomInsideComponent, DataZoomSliderComponent, CanvasRenderer]);

    type Option = ComposeOption<
        LineSeriesOption | GridComponentOption | MarkLineComponentOption | TooltipComponentOption | DataZoomComponentOption
    >;

    /** Each instance's view; nothing is shared between instances. */
    export const memory = new Stored("tia-elements:decennial-cycles", isMemory, {});
</script>

<script lang="ts">
    import { format, type ECharts } from "echarts/core";
    import { CalendarDays, RotateCcw, Settings, Spline, Type } from "lucide-svelte";
    import { onMount } from "svelte";
    import { MediaQuery } from "svelte/reactivity";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import Chart from "tia-design-system/ui/chart/Chart.svelte";
    import { chartTheme, type ChartTheme } from "tia-design-system/ui/chart/chart-theme";
    import Combobox from "tia-design-system/ui/combobox/Combobox.svelte";
    import DropdownMenu from "tia-design-system/ui/dropdown-menu/DropdownMenu.svelte";
    import DropdownMenuGroup from "tia-design-system/ui/dropdown-menu/DropdownMenuGroup.svelte";
    import DropdownMenuItem from "tia-design-system/ui/dropdown-menu/DropdownMenuItem.svelte";
    import DropdownMenuSeparator from "tia-design-system/ui/dropdown-menu/DropdownMenuSeparator.svelte";
    import Popover from "tia-design-system/ui/popover/Popover.svelte";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import { asinhTicks, toAsinh } from "../shared/asinh";
    import { isObject, type Card as BootCard } from "../shared/boot";
    import { formatTick } from "../shared/format";
    import { normalise, withoutKey, storedPick } from "../shared/load-rules";
    import { getAssets, getDecennialCycles, type Asset, type DecennialCycles } from "./api";
    import {
        ATTRIBUTE_KEYS,
        FULL_ZOOM,
        axisName,
        caption,
        chartSummary,
        restore,
        todayMarker,
        tooltipContent,
        xAxisTicks,
        type Zoom
    } from "./transforms";

    // `instance` is null in the editor preview, which neither restores nor stores a view.
    let { attributes, card, instance }: { attributes: Record<string, unknown>; card: BootCard | null; instance: string | null } = $props();

    // Lines take `--chart-n` in order, as on Predictive Cycles, so the one line has Actual's colour.
    const LINE_SLOT = 1;
    // The narrowest window, one month, so a zoom under one year shows the month ticks.
    const MIN_SPAN = 1 / 12;

    const uid = $props.id();
    let root = $state<HTMLDivElement>();
    let width = $state(0);
    const coarse = new MediaQuery("(pointer: coarse)");
    // Below the `@lg` container step, the help opens as a bottom sheet.
    const narrow = $derived(width > 0 && width < 512);
    let chart = $state<ECharts>();
    let theme = $state.raw<ChartTheme | null>(null);
    let assets = $state.raw<Asset[]>([]);
    let asset = $state.raw<Asset | null>(null);
    let log = $state(false);
    let showLabels = $state(true);
    let showToday = $state(true);
    let zoom = $state.raw<Zoom>(FULL_ZOOM);
    let shown = $state.raw<DecennialCycles | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let waiting = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let zoomTimer: ReturnType<typeof setTimeout> | undefined;
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);

    const loading = $derived(waiting || request !== null);
    const zoomed = $derived(zoom.start > 0 || zoom.end < 100);
    // The caption and the chart name follow the data on screen, not a pick still loading; an error shows the pick.
    const named = $derived((!failure && assets.find(({ id }) => id === shown?.id)) || asset);
    const option = $derived(theme && shown ? chartOption(theme, shown, log, zoom, showLabels, showToday) : null);

    $effect(() => {
        const echart = chart;
        if (!echart) {
            return;
        }
        const onZoom = (event: unknown) => {
            const range: unknown = isObject(event) && Array.isArray(event.batch) ? event.batch[0] : event;
            if (isObject(range) && typeof range.start === "number" && typeof range.end === "number") {
                zoom = { start: range.start, end: range.end };
                clearTimeout(zoomTimer);
                zoomTimer = setTimeout(remember, 250);
            }
        };
        echart.on("datazoom", onZoom);
        return () => {
            if (!echart.isDisposed()) {
                echart.off("datazoom", onZoom);
            }
        };
    });

    function tooltipHtml(x: number, value: number | null): string {
        const { header, rows } = tooltipContent(x, value);
        return [
            `<div class="font-medium">${format.encodeHTML(header)}</div>`,
            ...rows.map(
                ({ name, value }) =>
                    `<div class="mt-1 flex items-center gap-2"><span class="size-2.5 rounded-full" style="background-color: var(--chart-${LINE_SLOT})"></span>` +
                    `${format.encodeHTML(name)}<span class="ml-auto pl-4 font-medium tabular-nums">${value}</span></div>`
            )
        ].join("");
    }

    function chartOption(
        theme: ChartTheme,
        { curve }: DecennialCycles,
        log: boolean,
        zoom: Zoom,
        showLabels: boolean,
        showToday: boolean
    ): Option {
        const [start, end] = [zoom.start / 10, zoom.end / 10];
        const { ticks, labels, format: tickLabel } = xAxisTicks(start, end);
        const label = theme.axis.axisLabel;
        const today = todayMarker(new Date());
        // Centred, the pill would reach past the plot within its half width of an edge, so there it turns inward.
        const place = (today.at - start) / (end - start);
        const align = place < 0.1 ? "left" : place > 0.9 ? "right" : "center";
        // The y axis fits the window: the zoom filters the points, and Log takes its ticks from the points inside.
        const span = { xAxisIndex: 0, filterMode: "filter", minValueSpan: MIN_SPAN, start: zoom.start, end: zoom.end } as const;
        return {
            color: theme.color,
            textStyle: theme.textStyle,
            animation: false,
            grid: { left: 8, right: 16, top: 24, bottom: 76 },
            tooltip: {
                ...theme.tooltip,
                trigger: "axis",
                confine: true,
                axisPointer: { type: "line", lineStyle: { color: label.color, type: "dashed", width: 1 } },
                formatter: (params) => {
                    const [first] = [params].flat();
                    const data: unknown = first?.data;
                    if (!Array.isArray(data) || typeof data[0] !== "number") {
                        return "";
                    }
                    const value = typeof data[1] === "number" ? (log ? Math.sinh(data[1]) : data[1]) : null;
                    return tooltipHtml(data[0], value);
                }
            },
            dataZoom: [
                { ...span, type: "inside", zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
                {
                    ...theme.dataZoom,
                    ...span,
                    type: "slider",
                    showDetail: false,
                    // The whole window drags, not only the thin bar on top that brush selection leaves.
                    brushSelect: false,
                    bottom: 8,
                    height: 24
                }
            ],
            xAxis: {
                ...theme.axis,
                type: "value",
                min: 0,
                max: 10,
                name: showLabels ? axisName(start, end) : "",
                nameLocation: "middle",
                nameGap: 28,
                nameTextStyle: label,
                splitLine: { ...theme.axis.splitLine, show: true },
                // Only a hovered line draws thicker; the tooltip's pointer would draw it so all the time.
                axisPointer: { snap: true, triggerEmphasis: false },
                axisTick: { ...theme.axis.axisTick, customValues: ticks },
                axisLabel: { ...label, show: showLabels, customValues: labels, hideOverlap: true, formatter: tickLabel }
            },
            yAxis: log
                ? logAxis(
                      theme,
                      curve.datapoints.flatMap(({ dec, value }) => (value === null || dec < start || dec > end ? [] : [value])),
                      showLabels
                  )
                : { ...theme.axis, type: "value", scale: true, axisLabel: { ...label, show: showLabels, formatter: formatTick } },
            series: [
                {
                    type: "line",
                    name: curve.name,
                    data: curve.datapoints.map(({ dec, value }) => [dec, log ? toAsinh(value) : value]),
                    showSymbol: false,
                    triggerEvent: "line",
                    // As thick as Actual on Predictive Cycles.
                    lineStyle: { width: 3 },
                    emphasis: { focus: "none", lineStyle: { width: 4 } },
                    color: theme.color[LINE_SLOT - 1],
                    markLine: showToday
                        ? {
                              silent: true,
                              symbol: "none",
                              label: {
                                  ...label,
                                  position: "end",
                                  formatter: today.label,
                                  align,
                                  color: theme.textStyle.color,
                                  backgroundColor: theme.tooltip.backgroundColor,
                                  borderColor: label.color,
                                  borderWidth: 1,
                                  borderRadius: 999,
                                  padding: [3, 8]
                              },
                              lineStyle: { color: label.color, type: "dashed", width: 1 },
                              emphasis: { disabled: true },
                              data: [{ xAxis: today.at }]
                          }
                        : undefined
                }
            ]
        };
    }

    /** The `asinh` y axis over the values in the window, with its ticks at round values in real %. */
    function logAxis(theme: ChartTheme, values: number[], showLabels: boolean): Option["yAxis"] {
        const ticks = (values.length > 0 ? asinhTicks(Math.min(...values), Math.max(...values)) : [0]).map((value) => Math.asinh(value));
        return {
            ...theme.axis,
            type: "value",
            min: ticks.at(0),
            max: ticks.at(-1),
            axisTick: { ...theme.axis.axisTick, customValues: ticks },
            axisLabel: {
                ...theme.axis.axisLabel,
                show: showLabels,
                customValues: ticks,
                formatter: (value: number) => formatTick(Math.round(Math.sinh(value)))
            }
        };
    }

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    /** Stores this instance's view; called on user actions only, so a load never overwrites it. */
    function remember() {
        clearTimeout(zoomTimer);
        if (instance === null || !asset) {
            return;
        }
        const entry = {
            attributes: normalise(attributes, ATTRIBUTE_KEYS),
            pick: { asset: asset.id, log, labels: showLabels, today: showToday, zoom }
        };
        memory.set({ ...memory.current, [instance]: entry });
    }

    async function loadAssets() {
        failure = null;
        try {
            assets = await getAssets();
            const entry = instance === null ? undefined : memory.current[instance];
            if (instance !== null && entry && !storedPick(entry, attributes, ATTRIBUTE_KEYS)) {
                // A changed default drops the view, so reverting it later does not bring it back.
                memory.set(withoutKey(memory.current, instance));
            }
            const view = restore(attributes, entry, assets);
            if (view) {
                ({ asset, log, zoom } = view);
                showLabels = view.labels;
                showToday = view.today;
            }
        } catch (error) {
            fail(error, loadAssets);
            return;
        }
        if (asset) {
            await loadData();
        } else {
            failure = { kind: "unavailable", retry: loadAssets };
        }
    }

    async function loadData() {
        clearTimeout(timer);
        waiting = false;
        const current = asset;
        if (!current) {
            return;
        }
        request?.abort();
        const own = new AbortController();
        request = own;
        failure = null;
        try {
            const data = await getDecennialCycles(current.id, own.signal);
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

    function pickAsset(id: string) {
        const next = assets.find((candidate) => candidate.id === id);
        if (!next || next.id === asset?.id) {
            return;
        }
        asset = next;
        zoom = FULL_ZOOM;
        remember();
        // A newer pick aborts the request in flight and loads after a short pause, so quick picks send one request.
        request?.abort();
        request = null;
        clearTimeout(timer);
        waiting = true;
        timer = setTimeout(loadData, 150);
    }

    function pickLog(on: boolean) {
        log = on;
        remember();
    }

    function reset() {
        if (zoomed) {
            zoom = FULL_ZOOM;
            remember();
        }
    }

    /** Reads the chart colours once from the tokens on the Block root. */
    function readTheme(root: HTMLDivElement) {
        theme = chartTheme(root);
    }

    onMount(() => {
        if (!card) {
            loadAssets();
        }
        return () => {
            clearTimeout(timer);
            clearTimeout(zoomTimer);
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

{#snippet helpItem(title: string, text: string)}
    <li><span class="block text-sm font-semibold text-foreground">{title}</span>{text}</li>
{/snippet}

{#snippet help()}
    <Popover title="How to use this chart" sheet={narrow} align="end" class={narrow ? undefined : "w-85"} portalTarget={root}>
        {#snippet trigger({ props })}
            <button
                {...props}
                type="button"
                aria-label="How to use this chart"
                class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border-input bg-surface text-sm font-semibold text-foreground hover:bg-muted aria-expanded:border-primary aria-expanded:bg-background @max-lg:size-11 @max-lg:text-base pointer-coarse:size-11">
                ?
            </button>
        {/snippet}
        <ul class="grid gap-2 text-xs/normal text-foreground-muted">
            {@render helpItem(
                "10-Year Cycle",
                "The line averages all past full years by their last digit. Each year starts where the one before it ended, so the returns add up across the decade."
            )}
            {@render helpItem("Today", "The dashed line marks where today falls in the decade.")}
            {@render helpItem("Read a value", coarse.current ? "Tap the chart." : "Hover the chart.")}
            {@render helpItem("Zoom", "Drag the handles of the slider under the chart. Drag the chart to move along the decade.")}
            {@render helpItem(
                "Settings",
                "The cog holds Reset, Today, Axis labels and Log scale. Reset shows the whole decade again and keeps the asset and what Show sets."
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
            <DropdownMenuItem label="Reset" description="Shows the whole decade." disabled={!zoomed} onSelect={reset}>
                {#snippet leadingIcon()}<RotateCcw />{/snippet}
            </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup heading="Show">
            <DropdownMenuItem
                label="Today"
                description="The dashed line where today falls in the decade."
                bind:checked={
                    () => showToday,
                    (on) => {
                        showToday = on;
                        remember();
                    }
                }>
                {#snippet leadingIcon()}<CalendarDays />{/snippet}
            </DropdownMenuItem>
            <DropdownMenuItem
                label="Axis labels"
                description="Years, months and % values on the axes."
                bind:checked={
                    () => showLabels,
                    (on) => {
                        showLabels = on;
                        remember();
                    }
                }>
                {#snippet leadingIcon()}<Type />{/snippet}
            </DropdownMenuItem>
            <DropdownMenuItem label="Log scale" description="Makes large moves easier to compare." bind:checked={() => log, pickLog}>
                {#snippet leadingIcon()}<Spline />{/snippet}
            </DropdownMenuItem>
        </DropdownMenuGroup>
    </DropdownMenu>
{/snippet}

<!-- Positioned, so panels portalled here are placed from it; floating-ui misplaces them by the admin bar's html margin otherwise. -->
<div bind:this={root} bind:clientWidth={width} class="relative" {@attach readTheme}>
    {#if card}
        <AccessCard feature="Decennial Cycles" {card} />
    {:else}
        <Card padding="none" class="@container flex flex-col">
            {#if asset}
                <div
                    class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border-muted px-4 py-5 @lg:px-5 @min-[39rem]:grid-cols-[auto_1fr_auto] @min-[60rem]:grid-cols-[1fr_auto_1fr]">
                    <div class="min-w-0 @min-[39rem]:min-w-auto">
                        <Combobox
                            label="Asset"
                            class="@lg:w-64"
                            searchPlaceholder="Search assets…"
                            items={assets.map(({ id, name, group }) => ({ value: id, label: name, group }))}
                            portalTarget={root}
                            value={asset.id}
                            onValueChange={pickAsset} />
                    </div>
                    {#if named}
                        <!-- Under the select until all three fit on one row; then centred between them, and on the card once the sides have room. -->
                        <p
                            class="row-start-2 text-base font-medium whitespace-nowrap text-foreground @min-[39rem]:col-start-2 @min-[39rem]:row-start-1 @min-[39rem]:flex @min-[39rem]:h-10 @min-[39rem]:items-center @min-[39rem]:justify-center @min-[39rem]:pointer-coarse:h-11">
                            {caption(named)}
                        </p>
                    {/if}
                    <div class="flex items-center justify-end gap-2 @min-[39rem]:col-start-3">
                        {@render settings()}
                        {@render help()}
                    </div>
                </div>
            {/if}
            <div class="flex flex-col px-4 pt-4 pb-5 @lg:px-5">
                {#if failure}
                    {@render problem(failure)}
                {:else if !shown || !option || !named}
                    <div class="flex h-90 items-center justify-center sm:h-120">
                        <Spinner size="lg" tone="muted" label="Loading Decennial Cycles" />
                    </div>
                {:else}
                    <div class="relative h-90 sm:h-120" aria-busy={loading ? "true" : undefined}>
                        <Chart
                            {option}
                            bind:chart
                            setOptionOpts={{ replaceMerge: ["series", "yAxis"] }}
                            class={["size-full transition-opacity", loading && "opacity-50"]}
                            role="img"
                            aria-label="Decennial Cycles chart, {named.name}, {named.range.begin}–{named.range.end}"
                            aria-describedby="{uid}-summary" />
                        {#if loading}
                            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <Spinner size="lg" tone="muted" label="Loading Decennial Cycles" />
                            </div>
                        {/if}
                    </div>
                    <p id="{uid}-summary" class="sr-only">{chartSummary(shown.curve.datapoints)}</p>
                {/if}
            </div>
        </Card>
    {/if}
</div>
