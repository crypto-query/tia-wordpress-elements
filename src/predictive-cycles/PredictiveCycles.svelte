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
    import { getAssets, getPredictiveCycles, type PredictiveCycles, type Selection } from "./api";
    import { curveSlots, cutoffCase, monthStarts, notice, pickSelection, zoneLabel } from "./transforms";

    // `instance` is null in the editor preview; nothing reads it until picks are stored.
    let { attributes, card }: { attributes: Record<string, unknown>; card: BootCard | null; instance: string | null } = $props();

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    let theme = $state.raw<(ChartTheme & { zone: string }) | null>(null);
    let selection = $state.raw<Selection | null>(null);
    let shown = $state.raw<PredictiveCycles | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);

    const firstAt = $derived(shown ? Date.UTC(shown.data.base_year, 0, 1) : 0);
    // The last day comes from the data: a year has 365 or 366 points, or fewer.
    const lastAt = $derived(shown ? (shown.data.curves[0]?.points.at(-1)?.[0] ?? Date.UTC(shown.data.base_year, 11, 31)) : 0);
    const cutoff = $derived(shown?.cutoff ?? null);
    const zone = $derived(cutoffCase(cutoff, firstAt, lastAt));
    const option = $derived(theme && shown ? chartOption(theme, shown) : null);

    function chartOption(theme: ChartTheme & { zone: string }, { data }: PredictiveCycles): Option {
        const slots = curveSlots(data.curves.map(({ name }) => name));
        const ticks = monthStarts(data.base_year);
        const label = theme.axis.axisLabel;
        const helper: LineSeriesOption = { type: "line", data: [], silent: true };
        if (cutoff && zone !== "none") {
            const from = zone === "before" ? firstAt : cutoff.at;
            helper.markArea = {
                silent: true,
                // Above the lines (z 3) so a spilled label stays readable; the curves end where the zone starts.
                z: 4,
                itemStyle: { color: theme.zone },
                // Anchored right so a zone narrower than the text grows the label into the plot, not off the canvas.
                label: { ...label, position: "insideTopRight", distance: 8, backgroundColor: theme.zone, padding: [2, 4] },
                data: [[{ name: zoneLabel(cutoff), xAxis: from }, { xAxis: lastAt }]]
            };
            if (zone === "inside") {
                helper.markLine = {
                    silent: true,
                    symbol: "none",
                    label: { show: false },
                    lineStyle: { color: label.color, type: "solid", width: 1 },
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
                ...data.curves.map((curve, index): LineSeriesOption => ({
                    type: "line",
                    name: curve.name,
                    data: curve.points,
                    showSymbol: false,
                    lineStyle: { width: 2 },
                    color: theme.color[slots[index] - 1]
                })),
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
            selection = pickSelection(attributes, await getAssets(), new Date());
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
            const data = await getPredictiveCycles(current, own.signal);
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
        theme = { ...chartTheme(root), zone: getComputedStyle(root).getPropertyValue("--muted").trim() };
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
        <AccessCard feature="Predictive Cycles" {card} />
    {:else}
        <Card padding="none" class="@container flex flex-col">
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
                    <Chart
                        {option}
                        setOptionOpts={{ replaceMerge: ["series"] }}
                        class="h-90 w-full sm:h-120"
                        role="group"
                        aria-label="Predictive Cycles chart, {shown.data.id.toUpperCase()}, Base Year {shown.data.base_year}" />
                {/if}
            </div>
        </Card>
    {/if}
</div>
