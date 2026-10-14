import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { userEvent } from "@vitest/browser/context";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
import type { Boot } from "../shared/boot";
import { getAssets, getForwardReturns, type ForwardReturns as Data, type Selection } from "./api";
import ForwardReturns from "./ForwardReturns.svelte";

vi.mock("./api", () => ({ getAssets: vi.fn(), getForwardReturns: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.mocked(getAssets).mockReset();
    vi.mocked(getForwardReturns).mockReset();
});

const boot: Boot = { attributes: {}, rest: { root: "/wp-json/", nonce: "n" }, card: null, instance: "1:0" };
const asset = { title: "BTC", base: "btc", quote: "usd", group: "Crypto", periods: [6, 12] };
const data = {
    title: "BTC",
    base: "btc",
    quote: "usd",
    periods: [
        {
            period: 6,
            returns: [
                { year: 2025, months: [{ month: 1, value: null }] },
                {
                    year: 2024,
                    months: [
                        { month: 1, value: 3.21 },
                        { month: 7, value: -2.1 }
                    ]
                }
            ]
        }
    ]
};

/** One row for `period`, so the headers show which answer is on screen. */
const answer = ({ base, quote, period }: Selection): Data => ({
    title: base,
    base,
    quote,
    periods: [{ period, returns: [{ year: 2024, months: [{ month: 1, value: 1 }] }] }]
});

const headers = () => screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim());

describe("ForwardReturns", () => {
    it("shows the spinner, then Years as rows and Entry Months as columns", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });

        expect(screen.getByRole("status", { name: "Loading Forward Returns" })).toBeInTheDocument();
        await screen.findByRole("table");

        expect(getForwardReturns).toHaveBeenCalledWith({ base: "btc", quote: "usd", period: 6 }, expect.any(AbortSignal));
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim())).toEqual(["Year", "Jan", "Jul"]);
        expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent?.trim())).toEqual(["2025", "2024"]);
        expect(screen.getAllByRole("cell").map((cell) => cell.textContent?.trim())).toEqual(["", "", "+3.21%", "\u22122.10%"]);
    });

    it("offers Try again on an unavailable step and reruns only that step", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockRejectedValueOnce(new ApiError("unavailable")).mockResolvedValue(data);
        render(ForwardReturns, { boot });

        expect(await screen.findByRole("alert")).toHaveTextContent("This data is not available right now.");
        await fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await screen.findByRole("table");
        expect(getAssets).toHaveBeenCalledOnce();
        expect(getForwardReturns).toHaveBeenCalledTimes(2);
    });

    it("asks for a reload when access has changed", async () => {
        vi.mocked(getAssets).mockRejectedValue(new ApiError("access"));
        render(ForwardReturns, { boot });

        expect(await screen.findByRole("alert")).toHaveTextContent("Your access has changed. Reload the page.");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("keeps the last table dimmed with a spinner while a new Holding Period loads", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        const pending = Promise.withResolvers<Data>();
        vi.mocked(getForwardReturns).mockResolvedValueOnce(data).mockReturnValueOnce(pending.promise);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");

        await userEvent.click(screen.getByRole("radio", { name: "Annually" }));

        expect(headers()).toEqual(["Year", "Jan", "Jul"]);
        expect(screen.getByRole("status", { name: "Loading Forward Returns" })).toBeInTheDocument();
        expect(getForwardReturns).toHaveBeenLastCalledWith({ base: "btc", quote: "usd", period: 12 }, expect.any(AbortSignal));

        pending.resolve(answer({ base: "btc", quote: "usd", period: 12 }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Jan"]));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("a newer pick aborts the older request and its late answer is not shown", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [3, 6, 12] }]);
        const first = Promise.withResolvers<Data>();
        const second = Promise.withResolvers<Data>();
        vi.mocked(getForwardReturns)
            .mockResolvedValueOnce(answer({ base: "btc", quote: "usd", period: 3 }))
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");

        await userEvent.click(screen.getByRole("radio", { name: "Semiannually" }));
        await userEvent.click(screen.getByRole("radio", { name: "Annually" }));
        expect(vi.mocked(getForwardReturns).mock.calls.at(1)?.[1]?.aborted).toBe(true);

        second.resolve(answer({ base: "btc", quote: "usd", period: 12 }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Jan"]));
        first.resolve(answer({ base: "btc", quote: "usd", period: 6 }));
        await first.promise;
        await tick();
        expect(headers()).toEqual(["Year", "Jan"]);
    });

    it("changing asset keeps the Holding Period when the new asset has it, else takes its smallest", async () => {
        vi.mocked(getAssets).mockResolvedValue([
            asset,
            { title: "ETH", base: "eth", quote: "usd", group: "Crypto", periods: [3, 6] },
            { title: "Gold", base: "xau", quote: "usd", group: "Metals", periods: [1, 12] }
        ]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, { boot });
        await screen.findByRole("table");
        const select = () => screen.getByRole("combobox", { name: "Asset" });

        await userEvent.click(select());
        expect(await screen.findByText("Crypto")).toBeInTheDocument();
        expect(screen.getByText("Metals")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("option", { name: "ETH" }));
        expect(getForwardReturns).toHaveBeenLastCalledWith({ base: "eth", quote: "usd", period: 6 }, expect.any(AbortSignal));

        await userEvent.click(select());
        await userEvent.click(await screen.findByRole("option", { name: "Gold" }));
        expect(getForwardReturns).toHaveBeenLastCalledWith({ base: "xau", quote: "usd", period: 1 }, expect.any(AbortSignal));
    });

    it("typing in the asset search filters the list, and picking the filtered row changes the asset", async () => {
        vi.mocked(getAssets).mockResolvedValue([
            asset,
            { title: "ETH", base: "eth", quote: "usd", group: "Crypto", periods: [3, 6] },
            { title: "Gold", base: "xau", quote: "usd", group: "Metals", periods: [1, 12] }
        ]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, { boot });
        await screen.findByRole("table");

        await userEvent.click(screen.getByRole("combobox", { name: "Asset" }));
        await userEvent.type(await screen.findByRole("combobox", { name: "Search assets…" }), "eth");

        await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent?.trim())).toEqual(["ETH"]));
        expect(screen.queryByRole("group", { name: "Metals" })).toBeNull();
        await userEvent.click(screen.getByRole("option", { name: "ETH" }));
        expect(getForwardReturns).toHaveBeenLastCalledWith({ base: "eth", quote: "usd", period: 6 }, expect.any(AbortSignal));
    });
});
