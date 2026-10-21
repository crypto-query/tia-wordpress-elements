<script lang="ts" module>
    import { LineChart, type LineSeriesOption } from "echarts/charts";
    import {
        GridComponent,
        MarkLineComponent,
        TooltipComponent,
        type GridComponentOption,
        type MarkLineComponentOption,
        type TooltipComponentOption
    } from "echarts/components";
    import { use, type ComposeOption } from "echarts/core";
    import { CanvasRenderer } from "echarts/renderers";

    use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

    type Option = ComposeOption<LineSeriesOption | GridComponentOption | MarkLineComponentOption | TooltipComponentOption>;
</script>

<script lang="ts">
    import { format } from "echarts/core";
    import { onMount } from "svelte";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import Chart from "tia-design-system/ui/chart/Chart.svelte";
    import { chartTheme, type ChartTheme } from "tia-design-system/ui/chart/chart-theme";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import type { Card as BootCard } from "../shared/boot";
    import { formatTick } from "../shared/format";
    import { getAssets, getDecennialCycles, type Asset, type DecennialCycles } from "./api";
    import { axisName, caption, pickAsset, todayMarker, tooltipContent, xAxisTicks } from "./transforms";

    // `instance` is null in the editor preview; nothing reads it until picks are stored.
    let { attributes, card }: { attributes: Record<string, unknown>; card: BootCard | null; instance: string | null } = $props();

    // The one curve takes the slot of the "All" role.
    const LINE_SLOT = 2;

    let theme = $state.raw<ChartTheme | null>(null);
    let asset = $state.raw<Asset | null>(null);
    let shown = $state.raw<DecennialCycles | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);

    const option = $derived(theme && shown ? chartOption(theme, shown, 0, 10) : null);

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

    function chartOption(theme: ChartTheme, { curve }: DecennialCycles, start: number, end: number): Option {
        const { ticks, labels, format: tickLabel } = xAxisTicks(start, end);
        const label = theme.axis.axisLabel;
        const today = todayMarker(new Date());
        return {
            color: theme.color,
            textStyle: theme.textStyle,
            animation: false,
            grid: { left: 8, right: 16, top: 24, bottom: 8 },
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
                    return tooltipHtml(data[0], typeof data[1] === "number" ? data[1] : null);
                }
            },
            xAxis: {
                ...theme.axis,
                type: "value",
                min: start,
                max: end,
                name: axisName(start, end),
                nameLocation: "middle",
                nameGap: 28,
                nameTextStyle: label,
                splitLine: { ...theme.axis.splitLine, show: true },
                // Only a hovered line draws thicker; the tooltip's pointer would draw it so all the time.
                axisPointer: { snap: true, triggerEmphasis: false },
                axisTick: { ...theme.axis.axisTick, customValues: ticks },
                axisLabel: { ...label, customValues: labels, hideOverlap: true, formatter: tickLabel }
            },
            yAxis: { ...theme.axis, type: "value", scale: true, axisLabel: { ...label, formatter: formatTick } },
            series: [
                {
                    type: "line",
                    name: curve.name,
                    data: curve.datapoints.map(({ dec, value }) => [dec, value]),
                    showSymbol: false,
                    triggerEvent: "line",
                    lineStyle: { width: 2 },
                    emphasis: { focus: "none", lineStyle: { width: 3 } },
                    color: theme.color[LINE_SLOT - 1],
                    markLine: {
                        silent: true,
                        symbol: "none",
                        label: { ...label, position: "end", formatter: today.label },
                        lineStyle: { color: label.color, type: "dashed", width: 1 },
                        emphasis: { disabled: true },
                        data: [{ xAxis: today.at }]
                    }
                }
            ]
        };
    }

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    async function loadAssets() {
        failure = null;
        try {
            asset = pickAsset(attributes.asset, await getAssets());
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

    /** Reads the chart colours once from the tokens on the Block root. */
    function readTheme(root: HTMLDivElement) {
        theme = chartTheme(root);
    }

    onMount(() => {
        if (!card) {
            loadAssets();
        }
        return () => request?.abort();
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

<div {@attach readTheme}>
    {#if card}
        <AccessCard feature="Decennial Cycles" {card} />
    {:else}
        <Card padding="none" class="@container flex flex-col">
            <div class="flex flex-col px-4 pt-4 pb-5 @lg:px-5">
                {#if asset}
                    <p class="mb-3 text-sm font-medium">{caption(asset)}</p>
                {/if}
                {#if failure}
                    {@render problem(failure)}
                {:else if !shown || !option || !asset}
                    <div class="flex h-90 items-center justify-center sm:h-120">
                        <Spinner size="lg" tone="muted" label="Loading Decennial Cycles" />
                    </div>
                {:else}
                    <Chart
                        {option}
                        setOptionOpts={{ replaceMerge: ["series"] }}
                        class="h-90 w-full sm:h-120"
                        role="img"
                        aria-label="Decennial Cycles chart, {asset.name}, {asset.range.begin}–{asset.range.end}" />
                {/if}
            </div>
        </Card>
    {/if}
</div>
