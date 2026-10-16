import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
import { getAssets, getPredictiveCycles, type Asset, type Cutoff, type PredictiveCycles as Data } from "./api";
import PredictiveCycles from "./PredictiveCycles.svelte";

vi.mock("./api", () => ({ getAssets: vi.fn(), getPredictiveCycles: vi.fn() }));

afterEach(() => {
    cleanup();
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

describe("PredictiveCycles", () => {
    it("shows the spinner, then the chart for the picked asset and Base Year", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getPredictiveCycles).mockResolvedValue(data(null));
        render(PredictiveCycles, props);

        expect(screen.getByRole("status", { name: "Loading Predictive Cycles" })).toBeInTheDocument();
        await chart();

        expect(getPredictiveCycles).toHaveBeenCalledWith({ asset, baseYear: 2026 }, expect.any(AbortSignal));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
});
