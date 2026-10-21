import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { getInstanceByDom } from "echarts/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
import { getAssets, getDecennialCycles, type Asset, type DecennialCycles as Data } from "./api";
import DecennialCycles from "./DecennialCycles.svelte";
import { todayMarker } from "./transforms";

vi.mock("./api", () => ({ getAssets: vi.fn(), getDecennialCycles: vi.fn() }));

afterEach(() => {
    cleanup();
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
});
