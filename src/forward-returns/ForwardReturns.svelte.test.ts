import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
import type { Boot } from "../shared/boot";
import { getAssets, getForwardReturns } from "./api";
import ForwardReturns from "./ForwardReturns.svelte";

vi.mock("./api", () => ({ getAssets: vi.fn(), getForwardReturns: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.mocked(getAssets).mockReset();
    vi.mocked(getForwardReturns).mockReset();
});

const boot: Boot = { attributes: {}, rest: { root: "/wp-json/", nonce: "n" }, card: null, instance: "1:0" };
const asset = { title: "BTC", base: "btc", quote: "usd", periods: [6, 12] };
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

describe("ForwardReturns", () => {
    it("shows the spinner, then Years as rows and Entry Months as columns", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });

        expect(screen.getByRole("status", { name: "Loading Forward Returns" })).toBeInTheDocument();
        await screen.findByRole("table");

        expect(getForwardReturns).toHaveBeenCalledWith({ base: "btc", quote: "usd", period: 6 });
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
});
