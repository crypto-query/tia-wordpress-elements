import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
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

const texts = (cells: HTMLElement[]) => cells.map((cell) => cell.textContent?.trim());
const part = (index: 0 | 1 | 2) => within(screen.getAllByRole("rowgroup")[index]);
const headers = () => texts(part(0).getAllByRole("columnheader"));
/** One results row under the table: its value per Entry Month. */
function result(label: string) {
    const row = part(2)
        .getAllByRole("row")
        .find((candidate) => within(candidate).queryByRole("rowheader", { name: label }));
    return row ? texts(within(row).getAllByRole("cell")) : [];
}

describe("ForwardReturns", () => {
    it("shows the spinner, then Years as rows and Entry Months as columns", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });

        expect(screen.getByRole("status", { name: "Loading Forward Returns" })).toBeInTheDocument();
        await screen.findByRole("table");

        expect(getForwardReturns).toHaveBeenCalledWith({ base: "btc", quote: "usd", period: 6 }, expect.any(AbortSignal));
        expect(headers()).toEqual(["Year", "Jan", "Jul"]);
        expect(texts(part(1).getAllByRole("rowheader"))).toEqual(["2025", "2024"]);
        expect(texts(part(1).getAllByRole("cell"))).toEqual(["", "", "+3.21%", "\u22122.10%"]);
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
        expect(texts(part(1).getAllByRole("cell"))).toEqual(["+1.00%"]);
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

    it("steps the Entry Offset within its bounds and shows that Entry Month family", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");
        const previous = screen.getByRole("button", { name: "Previous Entry Offset" });
        const next = screen.getByRole("button", { name: "Next Entry Offset" });

        expect(previous).toHaveAttribute("aria-disabled", "true");
        await userEvent.click(next);
        expect(headers()).toEqual(["Year", "Feb", "Aug"]);
        for (let step = 0; step < 4; step++) {
            await userEvent.click(next);
        }
        expect(headers()).toEqual(["Year", "Jun", "Dec"]);
        expect(next).toHaveAttribute("aria-disabled", "true");
        expect(previous).toHaveAttribute("aria-disabled", "false");
    });

    it("hides the Entry Offset arrows for a Monthly Holding Period", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [1] }]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, { boot });
        await screen.findByRole("table");

        expect(screen.queryByRole("button", { name: "Next Entry Offset" })).toBeNull();
        expect(headers()).toEqual(["Year", ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]]);
    });

    it("shows Totals, Wins, Losses and Returns per Entry Month", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");

        expect(part(2).getByRole("columnheader", { name: "Forward Return results" })).toHaveAttribute("colspan", "3");
        expect(result("Totals")).toEqual(["1", "1"]);
        expect(result("Wins")).toEqual(["1", "0"]);
        expect(result("Losses")).toEqual(["0", "1"]);
        expect(result("Returns")).toEqual(["100.00%", "0.00%"]);
    });

    it("a cell click excludes that cell at its own Entry Offset and keeps its value", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");
        const cell = screen.getByRole("checkbox", { name: "+3.21%" });

        await userEvent.click(cell);
        expect(cell).toHaveAttribute("aria-checked", "false");
        expect(cell).toHaveTextContent("+3.21%");
        expect(result("Totals")).toEqual(["0", "1"]);
        expect(result("Returns")).toEqual(["\u2014", "0.00%"]);

        await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
        expect(result("Totals")).toEqual(["0", "0"]);
        await userEvent.click(screen.getByRole("button", { name: "Previous Entry Offset" }));
        expect(screen.getByRole("checkbox", { name: "+3.21%" })).toHaveAttribute("aria-checked", "false");

        await userEvent.click(screen.getByRole("checkbox", { name: "+3.21%" }));
        expect(result("Totals")).toEqual(["1", "1"]);
    });

    it("the Year checkbox excludes the Year and keeps its cell exclusions for when it comes back", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");
        await userEvent.click(screen.getByRole("checkbox", { name: "+3.21%" }));

        await userEvent.click(screen.getByRole("checkbox", { name: "2024" }));
        const loss = screen.getByRole("checkbox", { name: "\u22122.10%" });
        expect(loss).toHaveAttribute("aria-disabled", "true");
        expect(loss).toHaveAttribute("aria-checked", "false");
        await fireEvent.click(loss);
        expect(loss).toHaveAttribute("aria-checked", "false");
        expect(result("Totals")).toEqual(["0", "0"]);

        await userEvent.click(screen.getByRole("checkbox", { name: "2024" }));
        expect(screen.getByRole("checkbox", { name: "+3.21%" })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("checkbox", { name: "\u22122.10%" })).toHaveAttribute("aria-checked", "true");
        expect(result("Totals")).toEqual(["0", "1"]);
    });

    it("shows a Partial cell's value but never counts or toggles it", async () => {
        const next = new Date().getUTCFullYear() + 1;
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue({
            ...data,
            periods: [{ period: 6, returns: [{ year: next, months: [{ month: 1, value: 5 }] }, ...data.periods[0].returns] }]
        });
        render(ForwardReturns, { boot });
        await screen.findByRole("table");

        const partial = screen.getByRole("checkbox", { name: "+5.00%" });
        expect(partial).toHaveAttribute("aria-disabled", "true");
        expect(partial).toHaveAttribute("aria-checked", "false");
        await fireEvent.click(partial);
        expect(partial).toHaveAttribute("aria-checked", "false");
        expect(result("Totals")).toEqual(["1", "1"]);

        expect(partial).not.toHaveClass("text-foreground-muted");
        await userEvent.click(screen.getByRole("checkbox", { name: String(next) }));
        expect(partial).toHaveClass("text-foreground-muted");
    });

    it("Reset includes everything and sets the Entry Offset to 0", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");
        const reset = screen.getByRole("button", { name: "Reset" });
        expect(reset).toHaveAttribute("aria-disabled", "true");

        await userEvent.click(screen.getByRole("checkbox", { name: "+3.21%" }));
        await userEvent.click(screen.getByRole("checkbox", { name: "2025" }));
        await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
        await userEvent.click(reset);

        expect(headers()).toEqual(["Year", "Jan", "Jul"]);
        expect(screen.getByRole("checkbox", { name: "2025" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "+3.21%" })).toHaveAttribute("aria-checked", "true");
        expect(reset).toHaveAttribute("aria-disabled", "true");
        expect(reset).toHaveFocus();
    });

    it("clamps the Entry Offset when the Holding Period gets shorter", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [3, 6] }]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, { boot: { ...boot, attributes: { base: "btc", quote: "usd", period: 6 } } });
        await screen.findByRole("table");
        for (let step = 0; step < 5; step++) {
            await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
        }

        await userEvent.click(screen.getByRole("radio", { name: "Quarterly" }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Mar", "Jun", "Sep", "Dec"]));
        await userEvent.click(screen.getByRole("radio", { name: "Semiannually" }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Mar", "Sep"]));
    });

    it("a hovered Return Cell names its months, its value and what a click does", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, { boot });
        await screen.findByRole("table");
        const cell = screen.getByRole("checkbox", { name: "+3.21%" });

        await userEvent.hover(cell);
        // The Tooltip mounts on pointerenter and opens on the next pointermove, which a real pointer always sends.
        await fireEvent.pointerMove(within(cell).getByText("+3.21%"), { pointerType: "mouse" });

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Jan 2024 \u2013 Jun 2024 \u00b7 +3.21% Click to exclude");
        // Placed against the cell, not left at the panel's unplaced off-screen start.
        await waitFor(() => expect(tooltip.getBoundingClientRect().bottom).toBeCloseTo(cell.getBoundingClientRect().top, -1));
        expect(within(cell).getByText("+3.21%")).not.toHaveAttribute("tabindex");
    });
});
