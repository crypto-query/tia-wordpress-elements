import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { userEvent } from "@vitest/browser/context";
import { getInstanceByDom } from "echarts/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api";
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
        const announced = (text: string) => screen.findByText(text, { selector: "[aria-live=polite]" });

        async function open() {
            vi.mocked(getAssets).mockResolvedValue([asset]);
            vi.mocked(getPredictiveCycles).mockResolvedValue(data(null));
            render(PredictiveCycles, props);
            return chart();
        }

        it("is one Tab stop after the chips that tells its curves' values, with no visible hint", async () => {
            const group = await open();
            screen.getByRole("button", { name: "How to use this chart" }).focus();
            await userEvent.tab();
            expect(group).toHaveFocus();
            await userEvent.tab();
            expect(group).not.toHaveFocus();

            expect(group).toHaveAccessibleDescription("Jul 1: Actual +4.00%, All +2.00%.");
            expect(screen.queryByText("Drag Actual, or use the arrow keys")).not.toBeInTheDocument();
            expect(screen.queryByRole("table")).not.toBeInTheDocument();
        });

        it("moves Actual a day or a percent per arrow key, draws it thicker with focus, and Reset clears it", async () => {
            const group = await open();
            expect(actualSeries(group)?.lineStyle.width).toBe(3);
            group.focus();
            await waitFor(() => expect(actualSeries(group)?.lineStyle.width).toBe(4));
            expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true");

            await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowLeft}{ArrowUp}{ArrowUp}{ArrowDown}");
            await announced("Actual moved +3 days, +1.00%");
            expect(actualSeries(group)?.data.slice(0, 2)).toEqual([
                [day(0, 4), 1.5],
                [day(6, 4), 5]
            ]);
            expect(group).toHaveAccessibleDescription("Jul 1: Actual +4.00%, All +2.00%.");

            await fireEvent.click(screen.getByRole("button", { name: "Log scale" }));
            await waitFor(() => expect(actualSeries(group)?.data[0]).toEqual([day(0, 4), Math.asinh(1.5)]));

            group.blur();
            await waitFor(() => expect(actualSeries(group)?.lineStyle.width).toBe(3));
            await fireEvent.click(screen.getByRole("button", { name: "Reset" }));
            expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true");
            await waitFor(() => expect(actualSeries(group)?.data[0]).toEqual([day(0, 1), Math.asinh(0.5)]));
        });

        /** Mouse events at chart pixels, sent where zrender listens. */
        function pointer(group: HTMLElement) {
            const surface = group.querySelector("canvas") ?? group;
            const { left, top } = surface.getBoundingClientRect();
            return (type: string, x: number, y: number) =>
                surface.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: left + x, clientY: top + y }));
        }

        const actualPixel = (group: HTMLElement) =>
            (getInstanceByDom(group)?.convertToPixel({ gridIndex: 0 }, actualSeries(group)?.data[1] ?? []) ?? []) as number[];

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

        it("shows Actual's real value and the drag hint over its moved line, and drops the hint off the line", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            group.focus();
            await userEvent.keyboard("{ArrowUp}");
            await announced("Actual moved 0 days, +1.00%");
            await new Promise((resolve) => setTimeout(resolve, 100));

            const [x, y] = actualPixel(group);
            pointer(group)("mousemove", x, y);
            await waitFor(() => expect(within(group).getByText("Jul 1 · day 182")).toBeVisible());
            expect(within(group).getByText("+4.00%")).toBeVisible();
            expect(within(group).getByText("Drag to move, or use the arrow keys")).toBeVisible();

            pointer(group)("mousemove", x, y + 60);
            await waitFor(() => expect(within(group).queryByText("Drag to move, or use the arrow keys")).not.toBeInTheDocument());
            expect(within(group).getByText("Jul 1 · day 182")).toBeVisible();
        });

        it("moves Actual with the mouse after the keys moved it, by whole days", async () => {
            const group = await open();
            // The test page has no Tailwind, so the chart gets its size here.
            group.style.height = "360px";
            group.focus();
            await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");
            await announced("Actual moved 0 days, +5.00%");
            await new Promise((resolve) => setTimeout(resolve, 100));

            await dragActual(group, 60, 0);
            const text = (await screen.findByText(/^Actual moved \+\d+ days, \+5\.00%$/, { selector: "[aria-live=polite]" })).textContent;
            const days = Number(/\+(\d+) days/.exec(text ?? "")?.[1]);
            expect(days).toBeGreaterThan(10);
            expect(actualSeries(group)?.data[0]).toEqual([day(0, 1 + days), 5.5]);
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
            await userEvent.keyboard("{ArrowUp}");
            await announced("Actual moved 0 days, +1.00%");

            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            await fireEvent.click(screen.getByRole("button", { name: "Newer Base Year" }));
            expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true");
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
            expect(series().find(({ name }) => name === "Bull")?.lineStyle).toMatchObject({ type: "dashed", width: 2 });
            expect(series().find(({ name }) => name === "All")?.lineStyle).toMatchObject({ type: "solid", width: 2 });

            await fireEvent.click(chip("Bull"));
            expect(chip("Bull")).not.toBePressed();
            await waitFor(() => expect(series().map(({ name }) => name)).not.toContain("Bull"));
            await fireEvent.click(chip("Bull"));
            expect(chip("Bull")).toBePressed();
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(getPredictiveCycles).toHaveBeenCalledOnce();
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
            ).toEqual(["Show or hide a line", "Change the years", "Move Actual", "Zoom", "Log scale", "Reset"]);
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

        const resetButton = () => screen.getByRole("button", { name: "Reset" });
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
            const toggle = screen.getByRole("button", { name: "Log scale" });
            expect(toggle).toHaveAttribute("aria-pressed", "false");

            await fireEvent.click(toggle);
            expect(toggle).toHaveAttribute("aria-pressed", "true");
            expect(stored()?.log).toBe(true);
            expect(JSON.parse(localStorage.getItem("tia-elements:predictive-cycles") ?? "null")).toEqual(memory.current);
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
            expect(screen.getByRole("button", { name: "Log scale" })).toHaveAttribute("aria-pressed", "true");
            expect(resetButton()).toHaveAttribute("aria-disabled", "false");
            cleanup();

            await open([asset, eth], { baseYear: 2025 });
            await screen.findByRole("group", { name: "Predictive Cycles chart, BTC, Base Year 2025" });
            expect(memory.current.instances).toEqual({});
        });

        it("resets curves, the asset's exclusions and the zoom, and keeps asset, Base Year and Log", async () => {
            memory.set({ ...EMPTY_MEMORY, excluded: { btc: { 1: [2018] } } });
            await open([eth], { baseYear: 2025 });
            expect(resetButton()).toHaveAttribute("aria-disabled", "true");

            await fireEvent.click(screen.getByRole("button", { name: "Log scale" }));
            await fireEvent.click(screen.getByRole("button", { name: "Older Base Year" }));
            expect(resetButton()).toHaveAttribute("aria-disabled", "true");

            await fireEvent.click(chip("Actual"));
            const year = await openYears(/^Bear years/, "Bear years");
            await fireEvent.click(year("2018"));
            await zoomTo(20, 60);
            expect(resetButton()).toHaveAttribute("aria-disabled", "false");

            await fireEvent.click(resetButton());
            expect(chip("Actual")).toBePressed();
            expect(year("2018")).toBePressed();
            expect(resetButton()).toHaveAttribute("aria-disabled", "true");
            expect(memory.current.excluded).toEqual({ btc: { 1: [2018] } });
            expect(stored()).toEqual({ asset: "eth", baseYear: 2024, hidden: [], log: true, zoom: { start: 0, end: 100 } });
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
            expect(resetButton()).toHaveAttribute("aria-disabled", "false");

            await fireEvent.click(resetButton());
            expect(stored()?.hidden).toEqual([]);
            expect(resetButton()).toHaveAttribute("aria-disabled", "true");
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
