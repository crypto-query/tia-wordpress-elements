import { describe, expect, it } from "vitest";
import type { Asset, Cutoff } from "./api";
import { curveSlots, cutoffCase, monthStarts, notice, pickSelection, zoneLabel } from "./transforms";

const asset = (id: string, base_years: number[]): Asset => ({
    id,
    name: id.toUpperCase(),
    title: id.toUpperCase(),
    range: { begin: 2010, end: 2026 },
    base: id,
    quote: "usd",
    group: "Crypto",
    base_years,
    curves: []
});

const btc = asset("btc", [2027, 2026, 2025]);
const eth = asset("eth", [2025, 2024]);
const assets = [btc, eth];
const now = new Date("2026-06-15T12:00:00Z");

describe("pickSelection", () => {
    it("takes the asset and Base Year attributes when the list has them", () => {
        expect(pickSelection({ asset: "eth", baseYear: 2024 }, assets, now)).toEqual({ asset: eth, baseYear: 2024 });
    });

    it("takes the first asset when the asset attribute is empty or gone", () => {
        expect(pickSelection({}, assets, now)?.asset).toBe(btc);
        expect(pickSelection({ asset: "doge" }, assets, now)?.asset).toBe(btc);
    });

    it("takes the current UTC year when the Base Year attribute is empty or not listed", () => {
        expect(pickSelection({}, assets, now)?.baseYear).toBe(2026);
        expect(pickSelection({ baseYear: 2019 }, assets, now)?.baseYear).toBe(2026);
        expect(pickSelection({}, assets, new Date("2025-12-31T23:30:00-02:00"))?.baseYear).toBe(2026);
    });

    it("takes the largest year when the current UTC year is not listed", () => {
        expect(pickSelection({ asset: "eth" }, assets, now)?.baseYear).toBe(2025);
        expect(pickSelection({}, [asset("xau", [2020, 2024, 2022])], now)?.baseYear).toBe(2024);
    });

    it("is null without an asset or a Base Year", () => {
        expect(pickSelection({}, [], now)).toBeNull();
        expect(pickSelection({}, [asset("xau", [])], now)).toBeNull();
    });
});

describe("curveSlots", () => {
    it.each([
        ["Actual", 1],
        ["All", 2],
        ["Y1 Post-election", 3],
        ["Y2 Midterm", 4],
        ["Y3 Pre-election", 5],
        ["Y4 Election", 6],
        ["Decade offsets", 7],
        ["20 & 60", 8],
        ["20", 8],
        ["Bear", 9],
        ["Bull", 10],
        ["Halving", 11]
    ])("gives %s slot %i", (name, slot) => {
        expect(curveSlots([name])).toEqual([slot]);
    });

    it("keeps a role's slot whatever its position", () => {
        expect(curveSlots(["Halving", "Actual", "Bull"])).toEqual([11, 1, 10]);
    });

    it("gives an unknown role the first slot no curve of the asset uses", () => {
        expect(curveSlots(["Actual", "Mystery", "All", "Other"])).toEqual([1, 3, 2, 4]);
    });

    it("gives an unknown role index mod 11 when every slot is used", () => {
        const known = ["Actual", "All", "Y1 Post-election", "Y2 Midterm", "Y3 Pre-election", "Y4 Election"];
        const names = [...known, "Decade offsets", "20 & 60", "Bear", "Bull", "Halving", "Mystery"];
        expect(curveSlots(names).at(-1)).toBe(1);
        expect(curveSlots([...names, "Other"]).at(-1)).toBe(2);
    });
});

describe("cutoffCase", () => {
    const first = Date.UTC(2026, 0, 1);
    const last = Date.UTC(2026, 11, 31);
    const at = (ms: number): Cutoff => ({ at: ms, date: "", trial: false, source: "tia-pro" });

    it("is none without a cut-off or with one on or after the last day", () => {
        expect(cutoffCase(null, first, last)).toBe("none");
        expect(cutoffCase(at(last), first, last)).toBe("none");
        expect(cutoffCase(at(Date.UTC(2027, 5, 1)), first, last)).toBe("none");
    });

    it("is before when the cut-off falls before the first day", () => {
        expect(cutoffCase(at(Date.UTC(2025, 11, 31)), first, last)).toBe("before");
    });

    it("is inside from the first day up to the day before the last", () => {
        expect(cutoffCase(at(first), first, last)).toBe("inside");
        expect(cutoffCase(at(Date.UTC(2026, 6, 15)), first, last)).toBe("inside");
    });
});

describe("notice and zone label", () => {
    const cutoff = (trial: boolean, source: Cutoff["source"]): Cutoff => ({ at: 0, date: "July 15, 2026", trial, source });

    it.each([
        [
            false,
            "tia-pro",
            "Your TIA Pro subscription includes cycle projections up to July 15, 2026. Later projections appear when your subscription renews."
        ],
        [
            false,
            "indicator-suite",
            "Your TIA Indicator Suite subscription includes cycle projections up to July 15, 2026. Later projections appear when your subscription renews."
        ],
        [
            true,
            "tia-pro",
            "Your free trial includes cycle projections up to July 15, 2026. You get the full projection when your TIA Pro subscription starts."
        ],
        [
            true,
            "indicator-suite",
            "Your free trial includes cycle projections up to July 15, 2026. You get the full projection when your TIA Indicator Suite subscription starts."
        ]
    ] as const)("trial %s, source %s", (trial, source, text) => {
        expect(notice(cutoff(trial, source))).toBe(text);
    });

    it("labels the gray zone by trial", () => {
        expect(zoneLabel(cutoff(false, "indicator-suite"))).toBe("Available after renewal");
        expect(zoneLabel(cutoff(true, "tia-pro"))).toBe("Available after trial");
    });
});

describe("monthStarts", () => {
    it("lists the 12 UTC month starts of the year", () => {
        const starts = monthStarts(2024);
        expect(starts).toHaveLength(12);
        expect(starts[0]).toBe(Date.parse("2024-01-01T00:00:00Z"));
        expect(starts[1]).toBe(Date.parse("2024-02-01T00:00:00Z"));
        expect(starts[2]).toBe(Date.parse("2024-03-01T00:00:00Z"));
        expect(starts[11]).toBe(Date.parse("2024-12-01T00:00:00Z"));
    });
});
