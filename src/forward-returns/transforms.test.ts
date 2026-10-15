import { describe, expect, it } from "vitest";
import type { Asset, YearReturns } from "./api";
import {
    assetKey,
    cellKey,
    cellState,
    cellValue,
    columnResults,
    entryMonths,
    formatRate,
    formatReturn,
    isPartial,
    periodOptions,
    periodLabel,
    pickSelection,
    selectAsset,
    toggle,
    toneOf,
    type Exclusions
} from "./transforms";

const assets: Asset[] = [
    { title: "BTC", base: "btc", quote: "usd", group: "Crypto", periods: [1, 3, 6, 12] },
    { title: "Gold", base: "xauusd", quote: "usd", group: "Metals", periods: [3, 12] },
    { title: "Dow Jones", base: "^dji", quote: "usd", group: "Indices", periods: [6, 12] }
];

describe("selectAsset", () => {
    it("keeps the Holding Period when the new asset has it", () => {
        expect(selectAsset(assets[1], 12)).toEqual({ base: "xauusd", quote: "usd", period: 12 });
    });

    it("takes the smallest Holding Period when the new asset lacks it", () => {
        expect(selectAsset(assets[2], 3)).toEqual({ base: "^dji", quote: "usd", period: 6 });
    });

    it("has no selection for an asset without periods", () => {
        expect(selectAsset({ ...assets[0], periods: [] }, 1)).toBeNull();
    });
});

describe("periodOptions", () => {
    it("names the asset's Holding Periods and leaves out 24", () => {
        expect(periodOptions({ ...assets[0], periods: [1, 3, 6, 12, 24] })).toEqual([
            { value: "1", label: "Monthly" },
            { value: "3", label: "Quarterly" },
            { value: "6", label: "Semiannually" },
            { value: "12", label: "Annually" }
        ]);
    });
});

describe("assetKey", () => {
    it("keys an asset by base and quote", () => {
        expect(assetKey({ base: "btc", quote: "eur" })).toBe("btc/eur");
    });
});

describe("pickSelection", () => {
    it("keeps the attributes when the asset has that Holding Period", () => {
        expect(pickSelection({ base: "xauusd", quote: "usd", period: 12 }, assets)).toEqual({ base: "xauusd", quote: "usd", period: 12 });
    });

    it("takes the smallest Holding Period when the asset lacks the one set", () => {
        expect(pickSelection({ base: "^dji", quote: "usd", period: 1 }, assets)).toEqual({ base: "^dji", quote: "usd", period: 6 });
    });

    it.each([
        ["empty attributes", {}],
        ["attributes of the wrong type", { base: 1, quote: null, period: "3" }]
    ])("falls back to the first asset and its smallest period for %s", (_, attributes) => {
        expect(pickSelection(attributes, assets)).toEqual({ base: "btc", quote: "usd", period: 1 });
    });

    it.each([
        ["a gone asset", { base: "eth", quote: "usd", period: 3 }],
        ["a base with another quote", { base: "xauusd", quote: "eur", period: 3 }]
    ])("falls back to the first asset and its smallest period for %s", (_, attributes) => {
        expect(pickSelection(attributes, assets)).toEqual({ base: "btc", quote: "usd", period: 1 });
    });

    it("keeps a matching asset but drops a period of the wrong type", () => {
        expect(pickSelection({ base: "xauusd", quote: "usd", period: "12" }, assets)).toEqual({ base: "xauusd", quote: "usd", period: 3 });
    });

    it("picks nothing from an empty asset list", () => {
        expect(pickSelection({ base: "btc", quote: "usd", period: 1 }, [])).toBeNull();
    });
});

describe("entryMonths", () => {
    it.each([
        [1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
        [3, [1, 4, 7, 10]],
        [6, [1, 7]],
        [12, [1]]
    ])("lists the Entry Months of Holding Period %i from January", (period, months) => {
        expect(entryMonths(period)).toEqual(months);
    });

    it.each([3, 6, 12])("puts each calendar month in exactly one Entry Offset of Holding Period %i", (period) => {
        const families = Array.from({ length: period }, (_, offset) => entryMonths(period, offset));
        expect(families.flat().toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(families.every((months) => months.length === 12 / period)).toBe(true);
    });

    it("shifts the Entry Months by the Entry Offset", () => {
        expect(entryMonths(3, 2)).toEqual([3, 6, 9, 12]);
        expect(entryMonths(6, 5)).toEqual([6, 12]);
    });
});

describe("cellValue", () => {
    const year: YearReturns = {
        year: 2024,
        months: [
            { month: 1, value: 3.21 },
            { month: 4, value: null },
            { month: 7, value: 0 }
        ]
    };

    it("reads the value of a month", () => {
        expect(cellValue(year, 1)).toBe(3.21);
        expect(cellValue(year, 7)).toBe(0);
    });

    it("reads a null or missing month as null", () => {
        expect(cellValue(year, 4)).toBeNull();
        expect(cellValue(year, 10)).toBeNull();
    });
});

describe("formatReturn", () => {
    it.each([
        [3.21, "+3.21%"],
        [-2.1, "\u22122.10%"],
        [0, "0.00%"],
        [-0, "0.00%"],
        [12.345678, "+12.35%"],
        [-0.001, "0.00%"],
        [0.004, "0.00%"],
        [-0.005, "\u22120.01%"],
        [null, ""]
    ])("formats %s as %j", (value, text) => {
        expect(formatReturn(value)).toBe(text);
    });
});

describe("toneOf", () => {
    it.each([
        [3.21, "positive"],
        [-2.1, "negative"],
        [0, "zero"],
        [-0.001, "zero"],
        [0.004, "zero"],
        [null, "none"]
    ] as const)("tones %s as %s", (value, tone) => {
        expect(toneOf(value)).toBe(tone);
    });
});

describe("isPartial", () => {
    const now = new Date("2026-03-15T12:00:00Z");

    it.each([
        ["ends before the current month", 2025, 12, 3, false],
        ["ends in the current month", 2026, 1, 3, true],
        ["ends after the current month", 2025, 11, 6, true],
        ["is a Monthly cell in the current month", 2026, 3, 1, true],
        ["is a Monthly cell of the month before", 2026, 2, 1, false],
        ["is an Annual cell that ended last year", 2025, 3, 12, false],
        ["is an Annual cell ending this month", 2025, 4, 12, true]
    ])("a cell that %s is Partial: %s", (_, year, month, period, partial) => {
        expect(isPartial(year, month, period, now)).toBe(partial);
    });

    // Half an hour either side of the UTC new year, so a local clock east or west of UTC reads the other month.
    it("reads the month on the UTC clock", () => {
        expect(isPartial(2025, 12, 1, new Date("2026-01-01T00:30:00Z"))).toBe(false);
        expect(isPartial(2025, 12, 1, new Date("2025-12-31T23:30:00Z"))).toBe(true);
    });
});

describe("cellState", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const none: Exclusions = { years: [], cells: [] };

    it("counts a value in an included Year", () => {
        expect(cellState(2024, 1, 3.21, 3, none, now)).toBe("counted");
    });

    it("leaves a null cell empty", () => {
        expect(cellState(2024, 1, null, 3, none, now)).toBe("empty");
    });

    it("marks a cell Partial before any exclusion", () => {
        expect(cellState(2026, 1, 1, 3, { years: [2026], cells: [cellKey(2026, 1)] }, now)).toBe("partial");
    });

    it("excludes the cell clicked, and only that Entry Month", () => {
        const exclusions = { years: [], cells: [cellKey(2024, 1)] };
        expect(cellState(2024, 1, 3.21, 3, exclusions, now)).toBe("excluded");
        expect(cellState(2024, 2, 3.21, 3, exclusions, now)).toBe("counted");
        expect(cellState(2023, 1, 3.21, 3, exclusions, now)).toBe("counted");
    });

    it("excludes every cell of an Excluded Year, whatever the Entry Month", () => {
        const exclusions = { years: [2024], cells: [] };
        expect(cellState(2024, 1, 3.21, 3, exclusions, now)).toBe("year-excluded");
        expect(cellState(2024, 2, 3.21, 3, exclusions, now)).toBe("year-excluded");
    });
});

describe("toggle", () => {
    it("adds a missing item and removes a present one", () => {
        expect(toggle([2024], 2023)).toEqual([2024, 2023]);
        expect(toggle([2024, 2023], 2024)).toEqual([2023]);
    });
});

describe("columnResults", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const none: Exclusions = { years: [], cells: [] };
    const column = (...values: (number | null)[]): YearReturns[] =>
        values.map((value, index) => ({ year: 2020 - index, months: [{ month: 1, value }] }));

    it("counts Totals, Wins and Losses, and Returns as Wins over Totals", () => {
        expect(columnResults(column(3.21, -2.1, 1.5), 1, 3, none, now)).toEqual({ totals: 3, wins: 2, losses: 1, returns: 66.67 });
    });

    it("counts a flat 0 in Totals only", () => {
        expect(columnResults(column(0, 2, -0.001), 1, 3, none, now)).toEqual({ totals: 3, wins: 1, losses: 0, returns: 33.33 });
    });

    it("leaves out null, Excluded, Excluded Year and Partial cells", () => {
        const years = [{ year: 2026, months: [{ month: 1, value: 4 }] }, ...column(1, 2, 3, null, -1)];
        const exclusions = { years: [2019], cells: [cellKey(2018, 1)] };
        expect(columnResults(years, 1, 3, exclusions, now)).toEqual({ totals: 2, wins: 1, losses: 1, returns: 50 });
    });

    it("has no Returns when nothing counts", () => {
        expect(columnResults(column(null, 1), 1, 3, { years: [], cells: [cellKey(2019, 1)] }, now)).toEqual({
            totals: 0,
            wins: 0,
            losses: 0,
            returns: null
        });
    });
});

describe("formatRate", () => {
    it.each([
        [66.67, "66.67%"],
        [100, "100.00%"],
        [0, "0.00%"],
        [null, "\u2014"]
    ])("formats %s as %j", (rate, text) => {
        expect(formatRate(rate)).toBe(text);
    });
});

describe("periodLabel", () => {
    const now = new Date("2026-03-15T12:00:00Z");

    it.each([
        [2024, 1, 3, "Jan 2024 \u2013 Mar 2024"],
        [2024, 12, 3, "Dec 2024 \u2013 Feb 2025"],
        [2024, 7, 12, "Jul 2024 \u2013 Jun 2025"],
        [2024, 5, 1, "May 2024"],
        [2026, 1, 3, "Jan 2026 \u2013 today"],
        [2026, 3, 1, "Mar 2026 \u2013 today"]
    ])("names %i-%i over %i months %j", (year, month, period, label) => {
        expect(periodLabel(year, month, period, now)).toBe(label);
    });
});
