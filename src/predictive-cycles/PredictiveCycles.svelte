<script lang="ts" module>
    import { LineChart, type LineSeriesOption } from "echarts/charts";
    import {
        DataZoomSliderComponent,
        GraphicComponent,
        GridComponent,
        MarkAreaComponent,
        MarkLineComponent,
        TooltipComponent,
        type DataZoomComponentOption,
        type GraphicComponentOption,
        type GridComponentOption,
        type MarkAreaComponentOption,
        type MarkLineComponentOption,
        type TooltipComponentOption
    } from "echarts/components";
    import { use, type ComposeOption } from "echarts/core";
    import { CanvasRenderer } from "echarts/renderers";
    import { Stored } from "../shared/storage.svelte";
    import { EMPTY_MEMORY, isMemory } from "./transforms";

    use([
        LineChart,
        GridComponent,
        GraphicComponent,
        MarkLineComponent,
        MarkAreaComponent,
        TooltipComponent,
        DataZoomSliderComponent,
        CanvasRenderer
    ]);

    type Option = ComposeOption<
        | LineSeriesOption
        | GridComponentOption
        | MarkLineComponentOption
        | MarkAreaComponentOption
        | TooltipComponentOption
        | DataZoomComponentOption
        | GraphicComponentOption
    >;

    /** Shared by every instance in this bundle, so year exclusions update live across them. */
    export const memory = new Stored("tia-elements:predictive-cycles", isMemory, EMPTY_MEMORY);

    /** The editor previews' own exclusions, kept apart from the site's and gone on reload. */
    export const previewMemory = new Stored(null, isMemory, EMPTY_MEMORY);
</script>

<script lang="ts">
    import { format, type ECharts, type ElementEvent } from "echarts/core";
    import { mergeProps } from "bits-ui";
    import { Check, ChevronDown, ChevronLeft, ChevronRight, Lock, RotateCcw } from "lucide-svelte";
    import { onMount, untrack } from "svelte";
    import { MediaQuery } from "svelte/reactivity";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import Combobox from "tia-design-system/ui/combobox/Combobox.svelte";
    import Chart from "tia-design-system/ui/chart/Chart.svelte";
    import { chartTheme, type ChartTheme } from "tia-design-system/ui/chart/chart-theme";
    import Kbd from "tia-design-system/ui/kbd/Kbd.svelte";
    import Popover from "tia-design-system/ui/popover/Popover.svelte";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import Toggle from "tia-design-system/ui/toggle/Toggle.svelte";
    import Tooltip from "tia-design-system/ui/tooltip/Tooltip.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import { asinhTicks, toAsinh } from "../shared/asinh";
    import { isObject, type Card as BootCard } from "../shared/boot";
    import { normalise, storedPick, withoutKey } from "../shared/load-rules";
    import { getAssets, getPredictiveCycles, type Asset, type Curve, type CurveData, type PredictiveCycles, type Selection } from "./api";
    import {
        ACTUAL,
        ATTRIBUTE_KEYS,
        DAY,
        FULL_ZOOM,
        NO_DRAG,
        canReset,
        chartSummary,
        chipGroups,
        chipTooltip,
        chips,
        curveSlots,
        cutoffCase,
        dataRequest,
        dayLabel,
        dragAnnouncement,
        dragCurves,
        lineKind,
        monthStarts,
        notice,
        pickSelection,
        restore,
        shortName,
        stepYear,
        toggleYear,
        tooltipRows,
        yearCount,
        yearsTitle,
        zoneLabel,
        type Chip,
        type Drag,
        type Zoom
    } from "./transforms";

    // `instance` is null in the editor preview, which neither restores nor stores a pick.
    let { attributes, card, instance }: { attributes: Record<string, unknown>; card: BootCard | null; instance: string | null } = $props();

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const KEY_STEPS = new Map<string, Drag>([
        ["ArrowLeft", { days: -1, percent: 0 }],
        ["ArrowRight", { days: 1, percent: 0 }],
        ["ArrowUp", { days: 0, percent: 1 }],
        ["ArrowDown", { days: 0, percent: -1 }]
    ]);

    const uid = $props.id();
    let root = $state<HTMLDivElement>();
    let chart = $state<ECharts>();
    let theme = $state.raw<(ChartTheme & { zone: string }) | null>(null);
    let assets = $state.raw<Asset[]>([]);
    let selection = $state.raw<Selection | null>(null);
    // Names of the hidden curves, on every asset.
    let hidden = $state.raw<string[]>([]);
    let log = $state(false);
    let zoom = $state.raw<Zoom>(FULL_ZOOM);
    let shown = $state.raw<PredictiveCycles | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let waiting = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let zoomTimer: ReturnType<typeof setTimeout> | undefined;
    let requested: string | null = null;
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);
    // Memory only: an asset or Base Year change and Reset clear it.
    let drag = $state.raw<Drag>(NO_DRAG);
    let focused = $state(false);
    let announcement = $state("");
    // The axis scale at the pointer when a mouse drag starts, so a y axis that rescales under the drag does not feed back.
    let grab: { from: Drag; y: number; msPerPixel: number; valuePerPixel: number } | null = null;
    let gripPoints = "";
    let gripX = 0;
    let width = $state(0);
    // The one open panel: "help", a curve id for its year popover, or none.
    let openPanel = $state<"help" | number | null>(null);
    let fade = $state.raw({ left: false, right: false });
    const coarse = new MediaQuery("(pointer: coarse)");
    // Below the `@lg` container step, panels open as bottom sheets.
    const narrow = $derived(width > 0 && width < 512);

    const store = $derived(instance === null ? previewMemory : memory);
    // Excluded years of the asset, by curve id, kept across Base Years and shared with every instance.
    const excluded = $derived(selection ? (store.current.excluded[selection.asset.id] ?? {}) : {});
    const wanted = $derived(selection && dataRequest(selection, excluded));
    const loading = $derived(waiting || request !== null);
    const resettable = $derived(selection !== null && canReset(hidden, excluded, zoom, drag));

    const firstAt = $derived(shown ? Date.UTC(shown.data.base_year, 0, 1) : 0);
    // The last day comes from the data: a year has 365 or 366 points, or fewer.
    const lastAt = $derived(shown ? (shown.data.curves[0]?.points.at(-1)?.[0] ?? Date.UTC(shown.data.base_year, 11, 31)) : 0);
    const cutoff = $derived(shown?.cutoff ?? null);
    const zone = $derived(cutoffCase(cutoff, firstAt, lastAt));
    const draggable = $derived(
        !hidden.includes(ACTUAL) &&
            (shown?.data.curves.some(({ name, points }) => name === ACTUAL && points.some(([, value]) => value !== null)) ?? false)
    );
    const option = $derived(theme && shown ? chartOption(theme, shown, hidden, log, zoom, drag, focused && draggable) : null);
    const noneShown = $derived(selection !== null && selection.asset.curves.every(({ name }) => hidden.includes(name)));

    // Every pick, a year chip here or in another instance, and Reset change the request; refetch debounces quick changes.
    $effect(() => {
        const key = wanted && JSON.stringify(wanted);
        if (key === null || key === requested) {
            return;
        }
        requested = key;
        if (untrack(() => shown) === null) {
            loadData();
        } else {
            refetch();
        }
    });

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
        // A remounted chart (after Try again) has lost the grip, so its first paint lays it again.
        gripPoints = "";
        // Every paint (a new option, a zoom, a resize) may move Actual's pixels, so the grip follows. A paint can run
        // inside `setOption`, which refuses a nested `setOption`, so the grip waits for it to return.
        const onRendered = () => queueMicrotask(placeGrip);
        echart.on("rendered", onRendered);
        return () => {
            if (!echart.isDisposed()) {
                echart.off("datazoom", onZoom);
                echart.off("rendered", onRendered);
            }
        };
    });

    /**
     * Lays an invisible, wide polyline over Actual's visible points; dragging it moves Actual. It is laid again only
     * when the points changed, as each placement renders the chart once more.
     */
    function placeGrip() {
        const echart = chart;
        if (!echart || echart.isDisposed() || grab) {
            return;
        }
        const actual = draggable && shown ? dragCurves(shown.data.curves, drag).find(({ name }) => name === ACTUAL) : undefined;
        const points = (actual?.points ?? []).flatMap(([at, value]) => {
            if (value === null) {
                return [];
            }
            const pixel: number[] = echart.convertToPixel({ gridIndex: 0 }, [at, log ? Math.asinh(value) : value]);
            return echart.containPixel({ gridIndex: 0 }, pixel) ? [pixel] : [];
        });
        const key = JSON.stringify(points);
        if (key === gripPoints) {
            return;
        }
        gripPoints = key;
        echart.setOption({
            graphic: [
                {
                    id: "actual-grip",
                    type: "polyline",
                    x: 0,
                    y: 0,
                    z: 100,
                    ignore: points.length < 2,
                    draggable: true,
                    cursor: "grab",
                    shape: { points },
                    style: { stroke: "transparent", fill: "none", lineWidth: 12 },
                    // The grip covers Actual's line, so it carries the line's hover and value tooltip; the axis
                    // tooltip hides over an element that has neither data nor a tooltip of its own.
                    onmousemove: ({ offsetX }: ElementEvent) => {
                        gripX = offsetX;
                        emphasise(ACTUAL, true);
                    },
                    onmouseout: () => emphasise(ACTUAL, false),
                    tooltip: { formatter: gripTooltip },
                    ondragstart: startGrab,
                    ondrag: moveGrab,
                    ondragend: endGrab
                }
            ]
        });
    }

    /**
     * The value tooltip of the day under the pointer, with the drag hint as its last line. The hint shares the panel
     * because ECharts moves its tooltip around the pointer, so a second panel there would sometimes lie under it.
     */
    function gripTooltip(): string {
        const at: unknown = chart?.convertFromPixel({ xAxisIndex: 0 }, gripX);
        if (!shown || typeof at !== "number") {
            return "";
        }
        const values = tooltipHtml(shown.data.curves, hidden, firstAt + Math.round((at - firstAt) / DAY) * DAY);
        return grab ? values : `${values}<div class="mt-2 text-foreground-muted">Drag to move, or use the arrow keys</div>`;
    }

    function startGrab({ offsetX, offsetY }: ElementEvent) {
        const echart = chart;
        if (!echart) {
            return;
        }
        const [x, y]: number[] = echart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY]);
        const [x1, y1]: number[] = echart.convertFromPixel({ gridIndex: 0 }, [offsetX + 1, offsetY + 1]);
        grab = { from: drag, y, msPerPixel: x1 - x, valuePerPixel: y1 - y };
    }

    /** x snaps to whole days; y is free, in real % on the Log scale too. */
    function moveGrab({ target }: ElementEvent) {
        if (!grab) {
            return;
        }
        const real = (value: number) => (log ? Math.sinh(value) : value);
        drag = {
            days: grab.from.days + Math.round((target.x * grab.msPerPixel) / DAY),
            percent: grab.from.percent + real(grab.y + target.y * grab.valuePerPixel) - real(grab.y)
        };
    }

    function endGrab() {
        grab = null;
        // The grip still sits where the pointer left it; lay it on Actual again.
        gripPoints = "";
        placeGrip();
        announcement = dragAnnouncement(drag);
    }

    /** Also empties the live region, so the same move after a clear is announced again. */
    function clearDrag() {
        drag = NO_DRAG;
        announcement = "";
    }

    function moveByKey(event: KeyboardEvent) {
        const step = KEY_STEPS.get(event.key);
        if (!step || !draggable) {
            return;
        }
        event.preventDefault();
        drag = { days: drag.days + step.days, percent: drag.percent + step.percent };
        announcement = dragAnnouncement(drag);
    }

    function tooltipHtml(curves: CurveData[], hidden: string[], at: number): string {
        const inZone = cutoff !== null && (zone === "before" || (zone === "inside" && at > cutoff.at));
        return [
            `<div class="font-medium">${dayLabel(at)}</div>`,
            inZone ? `<div class="text-foreground-muted">${zoneLabel(cutoff)}</div>` : "",
            ...tooltipRows(curves, hidden, at).map(
                ({ name, slot, value }) =>
                    `<div class="mt-1 flex items-center gap-2"><span class="size-2.5 rounded-full" style="background-color: var(--chart-${slot})"></span>` +
                    `${format.encodeHTML(name)}<span class="ml-auto pl-4 font-medium tabular-nums">${value}</span></div>`
            )
        ].join("");
    }

    function chartOption(
        theme: ChartTheme & { zone: string },
        shown: PredictiveCycles,
        hidden: string[],
        log: boolean,
        zoom: Zoom,
        drag: Drag,
        focused: boolean
    ): Option {
        const { data } = shown;
        const curves = dragCurves(data.curves, drag);
        const slots = curveSlots(curves.map(({ name }) => name));
        // With no curve shown, every curve stays as an invisible line, so the empty plot keeps its axes in place.
        const empty = curves.every(({ name }) => hidden.includes(name));
        const drawn = curves.flatMap((curve, index) => (hidden.includes(curve.name) && !empty ? [] : [{ curve, slot: slots[index] }]));
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
            grid: { left: 8, right: 16, top: 16, bottom: 64 },
            tooltip: {
                ...theme.tooltip,
                show: !empty,
                trigger: "axis",
                // The cut-off already draws a dashed line; the pointer draws none.
                axisPointer: { type: "none" },
                formatter: (params) => {
                    const [first] = [params].flat();
                    return first && "axisValue" in first ? tooltipHtml(data.curves, hidden, Number(first.axisValue)) : "";
                }
            },
            dataZoom: [
                {
                    ...theme.dataZoom,
                    type: "slider",
                    xAxisIndex: 0,
                    filterMode: "none",
                    bottom: 8,
                    height: 24,
                    start: zoom.start,
                    end: zoom.end
                }
            ],
            xAxis: {
                ...theme.axis,
                type: "time",
                min: firstAt,
                max: lastAt,
                splitLine: { show: false },
                // Only a hovered line or chip draws thicker; the tooltip's pointer would draw every line so.
                axisPointer: { triggerEmphasis: false },
                axisTick: { ...theme.axis.axisTick, customValues: ticks },
                axisLabel: {
                    ...label,
                    customValues: ticks,
                    hideOverlap: true,
                    formatter: (value: number) => MONTHS[new Date(value).getUTCMonth()]
                }
            },
            yAxis: log
                ? logAxis(
                      theme,
                      drawn.map(({ curve }) => curve)
                  )
                : { ...theme.axis, type: "value", axisLabel: { ...label, formatter: "{value}%" } },
            series: [
                ...drawn.map(({ curve, slot }): LineSeriesOption => {
                    const kind = lineKind(curve.name);
                    const hovered = kind === "actual" ? 4 : 3;
                    return {
                        type: "line",
                        name: curve.name,
                        data: log ? curve.points.map(([at, value]) => [at, toAsinh(value)]) : curve.points,
                        showSymbol: false,
                        silent: empty,
                        triggerEvent: "line",
                        // A year set can equal a solid curve (BTC Bear and Y2), so its dashes draw on top of it.
                        z: kind === "set" ? 3 : 2,
                        lineStyle: {
                            // With the chart focused, the arrow keys move Actual, so it draws as if hovered.
                            width: kind === "actual" ? (focused ? 4 : 3) : 2,
                            type: kind === "set" ? "dashed" : "solid",
                            opacity: empty ? 0 : 1
                        },
                        emphasis: { focus: "series", lineStyle: { width: hovered } },
                        blur: { lineStyle: { opacity: 0.2 } },
                        color: theme.color[slot - 1]
                    };
                }),
                helper
            ]
        };
    }

    /** The `asinh` y axis, with its ticks at round values in real %. */
    function logAxis(theme: ChartTheme, curves: PredictiveCycles["data"]["curves"]): Option["yAxis"] {
        const values = curves.flatMap(({ points }) => points.flatMap(([, value]) => (value === null ? [] : [value])));
        const ticks = asinhTicks(Math.min(0, ...values), Math.max(0, ...values)).map((value) => Math.asinh(value));
        return {
            ...theme.axis,
            type: "value",
            min: ticks[0],
            max: ticks[ticks.length - 1],
            axisTick: { ...theme.axis.axisTick, customValues: ticks },
            axisLabel: { ...theme.axis.axisLabel, customValues: ticks, formatter: (value: number) => `${Math.round(Math.sinh(value))}%` }
        };
    }

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    /** Stores this instance's view; called on user actions only, so a load never overwrites it. */
    function remember() {
        clearTimeout(zoomTimer);
        if (instance === null || !selection) {
            return;
        }
        const pick = { asset: selection.asset.id, baseYear: selection.baseYear, hidden, log, zoom };
        const entry = { attributes: normalise(attributes, ATTRIBUTE_KEYS), pick };
        memory.set({ ...memory.current, instances: { ...memory.current.instances, [instance]: entry } });
    }

    async function loadAssets() {
        failure = null;
        try {
            assets = await getAssets();
            const entry = instance === null ? undefined : memory.current.instances[instance];
            if (instance !== null && entry && !storedPick(entry, attributes, ATTRIBUTE_KEYS)) {
                // Changed defaults drop the view, so reverting them later does not bring it back.
                memory.set({ ...memory.current, instances: withoutKey(memory.current.instances, instance) });
            }
            const view = restore(attributes, entry, assets, new Date());
            if (view) {
                ({ selection, hidden, log, zoom } = view);
            }
        } catch (error) {
            fail(error, loadAssets);
            return;
        }
        // The request effect loads the data once there is a selection.
        if (!selection) {
            failure = { kind: "unavailable", retry: loadAssets };
        }
    }

    async function loadData() {
        clearTimeout(timer);
        waiting = false;
        const current = wanted;
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
        zoom = FULL_ZOOM;
        clearDrag();
        remember();
    }

    function pickBaseYear(baseYear: number | null) {
        if (selection && baseYear !== null) {
            selection = { ...selection, baseYear };
            clearDrag();
            remember();
        }
    }

    function setExcluded(curve: Curve, next: number[]) {
        if (selection) {
            store.set({
                ...store.current,
                excluded: { ...store.current.excluded, [selection.asset.id]: { ...excluded, [curve.id]: next } }
            });
        }
    }

    function pickYear(curve: Curve, year: number) {
        if (selection) {
            setExcluded(curve, toggleYear(curve, selection.baseYear, excluded[curve.id] ?? [], year));
        }
    }

    /** Opening a panel closes the other; a late close of a panel already replaced changes nothing. */
    function setPanel(panel: "help" | number, open: boolean) {
        if (open) {
            openPanel = panel;
        } else if (openPanel === panel) {
            openPanel = null;
        }
    }

    /** Fades the chip row's edges where chips are scrolled out of sight. */
    function edgeFade(scroller: HTMLDivElement) {
        const update = () => {
            const { scrollLeft, clientWidth, scrollWidth } = scroller;
            fade = { left: scrollLeft > 2, right: scrollLeft + clientWidth < scrollWidth - 2 };
        };
        const observer = new ResizeObserver(update);
        observer.observe(scroller);
        for (const child of scroller.children) {
            observer.observe(child);
        }
        scroller.addEventListener("scroll", update, { passive: true });
        return () => {
            observer.disconnect();
            scroller.removeEventListener("scroll", update);
        };
    }

    function showCurve(name: string, shown: boolean) {
        hidden = shown ? hidden.filter((other) => other !== name) : [...hidden, name];
        remember();
    }

    function pickLog(pressed: boolean) {
        log = pressed;
        remember();
    }

    /** Draws a shown curve thicker and fades the others while its chip is hovered or focused. */
    function emphasise(name: string, on: boolean) {
        if (!hidden.includes(name)) {
            chart?.dispatchAction({ type: on ? "highlight" : "downplay", seriesName: name });
        }
    }

    function reset() {
        if (!selection || !resettable) {
            return;
        }
        hidden = [];
        zoom = FULL_ZOOM;
        clearDrag();
        store.set({ ...store.current, excluded: withoutKey(store.current.excluded, selection.asset.id) });
        remember();
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

{#snippet yearToggle(curve: Curve, { value, text, name, included, lock }: Chip, props: Record<string, unknown> = {})}
    <!-- A locked year stays focusable for its tooltip, so it is `aria-disabled`, not `disabled`, and its click changes nothing. -->
    <Toggle
        {...props}
        variant="outline"
        size="sm"
        aria-label={name === text ? undefined : name}
        aria-disabled={lock ? "true" : undefined}
        bind:pressed={
            () => included,
            () => {
                if (!lock) {
                    pickYear(curve, value);
                }
            }
        }
        class={[
            "gap-0.75 px-0 tabular-nums pointer-coarse:h-11",
            narrow ? "h-11" : "h-8",
            lock === "unavailable"
                ? "cursor-not-allowed border-dotted data-[state=on]:border-border-input data-[state=on]:bg-background-subtle data-[state=on]:enabled:text-foreground-subtle"
                : "border-border bg-surface text-foreground-subtle not-data-[state=on]:hover:border-border-input not-data-[state=on]:enabled:hover:bg-background-muted data-[state=on]:border-(--chip)/55 data-[state=on]:bg-(--chip)/15 data-[state=on]:enabled:text-foreground",
            lock === "last" && "cursor-not-allowed",
            !lock && "data-[state=on]:hover:border-(--chip)"
        ]}>
        {#if lock === "last"}
            <Lock class="size-2.5 text-foreground-muted" aria-hidden="true" />
        {/if}
        {text}
    </Toggle>
{/snippet}

{#snippet swatch(kind: "actual" | "set" | "plain", on: boolean)}
    <!-- The line in the chart, drawn small: dashed for a year set, thicker for Actual, hollow when hidden. -->
    <span aria-hidden="true" class="flex w-4 shrink-0 gap-0.5">
        {#each kind === "set" ? [0, 1, 2] : [0] as dash (dash)}
            <span
                class={[
                    "flex-1 rounded-full",
                    kind === "actual" ? "h-1.25" : "h-0.75",
                    on ? "bg-(--chip)" : "border border-(--chip) bg-surface"
                ]}>
            </span>
        {/each}
    </span>
{/snippet}

{#snippet yearPanel(curve: Curve, baseYear: number, own: number[])}
    {@const count = yearCount(curve, baseYear, own)}
    <p class="text-xs font-semibold text-foreground-muted tabular-nums">{count.included} of {count.of} included</p>
    <div role="group" aria-label={yearsTitle(curve.name)} class="grid grid-cols-5 gap-1.5">
        {#each chips(curve, baseYear, own) as one (one.value)}
            {#if one.lock}
                <Tooltip
                    content={one.lock === "last" ? "At least one year must stay included" : `${one.text} is not before the Base Year`}
                    portalTarget={root}>
                    {#snippet trigger({ props })}
                        {@render yearToggle(curve, one, props)}
                    {/snippet}
                </Tooltip>
            {:else}
                {@render yearToggle(curve, one)}
            {/if}
        {/each}
    </div>
    <p class="mt-1 border-t border-border-muted pt-2 text-2xs text-foreground-subtle">At least one year must stay included</p>
{/snippet}

{#snippet curveChip(curve: Curve, slot: number, baseYear: number)}
    {@const name = curve.name}
    {@const on = !hidden.includes(name)}
    {@const own = excluded[curve.id] ?? []}
    {@const hover = {
        onmouseenter: () => emphasise(name, true),
        onmouseleave: () => emphasise(name, false),
        onfocus: () => emphasise(name, true),
        onblur: () => emphasise(name, false)
    }}
    <span class="flex shrink-0" style:--chip="var(--chart-{slot})">
        <Tooltip
            content={chipTooltip(curve, baseYear, own).join("\n")}
            class="max-w-72 whitespace-pre-line *:first-line:font-semibold"
            portalTarget={root}>
            {#snippet trigger({ props })}
                <Toggle
                    {...mergeProps(props, hover)}
                    variant="outline"
                    size="sm"
                    aria-label={shortName(name) === name ? undefined : name}
                    bind:pressed={() => on, (next) => showCurve(name, next)}
                    class={[
                        "shrink-0 gap-1 pl-1.75 font-medium pointer-coarse:h-11",
                        "border-border bg-surface text-foreground-subtle not-data-[state=on]:hover:border-border-input not-data-[state=on]:enabled:hover:bg-background-muted",
                        "data-[state=on]:border-(--chip)/45 data-[state=on]:bg-(--chip)/10 data-[state=on]:hover:border-(--chip) data-[state=on]:enabled:text-foreground",
                        curve.years ? "rounded-l-full rounded-r-none pr-1.75" : "rounded-full pr-2.5"
                    ]}>
                    <Check class={on ? "size-3" : "invisible size-3"} aria-hidden="true" />
                    {@render swatch(lineKind(name), on)}
                    {shortName(name)}
                </Toggle>
            {/snippet}
        </Tooltip>
        {#if curve.years}
            {@const count = yearCount(curve, baseYear, own)}
            <Popover
                title={yearsTitle(name)}
                sheet={narrow}
                portalTarget={root}
                bind:open={() => openPanel === curve.id, (open) => setPanel(curve.id, open)}>
                {#snippet actions()}
                    <Button
                        variant="outline"
                        size="sm"
                        class={["pointer-coarse:h-11", narrow && "h-11"]}
                        aria-disabled={own.length === 0}
                        onclick={() => {
                            if (own.length > 0) {
                                setExcluded(curve, []);
                            }
                        }}>
                        Include all
                    </Button>
                {/snippet}
                {#snippet trigger({ props })}
                    <button
                        {...mergeProps(props, hover)}
                        type="button"
                        aria-label="{yearsTitle(name)}: {count.included} of {count.of} included. Edit years"
                        class={[
                            "group -ml-px inline-flex h-7.5 shrink-0 cursor-pointer items-center gap-0.75 rounded-r-full border pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap pointer-coarse:h-11",
                            on
                                ? "border-(--chip)/45 bg-(--chip)/10 text-foreground-muted hover:border-(--chip) aria-expanded:bg-background-muted"
                                : "border-border bg-surface text-foreground-subtle hover:border-border-input"
                        ]}>
                        <span
                            class={[
                                "min-w-7.5 rounded-full border px-1.5 text-center leading-4.5 tabular-nums",
                                count.included < count.of
                                    ? "border-foreground bg-foreground text-surface"
                                    : on
                                      ? "border-(--chip)/45 bg-surface"
                                      : "border-border bg-surface"
                            ]}>
                            {count.included}/{count.of}
                        </span>
                        <ChevronDown class="size-3 transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
                    </button>
                {/snippet}
                <!-- The panel is portalled out of the chip, so it sets the curve colour again. -->
                <div class="flex flex-col gap-2" style:--chip="var(--chart-{slot})">
                    {@render yearPanel(curve, baseYear, own)}
                </div>
            </Popover>
        {/if}
    </span>
{/snippet}

{#snippet helpItem(title: string, text: string)}
    <li><span class="block text-sm font-semibold text-foreground">{title}</span>{text}</li>
{/snippet}

{#snippet help()}
    <Popover
        title="How to use this chart"
        sheet={narrow}
        align="end"
        class={narrow ? undefined : "w-85"}
        portalTarget={root}
        bind:open={() => openPanel === "help", (open) => setPanel("help", open)}>
        {#snippet trigger({ props })}
            <!-- Outside the "Curves" group, last in the row: pushed to the right end, or scrolled to on a narrow card. -->
            <button
                {...props}
                type="button"
                aria-label="How to use this chart"
                class="ml-auto grid size-7.5 shrink-0 cursor-pointer place-items-center rounded-full border border-border-input bg-surface text-sm font-semibold text-foreground hover:bg-muted aria-expanded:border-primary aria-expanded:bg-background pointer-coarse:size-11">
                ?
            </button>
        {/snippet}
        <ul class="grid gap-2 text-xs/normal text-foreground-muted">
            {@render helpItem(
                "Show or hide a line",
                coarse.current ? "Tap its chip." : "Click its chip. Hover a chip to highlight its line."
            )}
            <li>
                <span class="block text-sm font-semibold text-foreground">Change the years</span>
                Open the year badge, for example
                <span class="rounded-full border border-border px-1.5 font-semibold text-foreground tabular-nums">8/10</span>, on Bear,
                Bull, Halving or Decade offsets. This changes the average and loads data again. At least one year stays included.
            </li>
            <li>
                <span class="block text-sm font-semibold text-foreground">Move Actual</span>
                {#if coarse.current}
                    Drag the Actual line.
                {:else}
                    Drag the Actual line, or focus the chart and use
                    <span class="whitespace-nowrap"><Kbd>←</Kbd> <Kbd>→</Kbd> (1 day)</span>
                    or
                    <span class="whitespace-nowrap"><Kbd>↑</Kbd> <Kbd>↓</Kbd> (1 %)</span>.
                {/if}
            </li>
            {@render helpItem("Zoom", "Drag the handles of the slider under the chart.")}
            {@render helpItem("Log scale", "Makes large moves easier to compare.")}
            {@render helpItem(
                "Reset",
                "Shows all lines and includes all years again. It does not change the asset, the Base Year or Log scale."
            )}
        </ul>
    </Popover>
{/snippet}

<!-- Positioned, so panels portalled here are placed from it; floating-ui misplaces them by the admin bar's html margin otherwise. -->
<div bind:this={root} bind:clientWidth={width} class="relative" {@attach readTheme}>
    {#if card}
        <AccessCard feature="Predictive Cycles" {card} />
    {:else}
        <Card padding="none" class="@container flex flex-col">
            {#if selection}
                {@const picked = selection}
                <div class="flex flex-wrap items-end gap-4 border-b border-border-muted px-4 py-5 @lg:px-5">
                    <div class="w-full @2xl:w-auto">
                        <Combobox
                            label="Asset"
                            class="@lg:w-64"
                            searchPlaceholder="Search assets…"
                            items={assets.map((asset) => ({ value: asset.id, label: asset.name, group: asset.group }))}
                            portalTarget={root}
                            value={picked.asset.id}
                            onValueChange={pickAsset} />
                    </div>
                    <div class="flex flex-col items-center gap-1.5">
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
                    <div class="ml-auto flex h-10 items-center gap-2 pointer-coarse:h-11">
                        <Toggle variant="outline" size="md" class="rounded-full" bind:pressed={() => log, pickLog}>Log scale</Toggle>
                        <!-- Below 24rem the row no longer fits on one line, so Reset keeps only its icon. -->
                        <Button
                            variant="outline-fill"
                            size="sm"
                            class="@max-sm:w-9 @max-sm:px-0"
                            aria-label="Reset"
                            aria-disabled={!resettable}
                            onclick={reset}>
                            {#snippet leadingIcon()}
                                <RotateCcw class="size-4" aria-hidden="true" />
                            {/snippet}
                            <span class="@max-sm:sr-only">Reset</span>
                        </Button>
                    </div>
                </div>
            {/if}
            <div class="flex flex-col px-4 pt-4 pb-5 @lg:px-5">
                {#if shown && cutoff && zone !== "none"}
                    <p class="mb-3 text-sm text-foreground-muted">{notice(cutoff)}</p>
                {/if}
                {#if selection}
                    {@const picked = selection}
                    {@const slots = curveSlots(picked.asset.curves.map(({ name }) => name))}
                    <!-- Spans the card's full width, so the fade sits at the card edge; the padding keeps focus rings unclipped. -->
                    <div
                        {@attach edgeFade}
                        class={[
                            "-mx-4 mb-1 flex scroll-px-10 scrollbar-none items-center gap-1 overflow-x-auto px-4 py-1 @lg:-mx-5 @lg:px-5 [&::-webkit-scrollbar]:hidden",
                            fade.left && "mask-l-from-[calc(100%-1.5rem)]",
                            fade.right && "mask-r-from-[calc(100%-2.25rem)]"
                        ]}>
                        <div role="group" aria-label="Curves" class="flex shrink-0 items-center gap-1">
                            {#each chipGroups(picked.asset.curves) as group, index (group[0].id)}
                                {#if index > 0}
                                    <span aria-hidden="true" class="mx-0.75 h-5 w-px shrink-0 bg-border"></span>
                                {/if}
                                {#each group as curve (curve.id)}
                                    {@render curveChip(curve, slots[picked.asset.curves.indexOf(curve)], picked.baseYear)}
                                {/each}
                            {/each}
                        </div>
                        {@render help()}
                    </div>
                {/if}
                {#if failure}
                    {@render problem(failure)}
                {:else if !shown || !option}
                    <div class="flex h-90 items-center justify-center sm:h-120">
                        <Spinner size="lg" tone="muted" label="Loading Predictive Cycles" />
                    </div>
                {:else}
                    <div class="relative" aria-busy={loading ? "true" : undefined}>
                        <Chart
                            {option}
                            bind:chart
                            setOptionOpts={{ replaceMerge: ["series", "yAxis"] }}
                            class={["h-90 w-full rounded-md transition-opacity sm:h-120", loading && "opacity-50"]}
                            role="group"
                            tabindex={0}
                            aria-label="Predictive Cycles chart, {shown.data.id.toUpperCase()}, Base Year {shown.data.base_year}"
                            aria-describedby="{uid}-summary"
                            onkeydown={moveByKey}
                            onfocus={() => (focused = true)}
                            onblur={() => (focused = false)} />
                        {#if loading}
                            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <Spinner size="lg" tone="muted" label="Loading Predictive Cycles" />
                            </div>
                        {:else if noneShown}
                            <p class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-foreground-muted">
                                Select a curve to show
                            </p>
                        {/if}
                    </div>
                    <p id="{uid}-summary" class="sr-only">{chartSummary(shown.data.curves, hidden, shown.data.base_year)}</p>
                    <p aria-live="polite" class="sr-only">{announcement}</p>
                {/if}
            </div>
        </Card>
    {/if}
</div>
