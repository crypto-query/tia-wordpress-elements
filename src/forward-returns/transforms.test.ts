import { describe, expect, it } from "vitest";
import type { Asset, YearReturns } from "./api";
import { cellValue, entryMonths, formatReturn, pickSelection, toneOf } from "./transforms";

const assets: Asset[] = [
    { title: "BTC", base: "btc", quote: "usd", periods: [1, 3, 6, 12] },
    { title: "Gold", base: "xauusd", quote: "usd", periods: [3, 12] },
    { title: "Dow Jones", base: "^dji", quote: "usd", periods: [6, 12] }
];

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
