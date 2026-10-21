import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { userEvent } from "@vitest/browser/context";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
import { getAssets, getForwardReturns, type ForwardReturns as Data, type Selection } from "./api";
import ForwardReturns, { memory, previewMemory } from "./ForwardReturns.svelte";
import { EMPTY_MEMORY } from "./transforms";

vi.mock("./api", () => ({ getAssets: vi.fn(), getForwardReturns: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.mocked(getAssets).mockReset();
    vi.mocked(getForwardReturns).mockReset();
    memory.set(EMPTY_MEMORY);
    previewMemory.set(EMPTY_MEMORY);
    localStorage.clear();
});

const props = { attributes: {}, card: null, instance: "1:0" };
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

/** Opens the Settings menu, unless it is open, and returns it. */
async function settings() {
    const trigger = screen.getByRole("button", { name: "Settings" });
    if (trigger.getAttribute("aria-expanded") !== "true") {
        await userEvent.click(trigger);
    }
    return screen.findByRole("menu", { name: "Settings" });
}
const resetItem = async () => within(await settings()).getByRole("menuitem", { name: "Reset" });
const setting = async (name: "Tooltips" | "Colours") => within(await settings()).getByRole("menuitemcheckbox", { name });

async function closeMenu() {
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
}

/** Whether Reset has something to do, read from the menu, which closes again. */
async function resetDisabled() {
    const disabled = (await resetItem()).getAttribute("aria-disabled");
    await closeMenu();
    return disabled;
}

describe("ForwardReturns", () => {
    it("shows the spinner, then Years as rows and Entry Months as columns", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);

        expect(screen.getByRole("status", { name: "Loading Forward Returns" })).toBeInTheDocument();
        await screen.findByRole("grid");

        expect(getForwardReturns).toHaveBeenCalledWith({ base: "btc", quote: "usd", period: 6 }, expect.any(AbortSignal));
        expect(headers()).toEqual(["Year", "Jan \u2013 Jun", "Jul \u2013 Dec"]);
        expect(texts(part(1).getAllByRole("rowheader"))).toEqual(["2025", "2024"]);
        expect(texts(part(1).getAllByRole("cell"))).toEqual(["", "", "+3.21%", "\u22122.10%"]);
    });

    it("offers Try again on an unavailable step and reruns only that step", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockRejectedValueOnce(new ApiError("unavailable")).mockResolvedValue(data);
        render(ForwardReturns, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("This data is not available right now.");
        await fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await screen.findByRole("grid");
        expect(getAssets).toHaveBeenCalledOnce();
        expect(getForwardReturns).toHaveBeenCalledTimes(2);
    });

    it("asks for a reload when access has changed", async () => {
        vi.mocked(getAssets).mockRejectedValue(new ApiError("access"));
        render(ForwardReturns, props);

        expect(await screen.findByRole("alert")).toHaveTextContent("Your access has changed. Reload the page.");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("keeps the last table dimmed with a spinner while a new Holding Period loads", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        const pending = Promise.withResolvers<Data>();
        vi.mocked(getForwardReturns).mockResolvedValueOnce(data).mockReturnValueOnce(pending.promise);
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        await userEvent.click(screen.getByRole("radio", { name: "Annually" }));

        expect(headers()).toEqual(["Year", "Jan \u2013 Jun", "Jul \u2013 Dec"]);
        expect(screen.getByRole("status", { name: "Loading Forward Returns" })).toBeInTheDocument();
        expect(getForwardReturns).toHaveBeenLastCalledWith({ base: "btc", quote: "usd", period: 12 }, expect.any(AbortSignal));

        pending.resolve(answer({ base: "btc", quote: "usd", period: 12 }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Jan \u2013 Dec"]));
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
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        await userEvent.click(screen.getByRole("radio", { name: "Semiannually" }));
        await userEvent.click(screen.getByRole("radio", { name: "Annually" }));
        expect(vi.mocked(getForwardReturns).mock.calls.at(1)?.[1]?.aborted).toBe(true);

        second.resolve(answer({ base: "btc", quote: "usd", period: 12 }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Jan \u2013 Dec"]));
        first.resolve(answer({ base: "btc", quote: "usd", period: 6 }));
        await first.promise;
        await tick();
        expect(headers()).toEqual(["Year", "Jan \u2013 Dec"]);
    });

    it("the Holding Period toggle picks with arrow keys and keeps its pick on a second click", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [3, 6, 12] }]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const group = screen.getByRole("radiogroup", { name: "Holding Period" });
        const quarterly = within(group).getByRole("radio", { name: "Quarterly" });

        await userEvent.click(quarterly);
        await userEvent.click(quarterly);
        expect(quarterly).toHaveAttribute("aria-checked", "true");
        expect(getForwardReturns).toHaveBeenCalledTimes(1);

        await userEvent.keyboard("{ArrowRight}");
        const semiannually = within(group).getByRole("radio", { name: "Semiannually" });
        expect(semiannually).toHaveFocus();
        expect(semiannually).toHaveAttribute("aria-checked", "true");
        expect(getForwardReturns).toHaveBeenLastCalledWith({ base: "btc", quote: "usd", period: 6 }, expect.any(AbortSignal));
        await waitFor(() => expect(headers()).toEqual(["Year", "Jan \u2013 Jun", "Jul \u2013 Dec"]));
    });

    it("Tab from Asset lands on the picked Holding Period", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [3, 6, 12] }]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, { ...props, attributes: { base: "btc", quote: "usd", period: 12 } });
        await screen.findByRole("grid");

        screen.getByRole("combobox", { name: "Asset" }).focus();
        await userEvent.tab();
        expect(screen.getByRole("radio", { name: "Annually" })).toHaveFocus();
    });

    it("changing asset keeps the Holding Period when the new asset has it, else takes its smallest", async () => {
        vi.mocked(getAssets).mockResolvedValue([
            asset,
            { title: "ETH", base: "eth", quote: "usd", group: "Crypto", periods: [3, 6] },
            { title: "Gold", base: "xau", quote: "usd", group: "Metals", periods: [1, 12] }
        ]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, props);
        await screen.findByRole("grid");
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
        render(ForwardReturns, props);
        await screen.findByRole("grid");

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
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const previous = screen.getByRole("button", { name: "Previous Entry Offset" });
        const next = screen.getByRole("button", { name: "Next Entry Offset" });

        expect(previous).toHaveAttribute("aria-disabled", "true");
        await userEvent.click(next);
        expect(headers()).toEqual(["Year", "Feb \u2013 Jul", "Aug \u2013 Jan"]);
        for (let step = 0; step < 4; step++) {
            await userEvent.click(next);
        }
        expect(headers()).toEqual(["Year", "Jun \u2013 Nov", "Dec \u2013 May"]);
        expect(next).toHaveAttribute("aria-disabled", "true");
        expect(previous).toHaveAttribute("aria-disabled", "false");
    });

    it("hides the Entry Offset arrows for a Monthly Holding Period", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [1] }]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        expect(screen.queryByRole("button", { name: "Next Entry Offset" })).toBeNull();
        expect(headers()).toEqual(["Year", ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]]);
    });

    it("shows Totals, Wins, Losses and Returns per Entry Month", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        expect(part(2).getByRole("columnheader", { name: "Forward Return results" })).toHaveAttribute("colspan", "3");
        expect(result("Totals")).toEqual(["1", "1"]);
        expect(result("Wins")).toEqual(["1", "0"]);
        expect(result("Losses")).toEqual(["0", "1"]);
        expect(result("Returns")).toEqual(["100.00%", "0.00%"]);
    });

    it("a cell click excludes that cell at its own Entry Offset and keeps its value", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const cell = screen.getByRole("checkbox", { name: /\+3\.21%/ });

        await userEvent.click(cell);
        expect(cell).toHaveAttribute("aria-checked", "false");
        expect(cell).toHaveTextContent("+3.21%");
        expect(result("Totals")).toEqual(["0", "1"]);
        expect(result("Returns")).toEqual(["\u2014", "0.00%"]);

        await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
        expect(result("Totals")).toEqual(["0", "0"]);
        await userEvent.click(screen.getByRole("button", { name: "Previous Entry Offset" }));
        expect(screen.getByRole("checkbox", { name: /\+3\.21%/ })).toHaveAttribute("aria-checked", "false");

        await userEvent.click(screen.getByRole("checkbox", { name: /\+3\.21%/ }));
        expect(result("Totals")).toEqual(["1", "1"]);
    });

    it("a click on the year excludes the Year and keeps its cell exclusions for when it comes back", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        await userEvent.click(screen.getByRole("checkbox", { name: /\+3\.21%/ }));

        await userEvent.click(screen.getByRole("checkbox", { name: "Count 2024" }));
        const loss = screen.getByRole("checkbox", { name: /\u22122\.10%/ });
        expect(loss).toHaveAttribute("aria-disabled", "true");
        expect(loss).toHaveAttribute("aria-checked", "false");
        await fireEvent.click(loss);
        expect(loss).toHaveAttribute("aria-checked", "false");
        expect(result("Totals")).toEqual(["0", "0"]);

        await userEvent.click(screen.getByRole("checkbox", { name: "Count 2024" }));
        expect(screen.getByRole("checkbox", { name: /\+3\.21%/ })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("checkbox", { name: /\u22122\.10%/ })).toHaveAttribute("aria-checked", "true");
        expect(result("Totals")).toEqual(["0", "1"]);
    });

    it("shows a Partial cell's value but never counts or toggles it", async () => {
        const next = new Date().getUTCFullYear() + 1;
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue({
            ...data,
            periods: [{ period: 6, returns: [{ year: next, months: [{ month: 1, value: 5 }] }, ...data.periods[0].returns] }]
        });
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        const partial = screen.getByRole("checkbox", { name: /\+5\.00%/ });
        expect(partial).toHaveAttribute("aria-disabled", "true");
        expect(partial).toHaveAttribute("aria-checked", "false");
        await fireEvent.click(partial);
        expect(partial).toHaveAttribute("aria-checked", "false");
        expect(result("Totals")).toEqual(["1", "1"]);
        expect(partial).toHaveClass("border-dashed");

        expect(partial).not.toHaveClass("text-foreground-muted");
        await userEvent.click(screen.getByRole("checkbox", { name: `Count ${next}` }));
        expect(partial).toHaveClass("text-foreground-muted");
    });

    it('opens the help from the "?" after Settings, and Esc closes it and returns focus', async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        const help = screen.getByRole("button", { name: "How to use this table" });
        expect(screen.getByRole("button", { name: "Settings" }).nextElementSibling).toBe(help);
        expect(help).toHaveAttribute("aria-expanded", "false");
        await userEvent.click(help);
        const panel = await screen.findByRole("dialog", { name: "How to use this table" });
        expect(help).toHaveAttribute("aria-expanded", "true");
        expect(help).toHaveAttribute("aria-controls", panel.id);
        expect(
            within(panel)
                .getAllByRole("listitem")
                .map((item) => item.firstElementChild?.textContent)
        ).toEqual(["Exclude a return", "Exclude a year", "Holding Period", "Entry Months", "Partial", "Results", "Keyboard", "Settings"]);
        expect(within(panel).getByText("Space").tagName).toBe("KBD");

        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(help).toHaveFocus());
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "How to use this table" })).not.toBeInTheDocument());
    });

    it("opens the Settings menu from the cog before help, with Reset and the Show settings", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const trigger = screen.getByRole("button", { name: "Settings" });
        expect(trigger).toHaveAttribute("aria-haspopup", "menu");
        expect(trigger).toHaveAttribute("aria-expanded", "false");

        const menu = await settings();
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(
            within(menu)
                .getAllByRole("menuitem")
                .map((item) => item.textContent.trim())
        ).toEqual([expect.stringMatching(/^Reset/)]);
        expect(
            within(menu)
                .getAllByRole("menuitemcheckbox")
                .map((item) => [item.textContent.trim(), item.getAttribute("aria-checked")])
        ).toEqual([
            [expect.stringMatching(/^Tooltips/), "true"],
            [expect.stringMatching(/^Colours/), "true"]
        ]);
        expect(await setting("Colours")).toHaveAccessibleDescription("Green and red fill on returns.");

        await closeMenu();
        expect(trigger).toHaveFocus();
    });

    it("Reset in the menu includes everything and sets the Entry Offset to 0", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        expect(await resetDisabled()).toBe("true");

        await userEvent.click(screen.getByRole("checkbox", { name: /\+3\.21%/ }));
        await userEvent.click(screen.getByRole("checkbox", { name: "Count 2025" }));
        await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
        await userEvent.click(await setting("Colours"));
        expect(await resetDisabled()).toBe("false");
        await userEvent.click(await resetItem());
        await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

        expect(headers()).toEqual(["Year", "Jan \u2013 Jun", "Jul \u2013 Dec"]);
        expect(screen.getByRole("checkbox", { name: "Count 2025" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: /\+3\.21%/ })).toHaveAttribute("aria-checked", "true");
        expect(await resetDisabled()).toBe("true");
        expect(await setting("Colours")).toHaveAttribute("aria-checked", "false");
    });

    it("Tooltips off drops the hover and focus hints and keeps the accessible names", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");

        const toggle = await setting("Tooltips");
        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("menu", { name: "Settings" })).toBeInTheDocument();
        await closeMenu();

        const cell = screen.getByRole("checkbox", { name: "January \u2013 June 2024, +3.21%" });
        await userEvent.hover(cell);
        await fireEvent.pointerMove(within(cell).getByText("+3.21%"), { pointerType: "mouse" });
        const year = screen.getByRole("checkbox", { name: "Count 2024" });
        await userEvent.hover(year);
        await fireEvent.pointerMove(within(year).getByText("2024"), { pointerType: "mouse" });
        const totals = part(2).getByRole("rowheader", { name: "Totals" });
        await userEvent.hover(totals);
        await fireEvent.pointerMove(within(totals).getByText("Totals"), { pointerType: "mouse" });
        cell.focus();
        await userEvent.keyboard("{End}");
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "July \u2013 December 2024, \u22122.10%" })).toHaveFocus();
    });

    it("Colours off drops the fill and keeps the green and red text", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const gain = screen.getByRole("checkbox", { name: /\+3\.21%/ });
        const loss = screen.getByRole("checkbox", { name: /\u22122\.10%/ });
        expect(gain).toHaveClass("bg-success-light", "text-success-strong");
        expect(loss).toHaveClass("bg-error-light", "text-error-strong");

        await userEvent.click(await setting("Colours"));
        expect(gain).not.toHaveClass("bg-success-light");
        expect(gain).toHaveClass("text-success-strong");
        expect(loss).not.toHaveClass("bg-error-light");
        expect(loss).toHaveClass("text-error-strong");
    });

    it("clamps the Entry Offset when the Holding Period gets shorter", async () => {
        vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [3, 6] }]);
        vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
        render(ForwardReturns, { ...props, attributes: { base: "btc", quote: "usd", period: 6 } });
        await screen.findByRole("grid");
        for (let step = 0; step < 5; step++) {
            await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
        }

        await userEvent.click(screen.getByRole("radio", { name: "Quarterly" }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Mar \u2013 May", "Jun \u2013 Aug", "Sep \u2013 Nov", "Dec \u2013 Feb"]));
        await userEvent.click(screen.getByRole("radio", { name: "Semiannually" }));
        await waitFor(() => expect(headers()).toEqual(["Year", "Mar \u2013 Aug", "Sep \u2013 Feb"]));
    });

    it("a hovered year says a click excludes its row, and once excluded that a click includes it", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const year = screen.getByRole("checkbox", { name: "Count 2024" });

        await userEvent.hover(year);
        await fireEvent.pointerMove(within(year).getByText("2024"), { pointerType: "mouse" });
        expect(await screen.findByRole("tooltip")).toHaveTextContent("2024 \u00b7 whole row Click to exclude");

        await userEvent.click(year);
        // A click closes the Tooltip until the pointer leaves and comes back.
        await userEvent.unhover(year);
        await userEvent.hover(year);
        await fireEvent.pointerMove(within(year).getByText("2024"), { pointerType: "mouse" });
        await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("2024 \u00b7 whole row Click to include"));
    });

    it("a hovered Return Cell names its months, its value and what a click does", async () => {
        vi.mocked(getAssets).mockResolvedValue([asset]);
        vi.mocked(getForwardReturns).mockResolvedValue(data);
        render(ForwardReturns, props);
        await screen.findByRole("grid");
        const cell = screen.getByRole("checkbox", { name: /\+3\.21%/ });

        await userEvent.hover(cell);
        // The Tooltip mounts on pointerenter and opens on the next pointermove, which a real pointer always sends.
        await fireEvent.pointerMove(within(cell).getByText("+3.21%"), { pointerType: "mouse" });

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Jan 2024 \u2013 Jun 2024 \u00b7 +3.21% Click to exclude");
        // Placed against the cell, not left at the panel's unplaced off-screen start.
        await waitFor(() => expect(tooltip.getBoundingClientRect().bottom).toBeCloseTo(cell.getBoundingClientRect().top, -1));
        expect(within(cell).getByText("+3.21%")).not.toHaveAttribute("tabindex");
    });

    describe("keyboard grid", () => {
        const focused = () => document.activeElement;
        const press = (key: string) => userEvent.keyboard(`{${key}}`);
        async function tabIntoGrid() {
            screen.getByRole("button", { name: "How to use this table" }).focus();
            await userEvent.tab();
        }

        it("names each Return Cell with its full months and value, and says why it cannot count", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            render(ForwardReturns, props);
            await screen.findByRole("grid", { name: "Forward Returns" });

            expect(screen.getByRole("checkbox", { name: "January \u2013 June 2024, +3.21%" })).toBeInTheDocument();
            await userEvent.click(screen.getByRole("checkbox", { name: "Count 2024" }));
            const excluded = screen.getByRole("checkbox", { name: "July \u2013 December 2024, \u22122.10%, 2024 is excluded" });
            expect(excluded).toHaveAttribute("aria-disabled", "true");
            await userEvent.keyboard("{End}");
            expect(document.activeElement).toBe(excluded);
        });

        it("is one Tab stop that arrows, Home and End move through, into the header row and back", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            render(ForwardReturns, props);
            const grid = await screen.findByRole("grid");
            const previous = screen.getByRole("button", { name: "Previous Entry Offset" });
            const gain = screen.getByRole("checkbox", { name: /\+3\.21%/ });

            await tabIntoGrid();
            expect(focused()).toBe(previous);
            await press("ArrowRight");
            expect(focused()).toBe(screen.getByRole("button", { name: "Next Entry Offset" }));
            await press("ArrowRight");
            const january = part(0).getByRole("columnheader", { name: "Jan \u2013 Jun" });
            expect(focused()).toBe(january);
            // 2025 has no January cell, so Down skips to 2024's.
            await press("ArrowDown");
            expect(focused()).toBe(gain);
            await press("ArrowUp");
            expect(focused()).toBe(january);
            await press("ArrowDown");

            await press("End");
            const loss = screen.getByRole("checkbox", { name: /\u22122\.10%/ });
            expect(focused()).toBe(loss);
            await press("Home");
            expect(focused()).toBe(screen.getByRole("checkbox", { name: "Count 2024" }));
            await press("ArrowUp");
            expect(focused()).toBe(screen.getByRole("checkbox", { name: "Count 2025" }));
            await press("ArrowUp");
            expect(focused()).toBe(previous);

            await press("ArrowDown");
            await press("ArrowDown");
            await press("ArrowRight");
            expect(focused()).toBe(gain);
            expect([...grid.querySelectorAll('[tabindex="0"]')]).toEqual([gain]);
            await userEvent.tab();
            expect(grid.contains(focused())).toBe(false);
            await tabIntoGrid();
            expect(focused()).toBe(gain);
        });

        it("Space toggles the focused Return Cell and Year", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            render(ForwardReturns, props);
            await screen.findByRole("grid");
            const gain = screen.getByRole("checkbox", { name: /\+3\.21%/ });

            gain.focus();
            await press("Space");
            expect(gain).toHaveAttribute("aria-checked", "false");
            expect(result("Totals")).toEqual(["0", "1"]);
            await press("Home");
            const year = screen.getByRole("checkbox", { name: "Count 2024" });
            expect(focused()).toBe(year);
            await press("Space");
            expect(year).not.toBeChecked();
            expect(result("Totals")).toEqual(["0", "0"]);
            await press("Space");
            expect(year).toBeChecked();
            expect(result("Totals")).toEqual(["0", "1"]);
        });

        it("keeps a Partial cell reachable but never toggles it", async () => {
            const next = new Date().getUTCFullYear() + 1;
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue({
                ...data,
                periods: [{ period: 6, returns: [{ year: next, months: [{ month: 1, value: 5 }] }, ...data.periods[0].returns] }]
            });
            render(ForwardReturns, props);
            await screen.findByRole("grid");
            const partial = screen.getByRole("checkbox", { name: `January \u2013 June ${next}, +5.00%, Partial` });

            part(0).getByRole("columnheader", { name: "Jan \u2013 Jun" }).focus();
            await press("ArrowDown");
            expect(focused()).toBe(partial);
            expect(partial).toHaveAttribute("aria-disabled", "true");
            await press("Space");
            expect(partial).toHaveAttribute("aria-checked", "false");
        });

        it("keeps a bound Entry Offset arrow focused and starts at the first Entry Month without arrows", async () => {
            vi.mocked(getAssets).mockResolvedValue([{ ...asset, periods: [1, 6] }]);
            vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
            render(ForwardReturns, { ...props, attributes: { base: "btc", quote: "usd", period: 6 } });
            await screen.findByRole("grid");

            await tabIntoGrid();
            await press("Space");
            expect(focused()).toBe(screen.getByRole("button", { name: "Previous Entry Offset" }));

            await userEvent.click(screen.getByRole("radio", { name: "Monthly" }));
            await waitFor(() => expect(headers()).toHaveLength(13));
            await tabIntoGrid();
            expect(focused()).toBe(part(0).getByRole("columnheader", { name: "Jan" }));
        });

        it("opens the hint of a Return Cell reached by keyboard", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            render(ForwardReturns, props);
            await screen.findByRole("grid");

            screen.getByRole("checkbox", { name: /\+3\.21%/ }).focus();
            await press("End");
            expect(await screen.findByRole("tooltip")).toHaveTextContent("Jul 2024 \u2013 Dec 2024 \u00b7 \u22122.10% Click to exclude");
        });
    });

    describe("memory", () => {
        const unset = { base: null, quote: null, period: null };
        const stored = (attributes: Record<string, unknown>) => ({
            excluded: {},
            instances: { "1:0": { attributes, pick: { base: "btc", quote: "usd", period: 12, entryOffset: 2 } } }
        });

        it("restores the stored asset, Holding Period and Entry Offset", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
            memory.set(stored(unset));
            render(ForwardReturns, props);
            await screen.findByRole("grid");

            expect(getForwardReturns).toHaveBeenCalledWith({ base: "btc", quote: "usd", period: 12 }, expect.any(AbortSignal));
            expect(headers()).toEqual(["Year", "Mar \u2013 Feb"]);
        });

        it("drops the stored pick when an attribute changed since it was stored", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
            memory.set(stored(unset));
            render(ForwardReturns, { ...props, attributes: { base: "btc", quote: "usd", period: 6 } });
            await screen.findByRole("grid");

            expect(getForwardReturns).toHaveBeenCalledWith({ base: "btc", quote: "usd", period: 6 }, expect.any(AbortSignal));
            expect(headers()).toEqual(["Year", "Jan \u2013 Jun", "Jul \u2013 Dec"]);
            expect(memory.current.instances).toEqual({});
        });

        it("stores a user pick with the attribute values it was made under", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            render(ForwardReturns, { ...props, attributes: { base: "btc", quote: "usd" } });
            await screen.findByRole("grid");
            expect(memory.current.instances).toEqual({});

            await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
            expect(memory.current.instances["1:0"]).toEqual({
                attributes: { base: "btc", quote: "usd", period: null },
                pick: { base: "btc", quote: "usd", period: 6, entryOffset: 1, tooltips: true, colours: true }
            });
            expect(JSON.parse(localStorage.getItem("tia-elements:forward-returns") ?? "null")).toEqual(memory.current);
        });

        it("stores Tooltips and Colours and restores them on the next mount", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            render(ForwardReturns, props);
            await screen.findByRole("grid");

            await userEvent.click(await setting("Tooltips"));
            await userEvent.click(await setting("Colours"));
            expect(memory.current.instances["1:0"]?.pick).toMatchObject({ tooltips: false, colours: false });
            cleanup();

            render(ForwardReturns, props);
            await screen.findByRole("grid");
            expect(screen.getByRole("checkbox", { name: /\+3\.21%/ })).not.toHaveClass("bg-success-light");
            expect(await setting("Tooltips")).toHaveAttribute("aria-checked", "false");
            expect(await setting("Colours")).toHaveAttribute("aria-checked", "false");
        });

        it("shows Tooltips and Colours for a pick stored before they existed", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockImplementation(async (selection) => answer(selection));
            memory.set(stored(unset));
            render(ForwardReturns, props);
            await screen.findByRole("grid");

            expect(await setting("Tooltips")).toHaveAttribute("aria-checked", "true");
            expect(await setting("Colours")).toHaveAttribute("aria-checked", "true");
        });

        it("shows exclusions live in a second instance and stores them", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            const first = within(render(ForwardReturns, props).container);
            const second = within(render(ForwardReturns, { ...props, instance: "1:1" }).container);
            await first.findByRole("grid");
            await second.findByRole("grid");

            await userEvent.click(first.getByRole("checkbox", { name: /\+3\.21%/ }));
            expect(second.getByRole("checkbox", { name: /\+3\.21%/ })).toHaveAttribute("aria-checked", "false");
            expect(memory.current.excluded).toEqual({ "btc/usd/6": { years: [], cells: ["2024-1"] } });

            await userEvent.click(second.getByRole("checkbox", { name: /\+3\.21%/ }));
            expect(first.getByRole("checkbox", { name: /\+3\.21%/ })).toHaveAttribute("aria-checked", "true");
            expect(memory.current.excluded).toEqual({});
        });

        it("neither reads nor writes a pick in the editor preview", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            memory.set(stored(unset));
            render(ForwardReturns, { ...props, instance: null });
            await screen.findByRole("grid");
            expect(headers()).toEqual(["Year", "Jan \u2013 Jun", "Jul \u2013 Dec"]);

            await userEvent.click(screen.getByRole("button", { name: "Next Entry Offset" }));
            await userEvent.click(screen.getByRole("radio", { name: "Annually" }));
            expect(memory.current).toEqual(stored(unset));
        });

        it("keeps the editor preview's exclusions apart from the site's", async () => {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getForwardReturns).mockResolvedValue(data);
            const site = { excluded: { "btc/usd/6": { years: [], cells: ["2024-7"] } }, instances: {} };
            memory.set(site);
            render(ForwardReturns, { ...props, instance: null });
            await screen.findByRole("grid");
            expect(screen.getByRole("checkbox", { name: /\u22122\.10%/ })).toHaveAttribute("aria-checked", "true");

            await userEvent.click(screen.getByRole("checkbox", { name: /\+3\.21%/ }));
            expect(screen.getByRole("checkbox", { name: /\+3\.21%/ })).toHaveAttribute("aria-checked", "false");
            expect(memory.current).toEqual(site);
            expect(localStorage.getItem("tia-elements:forward-returns")).toBe(JSON.stringify(site));
        });
    });
});
