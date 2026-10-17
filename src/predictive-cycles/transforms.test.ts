import { describe, expect, it } from "vitest";
import type { Asset, Curve, CurveData, Cutoff } from "./api";
import {
    canReset,
    chips,
    curveInfo,
    curveSlots,
    cutoffCase,
    dataRequest,
    dayLabel,
    isMemory,
    monthStarts,
    notice,
    pickSelection,
    restore,
    stepYear,
    toggleYear,
    tooltipRows,
    zoneLabel,
    type InstancePick
} from "./transforms";

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

const bear: Curve = { id: 9, name: "Bear", info: "Average returns for the bear years", years: [2014, 2018, 2022] };
const decades: Curve = { id: 7, name: "Decade offsets", info: "Average returns for the selected years", years: [10, 20, 30] };

describe("dataRequest", () => {
    it("sends every curve, a year-curve with only its included years", () => {
        const curves = [{ id: 0, name: "Actual" }, bear, decades, { id: 2, name: "20 & 60", static: [20, 60] }];
        const request = dataRequest({ asset: { ...btc, curves }, baseYear: 2026 }, { 9: [2018], 7: [] });

        expect(request).toEqual({
            id: "btc",
            base_year: 2026,
            curves: [{ id: 0 }, { id: 9, years: [2014, 2022] }, { id: 7, years: [10, 20, 30] }, { id: 2 }]
        });
    });
});

describe("chips", () => {
    it("labels a year chip with its year", () => {
        expect(chips(bear, 2026)[0]).toEqual({ value: 2014, text: "2014", name: "2014" });
    });

    it("labels a decade-offset chip with the year it means at the Base Year", () => {
        expect(chips(decades, 2026)[0]).toEqual({ value: 10, text: "2016", name: "2016 (10 years before 2026)" });
        expect(chips(decades, 2025).map(({ text }) => text)).toEqual(["2015", "2005", "1995"]);
    });

    it("gives no chips to a curve without years", () => {
        expect(chips({ id: 2, name: "20 & 60", static: [20, 60] }, 2026)).toEqual([]);
    });
});

describe("curveInfo", () => {
    it("adds the years after the upstream info", () => {
        expect(curveInfo(bear)).toBe("Average returns for the bear years\nYears: 2014, 2018, 2022");
        expect(curveInfo({ id: 3, name: "Y4 Election", info: "Election years", static: [2016, 2020] })).toBe(
            "Election years\nYears: 2016, 2020"
        );
    });

    it("adds the offsets after the upstream info", () => {
        expect(curveInfo(decades)).toBe("Average returns for the selected years\nOffsets: 10, 20, 30 years before the Base Year");
        expect(curveInfo({ id: 2, name: "20 & 60", static: [20, 60] })).toBe("Offsets: 20, 60 years before the Base Year");
    });

    it("keeps the info as it is for a curve without years", () => {
        expect(curveInfo({ id: 0, name: "Actual", info: "Actual returns for the year" })).toBe("Actual returns for the year");
        expect(curveInfo({ id: 0, name: "Actual" })).toBe("");
    });
});

describe("toggleYear", () => {
    it("excludes an included year and includes an excluded one", () => {
        expect(toggleYear(bear, [], 2018)).toEqual([2018]);
        expect(toggleYear(bear, [2018, 2014], 2018)).toEqual([2014]);
    });

    it("keeps the last included year", () => {
        expect(toggleYear(bear, [2014, 2022], 2018)).toEqual([2014, 2022]);
    });
});

describe("stepYear", () => {
    const years = [2027, 2026, 2024];

    it("steps to the next older or newer listed year by value", () => {
        expect(stepYear(years, 2026, -1)).toBe(2024);
        expect(stepYear(years, 2026, 1)).toBe(2027);
        expect(stepYear([2024, 2026, 2025], 2024, 1)).toBe(2025);
    });

    it("gives null at the bounds", () => {
        expect(stepYear(years, 2024, -1)).toBeNull();
        expect(stepYear(years, 2027, 1)).toBeNull();
    });
});

describe("dayLabel", () => {
    it("reads the UTC date and the day of the year", () => {
        expect(dayLabel(Date.UTC(2026, 9, 10))).toBe("Oct 10 \u00b7 day 283");
        expect(dayLabel(Date.UTC(2024, 11, 31))).toBe("Dec 31 \u00b7 day 366");
        expect(dayLabel(Date.UTC(2026, 0, 1))).toBe("Jan 1 \u00b7 day 1");
    });
});

describe("tooltipRows", () => {
    const at = Date.UTC(2026, 0, 2);
    const curve = (name: string, value: number | null): CurveData => ({
        id: 0,
        name,
        points: [
            [Date.UTC(2026, 0, 1), 9],
            [at, value]
        ]
    });

    it("lists each shown curve with a value in list order, a real 0 as 0.00%", () => {
        const curves = [curve("Actual", 3.214), curve("Bear", 0), curve("All", null), curve("Bull", -2.1), curve("Halving", 1)];
        expect(tooltipRows(curves, ["Bull"], at)).toEqual([
            { name: "Actual", slot: 1, value: "+3.21%" },
            { name: "Bear", slot: 9, value: "0.00%" },
            { name: "Halving", slot: 11, value: "+1.00%" }
        ]);
    });
});

describe("isMemory", () => {
    const pick: InstancePick = { asset: "btc", baseYear: 2026, hidden: ["All"], log: true, zoom: { start: 10, end: 90 } };
    const good = {
        excluded: { eth: { 1: [2018], 2: [10, 20] } },
        instances: { "1:0": { attributes: { asset: null, baseYear: 2026 }, pick } }
    };

    it("takes the stored shape", () => {
        expect(isMemory(good)).toBe(true);
        expect(isMemory({ excluded: {}, instances: {} })).toBe(true);
    });

    it.each([
        ["a list", []],
        ["an exclusion that is not a list", { ...good, excluded: { eth: { 1: 2018 } } }],
        ["a hidden curve by id", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, hidden: [1] } } } }],
        ["a zoom without an end", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, zoom: { start: 0 } } } } }],
        ["Log as a string", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, log: "true" } } } }]
    ])("refuses %s", (_, value) => {
        expect(isMemory(value)).toBe(false);
    });
});

describe("restore", () => {
    const attributes = { asset: null, baseYear: 2026 };
    const pick: InstancePick = { asset: "eth", baseYear: 2024, hidden: ["All"], log: true, zoom: { start: 20, end: 60 } };
    const entry = { attributes, pick };

    it("takes the attribute rule with nothing stored", () => {
        expect(restore(attributes, undefined, assets, now)).toEqual({
            selection: { asset: btc, baseYear: 2026 },
            hidden: [],
            log: false,
            zoom: { start: 0, end: 100 }
        });
    });

    it("takes the stored view when the attributes did not change", () => {
        expect(restore({ baseYear: 2026 }, entry, assets, now)).toEqual({
            selection: { asset: eth, baseYear: 2024 },
            hidden: ["All"],
            log: true,
            zoom: { start: 20, end: 60 }
        });
    });

    it("drops the stored view when the attributes changed", () => {
        expect(restore({ baseYear: 2025 }, entry, assets, now)).toEqual({
            selection: { asset: btc, baseYear: 2025 },
            hidden: [],
            log: false,
            zoom: { start: 0, end: 100 }
        });
    });

    it("falls back to the attribute asset and the whole year when the stored asset is gone, and keeps the rest", () => {
        expect(restore(attributes, { attributes, pick: { ...pick, asset: "doge" } }, assets, now)).toEqual({
            selection: { asset: btc, baseYear: 2026 },
            hidden: ["All"],
            log: true,
            zoom: { start: 0, end: 100 }
        });
    });

    it("falls back to the attribute Base Year when the stored one is gone", () => {
        const gone = { attributes: { asset: null, baseYear: 2024 }, pick: { ...pick, baseYear: 2019 } };
        expect(restore({ baseYear: 2024 }, gone, assets, now)?.selection).toEqual({ asset: eth, baseYear: 2024 });
    });

    it("clamps the stored zoom", () => {
        expect(restore(attributes, { attributes, pick: { ...pick, zoom: { start: -5, end: 140 } } }, assets, now)?.zoom).toEqual({
            start: 0,
            end: 100
        });
        expect(restore(attributes, { attributes, pick: { ...pick, zoom: { start: 70, end: 30 } } }, assets, now)?.zoom).toEqual({
            start: 70,
            end: 70
        });
    });
});

describe("canReset", () => {
    it("is false when the view is as loaded", () => {
        expect(canReset([], { 1: [] }, { start: 0, end: 100 })).toBe(false);
    });

    it.each([
        ["a hidden curve", ["Bear"], {}, { start: 0, end: 100 }],
        ["an excluded year", [], { 1: [2018] }, { start: 0, end: 100 }],
        ["a zoom", [], {}, { start: 0, end: 80 }]
    ])("is true with %s", (_, hidden, excluded, zoom) => {
        expect(canReset(hidden, excluded, zoom)).toBe(true);
    });
});
