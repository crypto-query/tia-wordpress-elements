import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { userEvent } from "@vitest/browser/context";
import { getInstanceByDom } from "echarts/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
import { getAssets, getDecennialCycles, type Asset, type DecennialCycles as Data } from "./api";
import DecennialCycles, { memory } from "./DecennialCycles.svelte";
import { todayMarker } from "./transforms";

vi.mock("./api", () => ({ getAssets: vi.fn(), getDecennialCycles: vi.fn() }));

afterEach(() => {
    cleanup();
    memory.set({});
    localStorage.clear();
    vi.mocked(getAssets).mockReset();
    vi.mocked(getDecennialCycles).mockReset();
});

const props = { attributes: { asset: "spx" }, card: null, instance: "1:0" };
const asset = (id: string, name: string, title: string): Asset => ({
    id,
    name,
    title,
    range: { begin: 1897, end: 2025 },
    group: "Indices"
});
const assets = [
    asset("dji", "Dow Jones Industrial - DJI", "Dow Jones Industrial 10-Year Cycle"),
    asset("spx", "S&P 500 - SPX", "S&P 500 10-Year Cycle")
];
const data: Data = {
    id: "spx",
    curve: {
        name: "Gain",
        datapoints: [
            { dec: 0, value: 0 },
            { dec: 5, value: 12.5 },
            { dec: 9.997, value: null }
        ]
    }
};

type Series = { type: string; data: unknown[]; lineStyle: { width: number }; markLine: { data: { xAxis: number }[] } };

const chart = () => screen.findByRole("img", { name: "Decennial Cycles chart, S&P 500 - SPX, 1897–2025" });
const stored = () => memory.current["1:0"]?.pick;

/** Opens the Settings menu, unless it is open, and returns it. */
async function settings() {
    const trigger = screen.getByRole("button", { name: "Settings" });
    if (trigger.getAttribute("aria-expanded") !== "true") {
        await userEvent.click(trigger);
    }
    return screen.findByRole("menu", { name: "Settings" });
}
const reset = async () => within(await settings()).getByRole("menuitem", { name: "Reset" });
const logScale = async () => within(await settings()).getByRole("menuitemcheckbox", { name: "Log scale" });

async function closeMenu() {
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
}

/** Zooms the way the slider does, so the chart sends its `datazoom` event. */
async function zoomTo(start: number, end: number) {
    getInstanceByDom(await screen.findByRole("img", { name: /^Decennial Cycles chart/ }))?.dispatchAction({ type: "dataZoom", start, end });
}

type Zoom = { type: string; start: number; end: number; minValueSpan: number; zoomOnMouseWheel?: boolean; moveOnMouseMove?: boolean };
type XAxis = { name: string; axisLabel: { customValues: number[]; formatter: (value: number) => string } };
const chartOption = async () => getInstanceByDom(await screen.findByRole("img", { name: /^Decennial Cycles chart/ }))?.getOption();

describe("DecennialCycles", () => {
    it("shows the spinner, then the caption, then the chart of the picked asset", async () => {
        let resolve: (value: Data) => void = () => {};
        vi.mocked(getAssets).mockResolvedValue(assets);
        vi.mocked(getDecennialCycles).mockReturnValue(new Promise((done) => (resolve = done)));
        render(DecennialCycles, props);

        expect(screen.getByRole("status", { name: "Loading Decennial Cycles" })).toBeInTheDocument();
        expect(await screen.findByText("S&P 500 10-Year Cycle · 1897–2025")).toBeInTheDocument();
        expect(screen.getByRole("status", { name: "Loading Decennial Cycles" })).toBeInTheDocument();

        resolve(data);
        const group = await chart();
        expect(getDecennialCycles).toHaveBeenCalledWith("spx", expect.any(AbortSignal));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();

        const [series] = getInstanceByDom(group)?.getOption().series as Series[];
        expect(series.data).toEqual([
            [0, 0],
            [5, 12.5],
            [9.997, null]
        ]);
        expect(series.lineStyle.width).toBe(2);
        expect(series.markLine.data[0].xAxis).toBeCloseTo(todayMarker(new Date()).at);
    });

    it("falls back to the first asset for a gone attribute", async () => {
        vi.mocked(getAssets).mockResolvedValue(assets);
        vi.mocked(getDecennialCycles).mockResolvedValue({ ...data, id: "dji" });
        render(DecennialCycles, { ...props, attributes: { asset: "gone" } });

        await screen.findByRole("img", { name: "Decennial Cycles chart, Dow Jones Industrial - DJI, 1897–2025" });
        expect(getDecennialCycles).toHaveBeenCalledWith("dji", expect.any(AbortSignal));
    });

    it("offers Try again when the data is unavailable and reruns only the data step", async () => {
        vi.mocked(getAssets).mockResolvedValue(assets);
        vi.mocked(getDecennialCycles).mockRejectedValueOnce(new ApiError("unavailable")).mockResolvedValue(data);
        render(DecennialCycles, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("This data is not available right now.");
        await fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await chart();
        expect(getAssets).toHaveBeenCalledOnce();
        expect(getDecennialCycles).toHaveBeenCalledTimes(2);
    });

    it("offers Try again for an empty asset list", async () => {
        vi.mocked(getAssets).mockResolvedValueOnce([]).mockResolvedValue(assets);
        vi.mocked(getDecennialCycles).mockResolvedValue(data);
        render(DecennialCycles, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("This data is not available right now.");
        await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await chart();
    });

    it("asks for a reload when access has changed", async () => {
        vi.mocked(getAssets).mockRejectedValue(new ApiError("access"));
        render(DecennialCycles, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("Your access has changed. Reload the page.");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("shows the access card instead of the chart", () => {
        render(DecennialCycles, { ...props, card: { case: "unavailable" } });

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(getAssets).not.toHaveBeenCalled();
    });

    describe("controls and memory", () => {
        async function open(attributes: Record<string, unknown> = { asset: "spx" }, instance: string | null = "1:0") {
            vi.mocked(getAssets).mockResolvedValue(assets);
            vi.mocked(getDecennialCycles).mockImplementation(async (id) => ({ ...data, id }));
            render(DecennialCycles, { ...props, attributes, instance });
            return screen.findByRole("img", { name: /^Decennial Cycles chart/ });
        }

        it("has the grouped Asset select and a Settings menu with Reset and Log scale", async () => {
            await open();
            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            expect(await screen.findByRole("group", { name: "Indices" })).toBeInTheDocument();
            await userEvent.keyboard("{Escape}");

            const menu = await settings();
            expect(within(menu).getByRole("menuitem", { name: "Reset" })).toHaveAttribute("aria-disabled", "true");
            expect(within(menu).getByRole("menuitemcheckbox", { name: "Log scale" })).toHaveAttribute("aria-checked", "false");
        });

        it("zooms x only, by slider and drag, with the wheel off and a window under one year", async () => {
            await open();
            const [inside, slider] = (await chartOption())?.dataZoom as Zoom[];
            expect(inside).toMatchObject({ type: "inside", zoomOnMouseWheel: false, moveOnMouseMove: true });
            expect(slider.type).toBe("slider");
            expect(slider.minValueSpan).toBeLessThan(1);

            await zoomTo(20, 25);
            await waitFor(async () => expect(((await chartOption())?.xAxis as XAxis[])[0].name).toBe("Years ending in 2"));
            const [axis] = (await chartOption())?.xAxis as XAxis[];
            expect(axis.axisLabel.customValues.map(axis.axisLabel.formatter)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
        });

        it("draws Log with asinh, keeps the tooltip and summary in real %, and stores it", async () => {
            const img = await open();
            await userEvent.click(await logScale());
            expect(await logScale()).toHaveAttribute("aria-checked", "true");
            expect(stored()).toMatchObject({ asset: "spx", log: true });
            expect(JSON.parse(localStorage.getItem("tia-elements:decennial-cycles") ?? "null")).toEqual(memory.current);

            const option = await chartOption();
            const [series] = option?.series as Series[];
            expect(series.data[1]).toEqual([5, Math.asinh(12.5)]);
            const [y] = option?.yAxis as XAxis[];
            expect(y.axisLabel.customValues.map(y.axisLabel.formatter)).toContain("20%");

            await zoomTo(45, 55);
            await waitFor(async () => {
                const [fitted] = (await chartOption())?.yAxis as XAxis[];
                expect(fitted.axisLabel.customValues.map(fitted.axisLabel.formatter)).toEqual(["10%", "20%"]);
            });
            expect(img).toHaveAccessibleDescription(
                "Years ending in 0 end at 0.00%, 5 at +12.50%. Low 0.00% on Jan 1 of years ending in 0. High +12.50% on Jan 1 of years ending in 5."
            );
        });

        it("stores the zoom after a pause, and Reset makes it full and stores it, keeping asset and Log", async () => {
            await open();
            await userEvent.click(await logScale());
            await zoomTo(20, 60);
            expect(stored()?.zoom).toEqual({ start: 0, end: 100 });
            await waitFor(() => expect(stored()?.zoom).toEqual({ start: 20, end: 60 }));

            const item = await reset();
            expect(item).toHaveAttribute("aria-disabled", "false");
            await userEvent.click(item);
            expect(stored()).toEqual({ asset: "spx", log: true, zoom: { start: 0, end: 100 } });
            const [, slider] = (await chartOption())?.dataZoom as Zoom[];
            expect(slider).toMatchObject({ start: 0, end: 100 });
            expect(await reset()).toHaveAttribute("aria-disabled", "true");
        });

        it("resets the zoom on an asset change and loads once after quick picks", async () => {
            await open();
            await zoomTo(20, 60);
            for (const name of ["Dow Jones Industrial - DJI", "S&P 500 - SPX", "Dow Jones Industrial - DJI"]) {
                await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
                await userEvent.click(await screen.findByRole("option", { name }));
            }
            expect(stored()).toEqual({ asset: "dji", log: false, zoom: { start: 0, end: 100 } });
            await screen.findByRole("img", { name: "Decennial Cycles chart, Dow Jones Industrial - DJI, 1897–2025" });
            expect(vi.mocked(getDecennialCycles).mock.calls.map(([id]) => id)).toEqual(["spx", "dji"]);
        });

        it("keeps the zoom across Try again", async () => {
            await open();
            await zoomTo(20, 60);
            vi.mocked(getDecennialCycles).mockRejectedValueOnce(new ApiError("unavailable"));
            await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
            await userEvent.click(await screen.findByRole("option", { name: "Dow Jones Industrial - DJI" }));
            await zoomTo(30, 40);

            await screen.findByRole("alert");
            expect(screen.getByText("Dow Jones Industrial 10-Year Cycle · 1897–2025")).toBeInTheDocument();
            await fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
            await screen.findByRole("img", { name: "Decennial Cycles chart, Dow Jones Industrial - DJI, 1897–2025" });
            const [, slider] = (await chartOption())?.dataZoom as Zoom[];
            expect(slider).toMatchObject({ start: 30, end: 40 });
        });

        it("restores the stored view, and drops it when the attribute changed", async () => {
            const pick = { asset: "dji", log: true, zoom: { start: 20, end: 25 } };
            memory.set({ "1:0": { attributes: { asset: "spx" }, pick } });
            await open();
            await screen.findByRole("img", { name: "Decennial Cycles chart, Dow Jones Industrial - DJI, 1897–2025" });
            expect(await logScale()).toHaveAttribute("aria-checked", "true");
            await closeMenu();
            const [, slider] = (await chartOption())?.dataZoom as Zoom[];
            expect(slider).toMatchObject({ start: 20, end: 25 });
            cleanup();

            await open({ asset: "dji" });
            expect(memory.current).toEqual({});
            const [, full] = (await chartOption())?.dataZoom as Zoom[];
            expect(full).toMatchObject({ start: 0, end: 100 });
        });

        it("neither restores nor stores in the editor preview", async () => {
            memory.set({ "1:0": { attributes: { asset: "spx" }, pick: { asset: "dji", log: true, zoom: { start: 20, end: 25 } } } });
            await open({ asset: "spx" }, null);
            await chart();
            await userEvent.click(await logScale());
            expect(memory.current["1:0"]?.pick.asset).toBe("dji");
        });
    });
});
