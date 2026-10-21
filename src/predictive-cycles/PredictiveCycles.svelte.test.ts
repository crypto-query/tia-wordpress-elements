import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { userEvent } from "@vitest/browser/context";
import { Axis, getInstanceByDom } from "echarts/core";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { ApiError } from "../shared/api";
import { formatReturn } from "../shared/format";
import { getAssets, getPredictiveCycles, type Asset, type Cutoff, type DataRequest, type PredictiveCycles as Data } from "./api";
import PredictiveCycles, { memory } from "./PredictiveCycles.svelte";
import { EMPTY_MEMORY } from "./transforms";

vi.mock("./api", () => ({ getAssets: vi.fn(), getPredictiveCycles: vi.fn() }));

afterEach(() => {
    cleanup();
    memory.set(EMPTY_MEMORY);
    localStorage.clear();
    vi.mocked(getAssets).mockReset();
    vi.mocked(getPredictiveCycles).mockReset();
});

const props = { attributes: { baseYear: 2026 }, card: null, instance: "1:0" };
const asset: Asset = {
    id: "btc",
    name: "Bitcoin",
    title: "Bitcoin",
    range: { begin: 2010, end: 2026 },
    base: "btc",
    quote: "usd",
    group: "Crypto",
    base_years: [2026, 2025],
    curves: [
        { id: 0, name: "Actual" },
        { id: 1, name: "All" }
    ]
};
const day = (month: number, date: number) => Date.UTC(2026, month, date);
const data = (cutoff: Cutoff | null): Data => ({
    data: {
        id: "btc",
        base_year: 2026,
        curves: [
            {
                id: 0,
                name: "Actual",
                points: [
                    [day(0, 1), 0.5],
                    [day(6, 1), 4],
                    [day(11, 31), null]
                ]
            },
            {
                id: 1,
                name: "All",
                points: [
                    [day(0, 1), 0],
                    [day(6, 1), 2],
                    [day(11, 31), null]
                ]
            }
        ]
    },
    cutoff
});
const cutoff = (at: number, trial: boolean, source: Cutoff["source"]): Cutoff => ({ at, date: "July 1, 2026", trial, source });

const chart = () => screen.findByRole("group", { name: "Predictive Cycles chart, BTC, Base Year 2026" });
const chip = (name: string) => screen.getByRole("button", { name });

/** Opens the Settings menu, unless it is open, and returns it. */
async function settings() {
    const trigger = screen.getByRole("button", { name: "Settings" });
    if (trigger.getAttribute("aria-expanded") !== "true") {
        await userEvent.click(trigger);
    }
    return screen.findByRole("menu", { name: "Settings" });
}
const action = async (name: "Clear" | "Reset") => within(await settings()).getByRole("menuitem", { name });
const setting = async (name: "Tooltip" | "Axis labels" | "Log scale") => within(await settings()).getByRole("menuitemcheckbox", { name });

async function closeMenu() {
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
}

/** Whether Reset has something to do, read from the menu, which closes again. */
async function resetDisabled() {
    const disabled = (await action("Reset")).getAttribute("aria-disabled");
    await closeMenu();
    return disabled;
}

describe("PredictiveCycles", () => {
    it("shows the spinner, then the chart for the picked asset and Base Year", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getPredictiveCycles).mockResolvedValue(data(null));
        render(PredictiveCycles, props);

        expect(screen.getByRole("status", { name: "Loading Predictive Cycles" })).toBeInTheDocument();
        await chart();

        expect(getPredictiveCycles).toHaveBeenCalledWith(
            { id: "btc", base_year: 2026, curves: [{ id: 0 }, { id: 1 }] },
            expect.any(AbortSignal)
        );
        expect(screen.queryByRole("status", { name: "Loading Predictive Cycles" })).not.toBeInTheDocument();
        expect(screen.queryByText(/cycle projections/)).not.toBeInTheDocument();
    });

    it.each([
        [false, "indicator-suite", day(6, 1), /^Your TIA Indicator Suite subscription includes cycle projections up to July 1, 2026\./],
        [true, "tia-pro", day(6, 1), /^Your free trial includes cycle projections up to July 1, 2026\. .* TIA Pro subscription starts\.$/],
        [false, "tia-pro", Date.UTC(2025, 11, 31), /^Your TIA Pro subscription includes cycle projections up to July 1, 2026\./]
    ] as const)("shows the notice above the chart for trial %s, source %s", async (trial, source, at, text) => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getPredictiveCycles).mockResolvedValue(data(cutoff(at, trial, source)));
        render(PredictiveCycles, props);

        const group = await chart();
        const notice = screen.getByText(text);
        expect(notice.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("shows no notice when the cut-off is on or after the last day", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getPredictiveCycles).mockResolvedValue(data(cutoff(day(11, 31), false, "tia-pro")));
        render(PredictiveCycles, props);

        await chart();
        expect(screen.queryByText(/cycle projections/)).not.toBeInTheDocument();
    });

    it("offers Try again when the data is unavailable and reruns only the data step", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getPredictiveCycles).mockRejectedValueOnce(new ApiError("unavailable")).mockResolvedValue(data(null));
        render(PredictiveCycles, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("This data is not available right now.");
        await fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await chart();
        expect(getAssets).toHaveBeenCalledOnce();
        expect(getPredictiveCycles).toHaveBeenCalledTimes(2);
    });

    it("asks for a reload when access has changed", async () => {
        vi.mocked(getAssets).mockRejectedValue(new ApiError("access"));
        render(PredictiveCycles, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("Your access has changed. Reload the page.");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("shows the access card instead of the chart", async () => {
        render(PredictiveCycles, { ...props, card: { case: "unavailable" } });

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(getAssets).not.toHaveBeenCalled();
    });

    describe("drag", () => {
        type Series = { name: string; data: [number, number | null][]; lineStyle: { width: number } };
        const actualSeries = (group: HTMLElement) =>
            (getInstanceByDom(group)?.getOption().series as Series[]).find(({ name }) => name === "Actual");
        const pointAt = (group: HTMLElement, at: number) => actualSeries(group)?.data.find(([x]) => x === at);
        const announced = (text: string) => screen.findByText(text, { selector: "[aria-live=polite]" });
        // A drag resamples Actual on its own dates, so these curves have a point every day: straight from Jan 1 to Jul 1.
        const ramp = (from: number, to: number) =>
            Array.from({ length: 365 }, (_, index): [number, number | null] => [
                day(0, 1 + index),
                index > 181 ? null : from + ((to - from) * index) / 181
            ]);
        const daily: Data = {
            data: {
                id: "btc",
                base_year: 2026,
                curves: [
                    { id: 0, name: "Actual", points: ramp(0.5, 4) },
                    { id: 1, name: "All", points: ramp(0, 2) }
                ]
            },
            cutoff: null
        };

        async function open(answer = daily) {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getPredictiveCycles).mockResolvedValue(answer);
            render(PredictiveCycles, props);
            return chart();
        }

        it("is one Tab stop after the chips that tells its curves' values, with no visible hint", async () => {
            const group = await open();
            within(screen.getByRole("group", { name: "Curves" }))
                .getAllByRole("button")
                .at(-1)
                ?.focus();
            await userEvent.tab();
            expect(group).toHaveFocus();
            await userEvent.tab();
            expect(group).not.toHaveFocus();

            expect(group).toHaveAccessibleDescription("Jul 1: Actual +4.00%, All +2.00%.");
            expect(screen.queryByText("Drag Actual, or use the arrow keys")).not.toBeInTheDocument();
            expect(screen.queryByRole("table")).not.toBeInTheDocument();
        });

        it("moves Actual a day per left or right key, draws it thicker with focus, and Reset clears it", async () => {
            const group = await open();
            expect(await resetDisabled()).toBe("true");
            expect(actualSeries(group)?.lineStyle.width).toBe(3);
            group.focus();
            await waitFor(() => expect(actualSeries(group)?.lineStyle.width).toBe(4));

            await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowLeft}");
            await announced("Actual moved +3 days, 0.00%");
            expect(actualSeries(group)?.data[0]).toEqual([day(0, 1), null]);
            expect(pointAt(group, day(0, 4))).toEqual([day(0, 4), 0.5]);
            expect(pointAt(group, day(6, 4))).toEqual([day(6, 4), 4]);
            expect(group).toHaveAccessibleDescription("Jul 4: Actual +4.00%.");

            await userEvent.click(await setting("Log scale"));
            await waitFor(() => expect(pointAt(group, day(0, 4))).toEqual([day(0, 4), Math.asinh(0.5)]));
            await closeMenu();

            await waitFor(() => expect(actualSeries(group)?.lineStyle.width).toBe(3));
            await userEvent.click(await action("Reset"));
            await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
            expect(await resetDisabled()).toBe("true");
            await waitFor(() => expect(actualSeries(group)?.data[0]).toEqual([day(0, 1), Math.asinh(0.5)]));
        });

        /** Mouse events at chart pixels, sent where zrender listens. */
        function pointer(group: HTMLElement) {
            const surface = group.querySelector("canvas") ?? group;
            const { left, top } = surface.getBoundingClientRect();
            return (type: string, x: number, y: number) =>
                surface.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: left + x, clientY: top + y }));
        }

        const actualPixel = (group: HTMLElement, at = day(6, 1)) =>
            (getInstanceByDom(group)?.convertToPixel({ gridIndex: 0 }, pointAt(group, at) ?? []) ?? []) as number[];

        /** Presses on Actual's Jul 1 point, moves the pointer by `dx`, `dy` pixels and lets go. */
        async function dragActual(group: HTMLElement, dx: number, dy: number) {
            const [x, y] = actualPixel(group);
            const send = pointer(group);
            send("mousemove", x, y);
            send("mousedown", x, y);
            for (let step = 1; step <= 4; step++) {
                send("mousemove", x + (dx * step) / 4, y + (dy * step) / 4);
            }
            send("mouseup", x + dx, y + dy);
        }

        it("moves every Actual point up or down per key by as many pixels as a day moves it, on both scales", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            group.focus();
            await new Promise((resolve) => setTimeout(resolve, 100));
            const echart = getInstanceByDom(group);
            const dayPixels =
                (echart?.convertToPixel({ xAxisIndex: 0 }, day(0, 2)) ?? 0) - (echart?.convertToPixel({ xAxisIndex: 0 }, day(0, 1)) ?? 0);
            expect(dayPixels).toBeGreaterThan(1);

            // Down first: a move above the top tick would rescale the linear axis under the measurement.
            for (const scale of ["linear", "log"]) {
                if (scale === "log") {
                    await userEvent.click(await setting("Log scale"));
                    await waitFor(() => expect(pointAt(group, day(0, 1))?.[1]).toBeLessThan(0.5));
                    await closeMenu();
                    group.focus();
                }
                // Jan 1 and Jul 1 lie far apart in value, where a uniform % move would differ in pixels on the Log scale.
                const pixels = () => [day(0, 1), day(6, 1)].map((at) => actualPixel(group, at)[1] ?? 0);
                const before = pixels();
                await userEvent.keyboard("{ArrowDown}");
                await waitFor(() => pixels().forEach((y, index) => expect(y - (before[index] ?? 0)).toBeCloseTo(dayPixels, 1)));
                await userEvent.keyboard("{ArrowUp}");
                await waitFor(() => pixels().forEach((y, index) => expect(y).toBeCloseTo(before[index] ?? 0, 1)));
            }
        });

        it("ends the y axis just under a line below 0, not a whole step lower", async () => {
            type YAxis = { min?: number | null; axisLabel: { showMinLabel?: boolean } };
            const yAxis = (group: HTMLElement) => (getInstanceByDom(group)?.getOption().yAxis as YAxis[])[0];
            const group = await open({
                ...daily,
                data: {
                    ...daily.data,
                    curves: [
                        { id: 0, name: "Actual", points: ramp(0.5, 20) },
                        { id: 1, name: "All", points: ramp(-0.3, 2) }
                    ]
                }
            });
            expect(yAxis(group).min).toBeGreaterThan(-1);
            expect(yAxis(group).min).toBeLessThan(-0.3);
            expect(yAxis(group).axisLabel.showMinLabel).toBe(false);

            cleanup();
            const above = await open();
            expect(yAxis(above).min ?? null).toBeNull();
            expect(yAxis(above).axisLabel.showMinLabel).not.toBe(false);
        });

        it("holds the y axis while a key or the mouse moves Actual past the top, and rescales on release", async () => {
            // Its axis ends just under -0.3, off the step; a held axis keeps its ticks where ECharts would count from there.
            const group = await open({
                ...daily,
                data: {
                    ...daily.data,
                    curves: [
                        { id: 0, name: "Actual", points: ramp(0.5, 3.2) },
                        { id: 1, name: "All", points: ramp(-0.3, 2) }
                    ]
                }
            });
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            group.focus();
            await new Promise((resolve) => setTimeout(resolve, 100));
            const echart = getInstanceByDom(group);
            const top = () => echart?.convertFromPixel({ yAxisIndex: 0 }, 16) as number;
            const dayPixels =
                (echart?.convertToPixel({ xAxisIndex: 0 }, day(0, 2)) ?? 0) - (echart?.convertToPixel({ xAxisIndex: 0 }, day(0, 1)) ?? 0);
            const extent = top();
            // The rendered tick values, read from the internal axis model.
            const ticks = () => {
                const axis: unknown = echart?.["getModel"]().getComponent("yAxis", 0)?.axis;
                return axis instanceof Axis ? axis.getTicksCoords().map(({ tickValue }) => tickValue) : [];
            };
            const labels = ticks();
            expect(labels.length).toBeGreaterThan(1);

            for (let press = 0; press < 60; press++) {
                const [, before] = actualPixel(group);
                await fireEvent.keyDown(group, { key: "ArrowUp" });
                await waitFor(() => expect(before - actualPixel(group)[1]).toBeCloseTo(dayPixels, 1));
                expect(top()).toBeCloseTo(extent);
                expect(ticks()).toEqual(labels);
            }
            expect(pointAt(group, day(6, 1))?.[1]).toBeGreaterThan(extent);

            await fireEvent.keyUp(group, { key: "ArrowUp" });
            await waitFor(() => expect(top()).toBeGreaterThan(pointAt(group, day(6, 1))?.[1] ?? Infinity));

            const held = top();
            const heldLabels = ticks();
            const [x, y] = actualPixel(group);
            const send = pointer(group);
            send("mousemove", x, y);
            send("mousedown", x, y);
            send("mousemove", x, 0);
            await waitFor(() => expect(pointAt(group, day(6, 1))?.[1]).toBeGreaterThan(held));
            expect(top()).toBeCloseTo(held);
            expect(ticks()).toEqual(heldLabels);
            send("mouseup", x, 0);
            await waitFor(() => expect(top()).toBeGreaterThan(pointAt(group, day(6, 1))?.[1] ?? Infinity));
        });

        it("shows Actual's moved value and the drag hint over its moved line, and drops the hint off the line", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            group.focus();
            await userEvent.keyboard("{ArrowUp}");
            await screen.findByText(/^Actual moved 0 days, \+\d+\.\d\d%$/, { selector: "[aria-live=polite]" });
            await new Promise((resolve) => setTimeout(resolve, 100));
            const moved = pointAt(group, day(6, 1))?.[1] ?? null;
            expect(moved).toBeGreaterThan(4);

            const [x, y] = actualPixel(group);
            pointer(group)("mousemove", x, y);
            await waitFor(() => expect(within(group).getByText("Jul 1 · day 182")).toBeVisible());
            expect(within(group).getByText(formatReturn(moved))).toBeVisible();
            const hint = within(group).getByText("Drag to move, or use the arrow keys");
            expect(hint).toBeVisible();
            expect(hint.parentElement?.textContent).toContain("Actual");

            pointer(group)("mousemove", x, y + 60);
            await waitFor(() => expect(within(group).queryByText("Drag to move, or use the arrow keys")).not.toBeInTheDocument());
            expect(within(group).getByText("Jul 1 · day 182")).toBeVisible();
        });

        it("turns the chart tooltip off and keeps the drag hint on Actual", async () => {
            const group = await open();
            const tooltip = () => (getInstanceByDom(group)?.getOption().tooltip as { show: boolean }[])[0]?.show;
            expect(tooltip()).toBe(true);

            await userEvent.click(await setting("Tooltip"));
            await waitFor(() => expect(tooltip()).toBe(false));
            expect(memory.current.instances["1:0"]?.pick.tooltip).toBe(false);
            await closeMenu();

            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            await new Promise((resolve) => setTimeout(resolve, 100));
            const [x, y] = actualPixel(group);
            pointer(group)("mousemove", x, y);
            await waitFor(() => expect(within(group).getByText("Drag to move, or use the arrow keys")).toBeVisible());
            const panel = within(group).getByText("Drag to move, or use the arrow keys").parentElement;
            expect(panel?.textContent).toBe("Drag to move, or use the arrow keys");
            expect(panel?.innerHTML).not.toMatch(/Actual|%|mt-2/);

            const visible = () =>
                within(group)
                    .queryAllByText(/ day /)
                    .some((element) => element.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
            pointer(group)("mousemove", x, y + 60);
            await waitFor(() => expect(visible()).toBe(false));
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(visible()).toBe(false);
        });

        type Dot = {
            id: string;
            parentId?: string;
            ignore?: boolean;
            shape: { cx: number; cy: number };
            style: { fill: string; opacity?: number };
        };
        const dots = (group: HTMLElement) =>
            ((getInstanceByDom(group)?.getOption().graphic as { elements: Dot[] }[] | undefined)?.[0]?.elements ?? []).filter(
                ({ parentId, ignore }) => parentId === "pointer-dots" && !ignore
            );

        it("rings each shown line with a value on the hovered day, and drops the rings off the grid", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            await new Promise((resolve) => setTimeout(resolve, 100));
            const [x, y] = actualPixel(group, day(2, 1));
            pointer(group)("mousemove", x, y + 30);
            await waitFor(() => expect(dots(group)).toHaveLength(2));
            expect(dots(group)[0]?.shape.cx).toBeCloseTo(x, 0);
            expect(dots(group)[0]?.shape.cy).toBeCloseTo(y, 0);

            await fireEvent.click(chip("All"));
            await waitFor(() => expect(dots(group)).toHaveLength(1));

            pointer(group)("mousemove", x, 4);
            await waitFor(() => expect(dots(group)).toHaveLength(0));
            // No value after Jul 1, so no ring there.
            pointer(group)("mousemove", actualPixel(group, day(6, 1))[0] + 40, y);
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(dots(group)).toHaveLength(0);
        });

        it("hides the tooltip, its pointer and the rings in the trial zone, and shows them again outside", async () => {
            const group = await open({ ...daily, cutoff: cutoff(day(4, 1), true, "tia-pro") });
            const tooltip = () => (getInstanceByDom(group)?.getOption().tooltip as { showContent: boolean }[])[0]?.showContent;
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            await new Promise((resolve) => setTimeout(resolve, 100));
            const [, y] = actualPixel(group, day(2, 1));
            const send = pointer(group);

            const visible = () =>
                within(group)
                    .queryAllByText(/ day /)
                    .some((element) => element.checkVisibility({ opacityProperty: true, visibilityProperty: true }));

            send("mousemove", actualPixel(group, day(5, 1))[0], y);
            await waitFor(() => expect(tooltip()).toBe(false));
            expect(dots(group)).toHaveLength(0);
            await waitFor(() => expect(visible()).toBe(false), { timeout: 2000 });

            send("mousemove", actualPixel(group, day(2, 1))[0], y);
            await waitFor(() => expect(tooltip()).toBe(true));
            await waitFor(() => expect(dots(group)).toHaveLength(2));
            await waitFor(() => expect(within(group).getByText("Mar 1 · day 60")).toBeVisible());
        });

        it("keeps the trial zone and the cut-off unfaded, and the tooltip inside the chart", async () => {
            type Marked = { markArea?: { blur: { itemStyle: { opacity: number }; label: { opacity: number } } } };
            type Lined = { markLine?: { blur: { lineStyle: { opacity: number } } } };
            const group = await open({ ...daily, cutoff: cutoff(day(4, 1), true, "tia-pro") });
            const option = getInstanceByDom(group)?.getOption();
            const helper = (option?.series as (Marked & Lined)[]).find(({ markArea }) => markArea);
            expect(helper?.markArea?.blur).toEqual({ itemStyle: { opacity: 1 }, label: { opacity: 1 } });
            expect(helper?.markLine?.blur.lineStyle.opacity).toBe(1);
            expect((option?.tooltip as { confine: boolean }[])[0]?.confine).toBe(true);
        });

        it("dims the dots of the curves an emphasised curve fades, and brightens them again on leave", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            await new Promise((resolve) => setTimeout(resolve, 100));
            const [x, y] = actualPixel(group, day(2, 1));
            pointer(group)("mousemove", x, y + 30);
            const opacities = () => dots(group).map(({ style }) => style.opacity ?? 1);
            await waitFor(() => expect(opacities()).toEqual([1, 1]));

            await fireEvent.mouseEnter(chip("All"));
            await waitFor(() => expect(opacities()).toEqual([0.2, 1]));
            // Hiding the emphasised curve still ends its emphasis on leave.
            await fireEvent.click(chip("All"));
            await fireEvent.mouseLeave(chip("All"));
            await waitFor(() => expect(opacities()).toEqual([1]));
        });

        it("hides the tooltip and the dots at once when the Tooltip setting turns off under a still pointer", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            await new Promise((resolve) => setTimeout(resolve, 100));
            const [x, y] = actualPixel(group, day(2, 1));
            pointer(group)("mousemove", x, y + 30);
            await waitFor(() => expect(within(group).getByText("Mar 1 · day 60")).toBeVisible());
            const echart = getInstanceByDom(group);
            if (!echart) {
                throw new Error("no chart");
            }
            const hidden = vi.spyOn(echart, "dispatchAction");

            // By keyboard: a click moves the real pointer, which would leave the chart.
            screen.getByRole("button", { name: "Settings" }).focus();
            await userEvent.keyboard("{Enter}");
            within(await screen.findByRole("menu", { name: "Settings" }))
                .getByRole("menuitemcheckbox", { name: "Tooltip" })
                .focus();
            // The open menu can land under the real pointer, which leaves the chart; the pointer comes back to it.
            pointer(group)("mousemove", x, y + 30);
            await userEvent.keyboard("{Enter}");
            await waitFor(() => expect(hidden).toHaveBeenCalledWith({ type: "hideTip" }));
            expect(dots(group)).toHaveLength(0);
        });

        it("moves Actual with the mouse after the keys moved it, by whole days", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            group.focus();
            await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");
            await new Promise((resolve) => setTimeout(resolve, 100));
            const moved = (pointAt(group, day(6, 1))?.[1] ?? 0) - 4;
            expect(moved).toBeGreaterThan(0);
            await announced(`Actual moved 0 days, ${formatReturn(moved)}`);

            await dragActual(group, 60, 0);
            const text = (await screen.findByText(/^Actual moved \+\d+ days, /, { selector: "[aria-live=polite]" })).textContent;
            expect(text).toMatch(new RegExp(`, \\${formatReturn(moved)}$`));
            const days = Number(/\+(\d+) days/.exec(text ?? "")?.[1]);
            expect(days).toBeGreaterThan(10);
            expect(actualSeries(group)?.data[0]).toEqual([day(0, 1), null]);
            expect(pointAt(group, day(0, 1 + days))?.[1]).toBeCloseTo(0.5 + moved);
        });

        it("does nothing while Actual is hidden", async () => {
            const group = await open();
            await fireEvent.click(chip("Actual"));
            expect(group).toHaveAccessibleDescription("Jul 1: All +2.00%.");

            group.focus();
            await userEvent.keyboard("{ArrowRight}");
            await fireEvent.click(chip("Actual"));
            expect(actualSeries(group)?.data[0]).toEqual([day(0, 1), 0.5]);
        });

        it("clears the drag on a Base Year change", async () => {
            const group = await open();
            group.focus();
            await userEvent.keyboard("{ArrowRight}");
            await announced("Actual moved +1 day, 0.00%");

            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            await fireEvent.click(screen.getByRole("button", { name: "Newer Base Year" }));
            expect(await resetDisabled()).toBe("true");
            expect(screen.queryByText(/^Actual moved/)).not.toBeInTheDocument();
            await waitFor(() => expect(actualSeries(group)?.data[0]).toEqual([day(0, 1), 0.5]));
        });
    });

    describe("controls", () => {
        const eth: Asset = {
            ...asset,
            id: "eth",
            name: "Ethereum",
            title: "Ethereum",
            base_years: [2025, 2024],
            curves: [
                { id: 0, name: "Actual", info: "Actual returns for the year" },
                { id: 1, name: "Bear", info: "Average returns for the bear years", years: [2014, 2018, 2022] },
                { id: 2, name: "Decade offsets", years: [10, 20] }
            ]
        };
        /** BTC's curves, in a server order unlike the chip order. */
        const btc: Asset = {
            ...asset,
            curves: [
                { id: 0, name: "Actual" },
                { id: 1, name: "Bull", years: [2011, 2012, 2013, 2015, 2016, 2017, 2019, 2020, 2021, 2023] },
                { id: 2, name: "All" },
                { id: 3, name: "Y2 Midterm" },
                { id: 4, name: "Bear", years: [2014, 2018, 2022] },
                { id: 5, name: "Y1 Post-election" },
                { id: 6, name: "Halving", years: [2012, 2016, 2020, 2024] },
                { id: 7, name: "Y4 Election" },
                { id: 8, name: "Y3 Pre-election" }
            ]
        };
        const spx: Asset = {
            ...asset,
            id: "spx",
            name: "S&P 500",
            title: "S&P 500",
            curves: [
                { id: 0, name: "Actual" },
                { id: 1, name: "Decade offsets", years: [10, 20, 30, 40, 50, 60, 70, 80] },
                { id: 2, name: "Y1 Post-election" },
                { id: 3, name: "Y2 Midterm" },
                { id: 4, name: "Y3 Pre-election" },
                { id: 5, name: "Y4 Election" },
                { id: 6, name: "20 & 60", static: [20, 60] },
                { id: 7, name: "All" }
            ]
        };
        /** Answers with the requested asset and Base Year, every curve a flat line. */
        const answer = (assets: Asset[], { id, base_year, curves }: DataRequest): Data => ({
            data: {
                id,
                base_year,
                curves: curves.map((curve) => ({
                    id: curve.id,
                    name: assets.find((one) => one.id === id)?.curves[curve.id]?.name ?? "",
                    points: [[Date.UTC(base_year, 0, 1), 1]]
                }))
            },
            cutoff: null
        });
        const lastRequest = () => vi.mocked(getPredictiveCycles).mock.lastCall?.[0];

        async function open(assets: Asset[], attributes: Record<string, unknown> = { baseYear: 2026 }) {
            vi.mocked(getAssets).mockResolvedValue(assets);
            vi.mocked(getPredictiveCycles).mockImplementation(async (request) => answer(assets, request));
            render(PredictiveCycles, { ...props, attributes });
            await screen.findByRole("group", { name: /^Predictive Cycles chart/ });
        }

        it("steps the Base Year by value, disabled at the bounds, and refetches", async () => {
            await open([asset]);
            const older = screen.getByRole("button", { name: "Older Base Year" });
            const newer = screen.getByRole("button", { name: "Newer Base Year" });
            expect(screen.getByRole("status", { name: "Base Year" })).toHaveTextContent("2026");
            expect(newer).toHaveAttribute("aria-disabled", "true");

            await fireEvent.click(older);
            expect(screen.getByRole("status", { name: "Base Year" })).toHaveTextContent("2025");
            expect(older).toHaveAttribute("aria-disabled", "true");
            expect(newer).toHaveAttribute("aria-disabled", "false");
            await screen.findByRole("group", { name: "Predictive Cycles chart, BTC, Base Year 2025" });
            expect(lastRequest()).toMatchObject({ id: "btc", base_year: 2025 });

            await fireEvent.click(older);
            expect(getPredictiveCycles).toHaveBeenCalledTimes(2);
        });

        it("debounces quick picks into one request and aborts the one in flight", async () => {
            await open([{ ...asset, base_years: [2026, 2025, 2024] }]);
            let first: AbortSignal | undefined;
            vi.mocked(getPredictiveCycles).mockImplementationOnce((request, signal) => {
                first = signal;
                return new Promise(() => {});
            });
            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            await waitFor(() => expect(getPredictiveCycles).toHaveBeenCalledTimes(2));
            const busy = () => screen.getByRole("group", { name: /^Predictive Cycles chart/ }).closest("[aria-busy]");
            expect(busy()).toHaveAttribute("aria-busy", "true");

            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            await fireEvent.click(screen.getByRole("button", { name: "Newer Base Year" }));
            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            expect(first?.aborted).toBe(true);
            await screen.findByRole("group", { name: "Predictive Cycles chart, BTC, Base Year 2024" });
            expect(getPredictiveCycles).toHaveBeenCalledTimes(3);
            expect(busy()).toBeNull();
        });

        it("keeps the Base Year by value across assets, else falls back", async () => {
            await open([asset, eth], { baseYear: 2025 });

            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            await userEvent.click(await screen.findByRole("option", { name: "Ethereum" }));
            await screen.findByRole("group", { name: "Predictive Cycles chart, ETH, Base Year 2025" });

            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            await screen.findByRole("group", { name: "Predictive Cycles chart, ETH, Base Year 2024" });
            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            await userEvent.click(await screen.findByRole("option", { name: "Bitcoin" }));
            await screen.findByRole("group", { name: "Predictive Cycles chart, BTC, Base Year 2026" });
        });

        /** The chips' full names in DOM order, with "|" for each divider between groups. */
        const chipRow = () =>
            [...screen.getByRole("group", { name: "Curves" }).children].map((child) => {
                const toggle = child.querySelector("[aria-pressed]");
                return child.getAttribute("aria-hidden") === "true"
                    ? "|"
                    : (toggle?.getAttribute("aria-label") ?? toggle?.textContent.trim());
            });

        it.each([
            [btc, "Actual | All | Y1 Post-election Y2 Midterm Y3 Pre-election Y4 Election | Bear Bull Halving"],
            [spx, "Actual | All 20 & 60 | Y1 Post-election Y2 Midterm Y3 Pre-election Y4 Election | Decade offsets"]
        ])("orders the chips of $id in fixed groups, with short Y names", async (picked, row) => {
            await open([picked]);
            expect(chipRow().join(" ")).toBe(row);
            expect(chip("Y2 Midterm")).toHaveTextContent("Y2 Mid");
            expect(chip("Actual")).toBePressed();
            const help = screen.getByRole("button", { name: "How to use this chart" });
            expect(screen.getByRole("group", { name: "Curves" })).not.toContainElement(help);
            expect(screen.queryByRole("list", { name: "Curves" })).not.toBeInTheDocument();
        });

        it("shows and hides a line with its chip, without a fetch", async () => {
            await open([btc]);
            type Series = { name: string; lineStyle: { type: string; width: number } };
            const series = () =>
                getInstanceByDom(screen.getByRole("group", { name: /^Predictive Cycles chart/ }))?.getOption().series as Series[];
            expect(series().find(({ name }) => name === "Bull")?.lineStyle).toMatchObject({ type: "solid", width: 2 });
            expect(series().find(({ name }) => name === "All")?.lineStyle).toMatchObject({ type: "solid", width: 2 });

            await fireEvent.click(chip("Bull"));
            expect(chip("Bull")).not.toBePressed();
            await waitFor(() => expect(series().map(({ name }) => name)).not.toContain("Bull"));
            await fireEvent.click(chip("Bull"));
            expect(chip("Bull")).toBePressed();
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(getPredictiveCycles).toHaveBeenCalledOnce();
        });

        it("colours each line like its chip while every year of a curve is excluded", async () => {
            // The tokens come from the design system's CSS, which the tests do not load.
            const slots = Array.from({ length: 11 }, (_, index) => `--chart-${index + 1}`);
            slots.forEach((slot, index) => document.documentElement.style.setProperty(slot, `rgb(${index + 1}, 0, 0)`));
            onTestFinished(() => slots.forEach((slot) => document.documentElement.style.removeProperty(slot)));
            memory.set({ ...EMPTY_MEMORY, excluded: { btc: { 4: [2014, 2018, 2022] } } });
            await open([btc]);
            expect(lastRequest()?.curves.map(({ id }) => id)).not.toContain(4);
            type Series = { name?: string; color?: string };
            const group = screen.getByRole("group", { name: /^Predictive Cycles chart/ });
            const lines = (getInstanceByDom(group)?.getOption().series as Series[]).filter(({ name }) => name);
            /** `color` as the browser computes it inside `parent`, so a hex and a `var()` compare. */
            const computed = (parent: Element, color: string) => {
                const probe = parent.appendChild(document.createElement("span"));
                probe.style.color = color;
                const value = getComputedStyle(probe).color;
                probe.remove();
                return value;
            };
            const colours = lines.map(({ name = "", color = "" }) => [computed(chip(name), color), computed(chip(name), "var(--chip)")]);
            expect(lines).toHaveLength(8);
            expect(new Set(colours.map(([line]) => line)).size).toBe(8);
            for (const [line, swatch] of colours) {
                expect(line).toBe(swatch);
            }
        });

        const badge = (name: RegExp) => screen.getByRole("button", { name });
        const years = (name: string) => screen.findByRole("dialog", { name });

        it("opens the year popover from the badge, and a year toggle refetches", async () => {
            await open([btc]);
            const bull = badge(/^Bull years: 10 of 10 included\. Edit years$/);
            expect(bull).toHaveTextContent("10/10");
            expect(bull).toHaveAttribute("aria-expanded", "false");

            await fireEvent.click(bull);
            const dialog = await years("Bull years");
            expect(bull).toHaveAttribute("aria-expanded", "true");
            expect(bull).toHaveAttribute("aria-controls", dialog.id);
            expect(within(dialog).getByText("10 of 10 included")).toBeInTheDocument();
            expect(within(dialog).getByText("At least one year must stay included")).toBeInTheDocument();

            await fireEvent.click(within(dialog).getByRole("button", { name: "2013" }));
            expect(within(dialog).getByRole("button", { name: "2013" })).not.toBePressed();
            expect(within(dialog).getByText("9 of 10 included")).toBeInTheDocument();
            expect(bull).toHaveAccessibleName("Bull years: 9 of 10 included. Edit years");
            await waitFor(() =>
                expect(lastRequest()?.curves[1]).toEqual({ id: 1, years: [2011, 2012, 2015, 2016, 2017, 2019, 2020, 2021, 2023] })
            );
        });

        it("keeps the chips and year badges when the data is unavailable", async () => {
            vi.mocked(getAssets).mockResolvedValue([btc]);
            vi.mocked(getPredictiveCycles).mockRejectedValue(new ApiError("unavailable"));
            render(PredictiveCycles, props);

            expect(await screen.findByRole("alert")).toHaveTextContent("This data is not available right now.");
            expect(screen.getByRole("group", { name: "Curves" })).toContainElement(badge(/^Bull years: 10 of 10 included/));
        });

        it("puts Include all right of the popover title, and includes every year again", async () => {
            await open([btc]);
            await fireEvent.click(badge(/^Bull years/));
            const dialog = await years("Bull years");
            const includeAll = within(dialog).getByRole("button", { name: "Include all" });
            // The header row holds the title and, after it, the action; the layout itself is the design system's to test.
            const title = within(dialog).getByRole("heading", { name: "Bull years" });
            expect(title.parentElement).toContainElement(includeAll);
            expect(title.compareDocumentPosition(includeAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            expect(title.parentElement).not.toContainElement(within(dialog).getByRole("button", { name: "2011" }));
            expect(within(dialog).queryByRole("button", { name: "Only recent 5" })).not.toBeInTheDocument();
            expect(includeAll).toHaveAttribute("aria-disabled", "true");

            await fireEvent.click(within(dialog).getByRole("button", { name: "2013" }));
            await fireEvent.click(within(dialog).getByRole("button", { name: "2016" }));
            expect(within(dialog).getByText("8 of 10 included")).toBeInTheDocument();
            expect(includeAll).toHaveAttribute("aria-disabled", "false");
            await waitFor(() => expect(lastRequest()?.curves[1]?.years).toHaveLength(8));

            await fireEvent.click(includeAll);
            expect(within(dialog).getByText("10 of 10 included")).toBeInTheDocument();
            expect(within(dialog).getByRole("button", { name: "2013" })).toBePressed();
            expect(includeAll).toHaveAttribute("aria-disabled", "true");
            await waitFor(() => expect(lastRequest()?.curves[1]?.years).toHaveLength(10));
        });

        it("closes the year popover when help opens, and the other way round", async () => {
            await open([btc]);
            const help = screen.getByRole("button", { name: "How to use this chart" });
            await fireEvent.click(badge(/^Bull years/));
            await years("Bull years");

            await fireEvent.click(help);
            const panel = await screen.findByRole("dialog", { name: "How to use this chart" });
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bull years" })).not.toBeInTheDocument());
            expect(
                within(panel)
                    .getAllByRole("listitem")
                    .map((item) => item.firstElementChild?.textContent)
            ).toEqual(["Show or hide a line", "Change the years", "Move Actual", "Zoom", "Settings"]);
            expect(within(panel).getAllByText("←")[0].tagName).toBe("KBD");

            await fireEvent.click(badge(/^Bull years/));
            await years("Bull years");
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "How to use this chart" })).not.toBeInTheDocument());
            expect(help).toHaveAttribute("aria-expanded", "false");
        });

        it("returns focus to the trigger on Esc", async () => {
            await open([btc]);
            const help = screen.getByRole("button", { name: "How to use this chart" });
            await userEvent.click(help);
            await screen.findByRole("dialog", { name: "How to use this chart" });
            await userEvent.keyboard("{Escape}");
            await waitFor(() => expect(help).toHaveFocus());

            const bull = badge(/^Bull years/);
            await userEvent.click(bull);
            await years("Bull years");
            await userEvent.keyboard("{Escape}");
            await waitFor(() => expect(bull).toHaveFocus());
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bull years" })).not.toBeInTheDocument());
        });

        it("shows and hides curves locally, never disabled, and asks for one when none shows", async () => {
            await open([asset]);
            const actual = chip("Actual");
            const all = chip("All");
            expect(actual).toBePressed();

            await fireEvent.click(actual);
            await fireEvent.click(all);
            expect(actual).not.toBePressed();
            expect(all).toBeEnabled();
            expect(screen.getByText("Select a curve to show")).toBeInTheDocument();

            await fireEvent.click(all);
            expect(screen.queryByText("Select a curve to show")).not.toBeInTheDocument();
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(getPredictiveCycles).toHaveBeenCalledOnce();
        });

        /** Opens the year popover of the badge named `name` and returns its year toggle getter. */
        async function openYears(name: RegExp, title: string) {
            await fireEvent.click(badge(name));
            const dialog = await years(title);
            return (year: string) => within(dialog).getByRole("button", { name: year });
        }

        it("excludes a year with its toggle, refetches, and keeps the last year included", async () => {
            await open([eth], { baseYear: 2025 });
            const year = await openYears(/^Bear years/, "Bear years");

            await fireEvent.click(year("2018"));
            expect(year("2018")).not.toBePressed();
            await waitFor(() => expect(lastRequest()?.curves[1]).toEqual({ id: 1, years: [2014, 2022] }));

            await fireEvent.click(year("2014"));
            expect(year("2022")).toHaveAttribute("aria-disabled", "true");
            expect(year("2022")).toBeEnabled();
            await fireEvent.click(year("2022"));
            expect(year("2022")).toHaveAttribute("aria-pressed", "true");
            expect(screen.getByText("1 of 3 included")).toBeInTheDocument();
            await waitFor(() => expect(lastRequest()?.curves[1]).toEqual({ id: 1, years: [2022] }));

            await fireEvent.click(year("2018"));
            expect(year("2022")).not.toHaveAttribute("aria-disabled", "true");
        });

        it("makes a year at or after the Base Year unavailable, still sends it, and frees it on a newer Base Year", async () => {
            const halving = { id: 1, name: "Halving", years: [2012, 2016, 2020, 2024] };
            await open([{ ...eth, base_years: [2025, 2024], curves: [eth.curves[0], halving] }], { baseYear: 2024 });
            const year = await openYears(/^Halving years: 3 of 3 included/, "Halving years");
            expect(year("2024")).toHaveAttribute("aria-disabled", "true");
            await userEvent.hover(year("2024"));
            expect(await screen.findByText("2024 is not before the Base Year")).toBeInTheDocument();

            await fireEvent.click(year("2024"));
            await fireEvent.click(year("2012"));
            await fireEvent.click(year("2016"));
            expect(year("2024")).toBePressed();
            expect(year("2020")).toHaveAttribute("aria-disabled", "true");
            await waitFor(() => expect(lastRequest()?.curves[1]).toEqual({ id: 1, years: [2020, 2024] }));

            await fireEvent.click(screen.getByRole("button", { name: "Newer Base Year" }));
            expect(year("2024")).not.toHaveAttribute("aria-disabled");
            expect(year("2020")).not.toHaveAttribute("aria-disabled");
        });

        it("labels decade-offset chips with the year they mean, and relabels on a Base Year change", async () => {
            await open([eth], { baseYear: 2025 });
            const year = await openYears(/^Decade offset years/, "Decade offset years");
            expect(year("2015 (10 years before 2025)")).toHaveTextContent("2015");

            await fireEvent.click(year("2005 (20 years before 2025)"));
            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            expect(year("2014 (10 years before 2024)")).toBePressed();
            expect(year("2004 (20 years before 2024)")).not.toBePressed();
            await waitFor(() =>
                expect(lastRequest()).toMatchObject({ base_year: 2024, curves: [{ id: 0 }, { id: 1 }, { id: 2, years: [10] }] })
            );
        });

        const stored = () => memory.current.instances["1:0"]?.pick;

        /** Zooms the way the slider does, so the chart sends its `datazoom` event. */
        async function zoomTo(start: number, end: number) {
            const group = await screen.findByRole("group", { name: /^Predictive Cycles chart/ });
            getInstanceByDom(group)?.dispatchAction({ type: "dataZoom", start, end });
        }

        it("keeps a hidden curve hidden by name on every asset that has it", async () => {
            await open([asset, eth], { baseYear: 2025 });
            await fireEvent.click(chip("Actual"));

            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            await userEvent.click(await screen.findByRole("option", { name: "Ethereum" }));
            expect(chip("Actual")).not.toBePressed();
            expect(chip("Bear")).toBePressed();
            expect(stored()).toMatchObject({ asset: "eth", baseYear: 2025, hidden: ["Actual"] });
        });

        it("stores the Log scale", async () => {
            await open([asset]);
            const toggle = await setting("Log scale");
            expect(toggle).toHaveAttribute("aria-checked", "false");

            await userEvent.click(toggle);
            expect(toggle).toHaveAttribute("aria-checked", "true");
            expect(screen.getByRole("menu", { name: "Settings" })).toBeInTheDocument();
            expect(stored()?.log).toBe(true);
            expect(JSON.parse(localStorage.getItem("tia-elements:predictive-cycles") ?? "null")).toEqual(memory.current);
        });

        it("opens the Settings menu from the cog before help, with the actions and the Show settings", async () => {
            await open([btc]);
            const trigger = screen.getByRole("button", { name: "Settings" });
            const help = screen.getByRole("button", { name: "How to use this chart" });
            expect(trigger.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            expect(trigger).toHaveAttribute("aria-haspopup", "menu");
            expect(trigger).toHaveAttribute("aria-expanded", "false");

            const menu = await settings();
            expect(trigger).toHaveAttribute("aria-expanded", "true");
            expect(
                within(menu)
                    .getAllByRole("menuitem")
                    .map((item) => item.textContent.trim())
            ).toEqual([expect.stringMatching(/^Clear/), expect.stringMatching(/^Reset/)]);
            expect(
                within(menu)
                    .getAllByRole("menuitemcheckbox")
                    .map((item) => item.getAttribute("aria-checked"))
            ).toEqual(["true", "true", "false"]);
            expect(await setting("Tooltip")).toHaveAccessibleDescription("Values of the day under the pointer.");

            await closeMenu();
            expect(trigger).toHaveFocus();
        });

        it("clears every line but Actual and every year, keeping the drag, and Reset brings them back", async () => {
            await open([btc]);
            const group = await screen.findByRole("group", { name: /^Predictive Cycles chart/ });
            group.focus();
            await userEvent.keyboard("{ArrowRight}");
            await screen.findByText("Actual moved +1 day, 0.00%", { selector: "[aria-live=polite]" });

            await userEvent.click(await action("Clear"));
            await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
            expect(chip("Actual")).toBePressed();
            for (const name of ["All", "Y2 Midterm", "Bear", "Bull", "Halving"]) {
                expect(chip(name)).not.toBePressed();
            }
            expect(badge(/^Bear years/)).toHaveAccessibleName("Bear years: 0 of 3 included. Edit years");
            expect(badge(/^Bear years/)).toHaveTextContent("0/3");
            await waitFor(() => expect(lastRequest()?.curves.map(({ id }) => id)).toEqual([0, 2, 3, 5, 7, 8]));
            expect(screen.getByText("Actual moved +1 day, 0.00%", { selector: "[aria-live=polite]" })).toBeInTheDocument();
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();

            const year = await openYears(/^Bear years/, "Bear years");
            expect(screen.getByText("0 of 3 included")).toBeInTheDocument();
            expect(screen.queryByText("At least one year must stay included")).not.toBeInTheDocument();
            await fireEvent.click(year("2018"));
            await waitFor(() => expect(lastRequest()?.curves).toContainEqual({ id: 4, years: [2018] }));
            await userEvent.keyboard("{Escape}");
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

            await userEvent.click(await action("Reset"));
            expect(chip("All")).toBePressed();
            expect(badge(/^Bull years/)).toHaveTextContent("10/10");
            await waitFor(() => expect(lastRequest()?.curves).toHaveLength(9));
            expect(await resetDisabled()).toBe("true");
        });

        it("hides the axis labels, and keeps it", async () => {
            await open([asset]);
            const group = await screen.findByRole("group", { name: /^Predictive Cycles chart/ });
            type Axis = { axisLabel: { show: boolean } };
            const shows = () => {
                const option = getInstanceByDom(group)?.getOption();
                return [...(option?.xAxis as Axis[]), ...(option?.yAxis as Axis[])].map(({ axisLabel }) => axisLabel.show);
            };
            expect(shows()).toEqual([true, true]);

            await userEvent.click(await setting("Axis labels"));
            await waitFor(() => expect(shows()).toEqual([false, false]));
            await userEvent.click(await setting("Log scale"));
            await waitFor(() => expect(shows()).toEqual([false, false]));
            expect(stored()).toMatchObject({ labels: false, log: true, tooltip: true });
            cleanup();

            await open([asset]);
            expect(await setting("Axis labels")).toHaveAttribute("aria-checked", "false");
            expect(await setting("Tooltip")).toHaveAttribute("aria-checked", "true");
        });

        it("shows the tooltip and the axis labels for a view stored before they existed", async () => {
            const pick = { asset: "btc", baseYear: 2026, hidden: [], log: false, zoom: { start: 0, end: 100 } };
            memory.set({ ...EMPTY_MEMORY, instances: { "1:0": { attributes: { asset: null, baseYear: 2026 }, pick } } });
            await open([asset]);

            expect(await setting("Tooltip")).toHaveAttribute("aria-checked", "true");
            expect(await setting("Axis labels")).toHaveAttribute("aria-checked", "true");
        });

        it("stores the zoom after a pause, keeps it on a Base Year change and resets it on an asset change", async () => {
            await open([asset, eth], { baseYear: 2025 });
            await zoomTo(20, 60);
            expect(stored()).toBeUndefined();
            await waitFor(() => expect(stored()?.zoom).toEqual({ start: 20, end: 60 }));

            await fireEvent.click(screen.getByRole("button", { name: "Newer Base Year" }));
            expect(stored()).toMatchObject({ baseYear: 2026, zoom: { start: 20, end: 60 } });

            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            await userEvent.click(await screen.findByRole("option", { name: "Ethereum" }));
            expect(stored()).toMatchObject({ asset: "eth", zoom: { start: 0, end: 100 } });
        });

        it("restores the stored view, and drops it when the attributes changed", async () => {
            const pick = { asset: "eth", baseYear: 2024, hidden: ["Bear"], log: true, zoom: { start: 10, end: 50 } };
            memory.set({ ...EMPTY_MEMORY, instances: { "1:0": { attributes: { asset: null, baseYear: 2026 }, pick } } });
            await open([asset, eth]);

            await screen.findByRole("group", { name: "Predictive Cycles chart, ETH, Base Year 2024" });
            expect(chip("Bear")).not.toBePressed();
            expect(await setting("Log scale")).toHaveAttribute("aria-checked", "true");
            expect(await resetDisabled()).toBe("false");
            cleanup();

            await open([asset, eth], { baseYear: 2025 });
            await screen.findByRole("group", { name: "Predictive Cycles chart, BTC, Base Year 2025" });
            expect(memory.current.instances).toEqual({});
        });

        it("resets curves, the asset's exclusions and the zoom, and keeps asset, Base Year, Log, Tooltip and Axis labels", async () => {
            memory.set({ ...EMPTY_MEMORY, excluded: { btc: { 1: [2018] } } });
            await open([eth], { baseYear: 2025 });
            expect(await resetDisabled()).toBe("true");

            await userEvent.click(await setting("Log scale"));
            await userEvent.click(await setting("Tooltip"));
            await userEvent.click(await setting("Axis labels"));
            await closeMenu();
            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            expect(await resetDisabled()).toBe("true");

            await fireEvent.click(chip("Actual"));
            const year = await openYears(/^Bear years/, "Bear years");
            await fireEvent.click(year("2018"));
            await zoomTo(20, 60);
            await userEvent.keyboard("{Escape}");
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(await resetDisabled()).toBe("false");

            await userEvent.click(await action("Reset"));
            expect(chip("Actual")).toBePressed();
            expect(badge(/^Bear years/)).toHaveAccessibleName("Bear years: 3 of 3 included. Edit years");
            expect(await resetDisabled()).toBe("true");
            expect(memory.current.excluded).toEqual({ btc: { 1: [2018] } });
            expect(stored()).toEqual({
                asset: "eth",
                baseYear: 2024,
                hidden: [],
                log: true,
                tooltip: false,
                labels: false,
                zoom: { start: 0, end: 100 }
            });
            await waitFor(() =>
                expect(lastRequest()).toMatchObject({
                    base_year: 2024,
                    curves: [{ id: 0 }, { id: 1, years: [2014, 2018, 2022] }, { id: 2 }]
                })
            );
        });

        it("shows a curve hidden on another asset again on Reset", async () => {
            await open([asset, eth], { baseYear: 2025 });
            await fireEvent.click(chip("All"));
            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            await userEvent.click(await screen.findByRole("option", { name: "Ethereum" }));
            expect(await resetDisabled()).toBe("false");

            await userEvent.click(await action("Reset"));
            expect(stored()?.hidden).toEqual([]);
            expect(await resetDisabled()).toBe("true");
        });

        it("shares year exclusions live with the other instances", async () => {
            await open([eth], { baseYear: 2025 });
            render(PredictiveCycles, { ...props, attributes: { baseYear: 2025 }, instance: "1:1" });
            const badges = () => screen.getAllByRole("button", { name: /^Bear years/ });
            await waitFor(() => expect(badges()).toHaveLength(2));

            await fireEvent.click(badges()[0]);
            await fireEvent.click(within(await years("Bear years")).getByRole("button", { name: "2018" }));
            for (const one of badges()) {
                expect(one).toHaveAccessibleName("Bear years: 2 of 3 included. Edit years");
            }
            await waitFor(() =>
                expect(
                    vi.mocked(getPredictiveCycles).mock.calls.filter(([request]) => request.curves[1]?.years?.length === 2)
                ).toHaveLength(2)
            );
            expect(memory.current.excluded).toEqual({ eth: { 1: [2018] } });
        });

        it("explains each curve on its chip with its name, info and years", async () => {
            await open([eth], { baseYear: 2025 });

            chip("Bear").focus();
            const tip = await screen.findByText(/Years: 3 of 3 included/);
            expect(tip).toHaveTextContent("Bear Average returns for the bear years. Years: 3 of 3 included");
            expect(tip.textContent).toMatch(/^Bear\n/);
        });
    });
});
