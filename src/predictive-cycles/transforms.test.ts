import { describe, expect, it } from "vitest";
import type { Asset, Curve, CurveData, Cutoff } from "./api";
import {
    canReset,
    chartSummary,
    chipGroups,
    chipTooltip,
    chips,
    lineKind,
    shortName,
    curveSlots,
    cutoffCase,
    dataRequest,
    dayLabel,
    dragAnnouncement,
    dragCurves,
    isMemory,
    monthStarts,
    NO_DRAG,
    notice,
    pickSelection,
    restore,
    stepYear,
    toggleYear,
    tooltipRows,
    yearCount,
    yearsTitle,
    zoneLabel,
    type Drag,
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

const curve = (id: number, name: string, extra: Partial<Curve> = {}): Curve => ({ id, name, ...extra });
const names = (groups: Curve[][]) => groups.map((group) => group.map(({ name }) => name));

describe("chipGroups", () => {
    it("orders the BTC curves by role, not by the server order", () => {
        const server = ["Halving", "Y4 Election", "Bull", "All", "Y2 Midterm", "Actual", "Bear", "Y3 Pre-election", "Y1 Post-election"];
        expect(names(chipGroups(server.map((name, id) => curve(id, name))))).toEqual([
            ["Actual"],
            ["All"],
            ["Y1 Post-election", "Y2 Midterm", "Y3 Pre-election", "Y4 Election"],
            ["Bear", "Bull", "Halving"]
        ]);
    });

    it("orders the SPX curves by role, with 20 & 60 after All", () => {
        const server = ["Decade offsets", "Y3 Pre-election", "20 & 60", "Actual", "Y1 Post-election", "All", "Y4 Election", "Y2 Midterm"];
        expect(names(chipGroups(server.map((name, id) => curve(id, name))))).toEqual([
            ["Actual"],
            ["All", "20 & 60"],
            ["Y1 Post-election", "Y2 Midterm", "Y3 Pre-election", "Y4 Election"],
            ["Decade offsets"]
        ]);
    });

    it("puts unknown curves at the end of group 2 in server order, and leaves out empty groups", () => {
        const server = ["Mystery", "Bull", "All", "Other", "Actual"];
        expect(names(chipGroups(server.map((name, id) => curve(id, name))))).toEqual([["Actual"], ["All", "Mystery", "Other"], ["Bull"]]);
    });
});

describe("shortName", () => {
    it.each([
        ["Y1 Post-election", "Y1 Post"],
        ["Y2 Midterm", "Y2 Mid"],
        ["Y3 Pre-election", "Y3 Pre"],
        ["Y4 Election", "Y4 Elect"],
        ["20 & 60", "20 & 60"],
        ["Decade offsets", "Decade offsets"],
        ["Mystery", "Mystery"]
    ])("shows %s as %s", (name, short) => {
        expect(shortName(name)).toBe(short);
    });
});

describe("lineKind", () => {
    it.each([
        ["Actual", "actual"],
        ["Bear", "set"],
        ["Bull", "set"],
        ["Halving", "set"],
        ["Decade offsets", "set"],
        ["All", "plain"],
        ["20 & 60", "plain"],
        ["Y2 Midterm", "plain"],
        ["Mystery", "plain"]
    ])("draws %s as %s", (name, kind) => {
        expect(lineKind(name)).toBe(kind);
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
const halving: Curve = { id: 11, name: "Halving", years: [2012, 2016, 2020, 2024] };

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

    it("leaves out a year-curve with every year excluded", () => {
        const curves = [{ id: 0, name: "Actual" }, bear, decades];
        const request = dataRequest({ asset: { ...btc, curves }, baseYear: 2026 }, { 9: [2014, 2018, 2022], 7: [10, 20, 30] });

        expect(request.curves).toEqual([{ id: 0 }]);
    });
});

describe("chips", () => {
    it("labels a year chip with its year", () => {
        expect(chips(bear, 2026)[0]).toEqual({ value: 2014, text: "2014", name: "2014", included: true, lock: null });
    });

    it("labels a decade-offset chip with the year it means at the Base Year", () => {
        expect(chips(decades, 2026)[0]).toEqual({
            value: 10,
            text: "2016",
            name: "2016 (10 years before 2026)",
            included: true,
            lock: null
        });
        expect(chips(decades, 2025).map(({ text }) => text)).toEqual(["2015", "2005", "1995"]);
    });

    it("gives no chips to a curve without years", () => {
        expect(chips({ id: 2, name: "20 & 60", static: [20, 60] }, 2026)).toEqual([]);
    });

    const locks = (curve: Curve, baseYear: number, excluded: number[]) =>
        chips(curve, baseYear, excluded).map(({ value, included, lock }) => [value, included, lock]);

    it("locks a year at or after the Base Year, and the last included year before it", () => {
        expect(locks(halving, 2024, [2012, 2016])).toEqual([
            [2012, false, null],
            [2016, false, null],
            [2020, true, "last"],
            [2024, true, "unavailable"]
        ]);
    });

    it("locks no last year when every included year is at or after the Base Year", () => {
        expect(locks(halving, 2016, [2012])).toEqual([
            [2012, false, null],
            [2016, true, "unavailable"],
            [2020, true, "unavailable"],
            [2024, true, "unavailable"]
        ]);
    });

    it("leaves an excluded year at or after the Base Year free to include", () => {
        expect(locks(halving, 2024, [2012, 2024])).toEqual([
            [2012, false, null],
            [2016, true, null],
            [2020, true, null],
            [2024, false, null]
        ]);
    });

    it("frees a year once the Base Year is after it", () => {
        expect(locks(halving, 2025, [2012, 2016])).toEqual([
            [2012, false, null],
            [2016, false, null],
            [2020, true, null],
            [2024, true, null]
        ]);
    });

    it("never makes an offset chip unavailable", () => {
        expect(locks(decades, 2026, [10, 20])).toEqual([
            [10, false, null],
            [20, false, null],
            [30, true, "last"]
        ]);
    });
});

describe("yearCount", () => {
    it("counts the included years out of all years before the Base Year", () => {
        expect(yearCount(halving, 2026, [])).toEqual({ included: 4, of: 4 });
        expect(yearCount(halving, 2026, [2012, 2020])).toEqual({ included: 2, of: 4 });
    });

    it("leaves out years not before the Base Year, excluded or not", () => {
        expect(yearCount(halving, 2020, [])).toEqual({ included: 2, of: 2 });
        expect(yearCount(halving, 2020, [2012, 2024])).toEqual({ included: 1, of: 2 });
    });

    it("counts every offset", () => {
        expect(yearCount(decades, 2026, [20])).toEqual({ included: 2, of: 3 });
    });

    it("is zero of zero for a curve without editable years", () => {
        expect(yearCount({ id: 2, name: "20 & 60", static: [20, 60] }, 2026, [])).toEqual({ included: 0, of: 0 });
    });
});

describe("chipTooltip", () => {
    const range = (from: number, to: number, step = 1) =>
        Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);

    it("gives the full name and the info as a sentence", () => {
        const actual = curve(0, "Actual", { info: "actual returns for the year" });
        expect(chipTooltip(actual, 2026, [])).toEqual(["Actual", "Actual returns for the year."]);
        expect(chipTooltip({ ...actual, info: "Actual returns." }, 2026, [])).toEqual(["Actual", "Actual returns."]);
    });

    it("leaves out empty info", () => {
        expect(chipTooltip(curve(0, "Actual"), 2026, [])).toEqual(["Actual"]);
        expect(chipTooltip(curve(0, "Actual", { info: " " }), 2026, [])).toEqual(["Actual"]);
    });

    it("lists fixed calendar years before the Base Year", () => {
        const y4 = curve(6, "Y4 Election", { info: "election years", static: [2012, 2016, 2020, 2024] });
        expect(chipTooltip(y4, 2026, [])).toEqual(["Y4 Election", "Election years.", "Fixed: 2012 · 2016 · 2020 · 2024"]);
        expect(chipTooltip(y4, 2024, [])[2]).toBe("Fixed: 2012 · 2016 · 2020");
    });

    it("gives more than 8 fixed years as a range", () => {
        const all = curve(1, "All", { static: range(1950, 2025) });
        expect(chipTooltip(all, 2025, [])).toEqual(["All", "Fixed: 1950–2024 (75 years)"]);
    });

    it("gives fixed offsets as years before the Base Year", () => {
        expect(chipTooltip(curve(8, "20 & 60", { static: [20, 60] }), 2026, [])).toEqual([
            "20 & 60",
            "Fixed: 20 · 60 years before the Base Year"
        ]);
    });

    it("counts the included years of a year set", () => {
        const bull = curve(10, "Bull", { info: "bull years", years: [2011, 2012, 2013, 2015, 2016, 2017, 2019, 2020, 2021, 2023] });
        expect(chipTooltip(bull, 2026, [2011, 2015])).toEqual(["Bull", "Bull years.", "Years: 8 of 10 included"]);
    });

    it("counts the included offsets of Decade offsets", () => {
        const decade = curve(7, "Decade offsets", { years: range(10, 80, 10) });
        expect(chipTooltip(decade, 2026, [40])).toEqual(["Decade offsets", "Offsets: 7 of 8 included"]);
    });
});

describe("yearsTitle", () => {
    it.each([
        ["Bull", "Bull years"],
        ["Bear", "Bear years"],
        ["Halving", "Halving years"],
        ["Decade offsets", "Decade offset years"]
    ])("titles the %s popover %s", (name, title) => {
        expect(yearsTitle(name)).toBe(title);
    });
});

describe("toggleYear", () => {
    it("excludes an included year and includes an excluded one", () => {
        expect(toggleYear(bear, 2026, [], 2018)).toEqual([2018]);
        expect(toggleYear(bear, 2026, [2018, 2014], 2018)).toEqual([2014]);
    });

    it("keeps the last included year", () => {
        expect(toggleYear(bear, 2026, [2014, 2022], 2018)).toEqual([2014, 2022]);
    });

    it("keeps the last included year before the Base Year, and leaves the later years as they are", () => {
        expect(toggleYear(halving, 2024, [2012, 2016], 2020)).toEqual([2012, 2016]);
        expect(toggleYear(halving, 2024, [2012, 2016], 2024)).toEqual([2012, 2016]);
    });

    it("always includes an excluded year, also one at or after the Base Year", () => {
        expect(toggleYear(halving, 2016, [2012], 2012)).toEqual([]);
        expect(toggleYear(halving, 2024, [2012, 2016], 2016)).toEqual([2012]);
        expect(toggleYear(halving, 2024, [2012, 2016, 2024], 2024)).toEqual([2012, 2016]);
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
        const shown = { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, tooltip: false, labels: true } } } };
        expect(isMemory(shown)).toBe(true);
    });

    it.each([
        ["a list", []],
        ["an exclusion that is not a list", { ...good, excluded: { eth: { 1: 2018 } } }],
        ["a hidden curve by id", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, hidden: [1] } } } }],
        ["a zoom without an end", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, zoom: { start: 0 } } } } }],
        ["Log as a string", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, log: "true" } } } }],
        ["Tooltip as a string", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, tooltip: "false" } } } }],
        ["Axis labels as null", { ...good, instances: { "1:0": { attributes: {}, pick: { ...pick, labels: null } } } }]
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
            tooltip: true,
            labels: true,
            zoom: { start: 0, end: 100 }
        });
    });

    it("takes the stored view when the attributes did not change, Tooltip and Axis labels on when it lacks them", () => {
        expect(restore({ baseYear: 2026 }, entry, assets, now)).toEqual({
            selection: { asset: eth, baseYear: 2024 },
            hidden: ["All"],
            log: true,
            tooltip: true,
            labels: true,
            zoom: { start: 20, end: 60 }
        });
        expect(restore({ baseYear: 2026 }, { attributes, pick: { ...pick, tooltip: false, labels: false } }, assets, now)).toMatchObject({
            tooltip: false,
            labels: false
        });
    });

    it("drops the stored view when the attributes changed", () => {
        expect(restore({ baseYear: 2025 }, entry, assets, now)).toEqual({
            selection: { asset: btc, baseYear: 2025 },
            hidden: [],
            log: false,
            tooltip: true,
            labels: true,
            zoom: { start: 0, end: 100 }
        });
    });

    it("falls back to the attribute asset and the whole year when the stored asset is gone, and keeps the rest", () => {
        expect(restore(attributes, { attributes, pick: { ...pick, asset: "doge" } }, assets, now)).toEqual({
            selection: { asset: btc, baseYear: 2026 },
            hidden: ["All"],
            log: true,
            tooltip: true,
            labels: true,
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
        expect(canReset([], { 1: [] }, { start: 0, end: 100 }, { days: 0, percent: 0 })).toBe(false);
    });

    it.each([
        ["a hidden curve", ["Bear"], {}, { start: 0, end: 100 }, { days: 0, percent: 0 }],
        ["an excluded year", [], { 1: [2018] }, { start: 0, end: 100 }, { days: 0, percent: 0 }],
        ["a zoom", [], {}, { start: 0, end: 80 }, { days: 0, percent: 0 }],
        ["a drag in x", [], {}, { start: 0, end: 100 }, { days: -1, percent: 0 }],
        ["a drag in y", [], {}, { start: 0, end: 100 }, { days: 0, percent: 0.25 }]
    ])("is true with %s", (_, hidden, excluded, zoom, drag) => {
        expect(canReset(hidden, excluded, zoom, drag)).toBe(true);
    });
});

describe("dragCurves", () => {
    const day = (date: number) => Date.UTC(2026, 0, date);
    const curves: CurveData[] = [
        {
            id: 0,
            name: "Actual",
            points: [
                [day(1), 1],
                [day(2), 0],
                [day(3), null]
            ]
        },
        { id: 1, name: "All", points: [[day(1), 2]] }
    ];

    const actual = (drag: Drag) => dragCurves(curves, drag, false)[0]?.points;

    it("returns equal data with no drag", () => {
        expect(dragCurves(curves, NO_DRAG, false)).toEqual(curves);
        expect(dragCurves(curves, NO_DRAG, true)).toEqual(curves);
    });

    it("shifts Actual's values right on its own dates, with nulls where nothing lands", () => {
        expect(actual({ days: 1, percent: 0 })).toEqual([
            [day(1), null],
            [day(2), 1],
            [day(3), 0]
        ]);
    });

    it("shifts Actual's values left, with trailing nulls, and adds the percent", () => {
        expect(actual({ days: -1, percent: -1.5 })).toEqual([
            [day(1), -1.5],
            [day(2), null],
            [day(3), null]
        ]);
    });

    it("drops values moved past the dates and leaves other curves untouched", () => {
        const dragged = dragCurves(curves, { days: 5, percent: 2 }, false);
        expect(dragged[0]?.points).toEqual([
            [day(1), null],
            [day(2), null],
            [day(3), null]
        ]);
        expect(dragged[1]).toBe(curves[1]);
    });

    it("fills a date missing from the grid with the last value before it", () => {
        const gapped: CurveData[] = [
            {
                id: 0,
                name: "Actual",
                points: [
                    [day(1), 1],
                    [day(2), 2],
                    [day(4), 4]
                ]
            }
        ];
        expect(dragCurves(gapped, { days: 1, percent: 0.5 }, false)[0]?.points).toEqual([
            [day(1), null],
            [day(2), 1.5],
            [day(4), 2.5]
        ]);
    });

    it("on log, moves Actual's last value by the percent and every value by the same asinh amount", () => {
        const steep: CurveData[] = [
            {
                id: 0,
                name: "Actual",
                points: [
                    [day(1), 0.5],
                    [day(2), 40],
                    [day(3), null]
                ]
            }
        ];
        const [first, last, empty] = dragCurves(steep, { days: 0, percent: 5 }, true)[0]?.points ?? [];
        expect(last?.[1]).toBeCloseTo(45);
        expect(Math.asinh(first?.[1] ?? 0) - Math.asinh(0.5)).toBeCloseTo(Math.asinh(45) - Math.asinh(40));
        expect(empty?.[1]).toBeNull();
    });
});

describe("dragAnnouncement", () => {
    it.each([
        [{ days: 3, percent: 1 }, "Actual moved +3 days, +1.00%"],
        [{ days: -1, percent: -0.504 }, "Actual moved \u22121 day, \u22120.50%"],
        [{ days: 0, percent: 0 }, "Actual moved 0 days, 0.00%"]
    ])("reads %o as %s", (drag, text) => {
        expect(dragAnnouncement(drag)).toBe(text);
    });
});

describe("chartSummary", () => {
    const day = (month: number, date: number) => Date.UTC(2026, month, date);
    const curves: CurveData[] = [
        {
            id: 0,
            name: "Actual",
            points: [
                [day(9, 9), 3],
                [day(9, 10), 4],
                [day(11, 31), null]
            ]
        },
        {
            id: 1,
            name: "All",
            points: [
                [day(9, 10), 0],
                [day(11, 31), 5.5]
            ]
        },
        {
            id: 2,
            name: "Bear",
            points: [
                [day(9, 10), -2],
                [day(11, 31), null]
            ]
        }
    ];

    it("gives each shown curve's value on Actual's last day and on Dec 31, without nulls", () => {
        expect(chartSummary(curves, ["Bear"], 2026)).toBe("Oct 10: Actual +4.00%, All 0.00%. Dec 31: All +5.50%.");
    });

    it("keeps Actual's last day as the date when Actual is hidden", () => {
        expect(chartSummary(curves, ["Actual"], 2026)).toBe("Oct 10: All 0.00%, Bear \u22122.00%. Dec 31: All +5.50%.");
    });

    it("gives only Dec 31 when Actual has no value or ends on Dec 31", () => {
        const empty = curves.map((curve) => (curve.name === "Actual" ? { ...curve, points: [] } : curve));
        expect(chartSummary(empty, [], 2026)).toBe("Dec 31: All +5.50%.");
        const full = curves.map((curve) => ({ ...curve, points: [[day(11, 31), 1]] as CurveData["points"] }));
        expect(chartSummary(full, ["Bear"], 2026)).toBe("Dec 31: Actual +1.00%, All +1.00%.");
    });
});
