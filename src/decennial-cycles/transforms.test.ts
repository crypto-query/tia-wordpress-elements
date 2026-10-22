import { describe, expect, it } from "vitest";
import type { Asset } from "./api";
import {
    axisName,
    caption,
    chartSummary,
    isMemory,
    pickAsset,
    restore,
    slotLabel,
    toSlot,
    todayMarker,
    tooltipContent,
    xAxisTicks
} from "./transforms";

const asset = (id: string): Asset => ({
    id,
    name: `${id.toUpperCase()} name`,
    title: `${id.toUpperCase()} 10-Year Cycle`,
    range: { begin: 1897, end: 2025 },
    group: "Indices"
});

describe("pickAsset", () => {
    const assets = [asset("dji"), asset("spx")];

    it("takes the attribute when it is listed", () => {
        expect(pickAsset("spx", assets)?.id).toBe("spx");
    });

    it.each([undefined, "", "gone", 3])("falls back to the first for %s", (attribute) => {
        expect(pickAsset(attribute, assets)?.id).toBe("dji");
    });

    it("gives null for an empty list", () => {
        expect(pickAsset("dji", [])).toBeNull();
    });
});

describe("toSlot and slotLabel", () => {
    it.each([
        [0, 0, 0, "Jan 1"],
        [3 + 59 / 366, 3, 59, "Feb 29"],
        [3 + 60 / 366, 3, 60, "Mar 1"],
        [3 + 74 / 366, 3, 74, "Mar 15"],
        [9 + 365 / 366, 9, 365, "Dec 31"]
    ])("maps %f to Decade Year %i, slot %i, %s", (x, year, slot, label) => {
        expect(toSlot(x)).toEqual({ year, slot });
        expect(slotLabel(slot)).toBe(label);
    });

    it("carries a position just under a year start to that year", () => {
        expect(toSlot(3 - 1e-12)).toEqual({ year: 3, slot: 0 });
        expect(toSlot((3 * 366 + 365) / 366)).toEqual({ year: 3, slot: 365 });
    });
});

describe("todayMarker", () => {
    it("places a date by its UTC day of the year, labelled with the year", () => {
        expect(todayMarker(new Date(Date.UTC(2026, 0, 1)))).toEqual({ at: 6, label: "Today · 2026" });
        expect(todayMarker(new Date(Date.UTC(2024, 1, 29)))).toEqual({ at: 4 + 59 / 366, label: "Today · 2024" });
        expect(todayMarker(new Date(Date.UTC(2030, 11, 31, 23, 59)))).toEqual({ at: 364 / 366, label: "Today · 2030" });
    });

    it("puts a non-leap Mar 1 on slot 59", () => {
        expect(toSlot(todayMarker(new Date(Date.UTC(2026, 2, 1))).at)).toEqual({ year: 6, slot: 59 });
    });
});

describe("xAxisTicks", () => {
    it("ticks at year starts with digits centred for the full window", () => {
        const { ticks, labels, format } = xAxisTicks(0, 10);
        expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(labels).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5]);
        expect(labels.map(format)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    });

    it("keeps only the years inside a window of one year or more", () => {
        const { ticks, labels } = xAxisTicks(2.3, 5.7);
        expect(ticks).toEqual([3, 4, 5]);
        expect(labels).toEqual([2.5, 3.5, 4.5, 5.5]);
    });

    it("ticks at month starts with month names centred under a 1-year span", () => {
        const { ticks, labels, format } = xAxisTicks(2, 2.999);
        expect(ticks).toEqual([0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335].map((slot) => 2 + slot / 366));
        expect(labels.map(format)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
        expect(labels[0]).toBeCloseTo(2 + 15.5 / 366);
    });

    it("crosses a year start under a 1-year span", () => {
        const { ticks, labels, format } = xAxisTicks(2 + 305 / 366, 3 + 60 / 366);
        expect(ticks).toEqual([305, 335].map((slot) => 2 + slot / 366).concat([3, 3 + 31 / 366, 3 + 60 / 366]));
        expect(labels.map(format)).toEqual(["Nov", "Dec", "Jan", "Feb"]);
    });
});

describe("axisName", () => {
    it.each([
        [0, 10, "Years ending in 0 to 9"],
        [2, 3, "Years ending in 2"],
        [2.2, 2.8, "Years ending in 2"],
        [2.5, 4.1, "Years ending in 2 to 4"],
        [9, 10, "Years ending in 9"]
    ])("names the window %f to %f", (start, end, name) => {
        expect(axisName(start, end)).toBe(name);
    });
});

describe("tooltipContent", () => {
    it("gives the Decade Year and date, and the value row", () => {
        expect(tooltipContent(3 + 74 / 366, 3.214)).toEqual({
            header: "Years ending in 3 · Mar 15",
            rows: [{ name: "10-Year Cycle", value: "+3.21%" }]
        });
    });

    it("leaves out the row for null", () => {
        expect(tooltipContent(0, null)).toEqual({ header: "Years ending in 0 · Jan 1", rows: [] });
    });
});

describe("caption", () => {
    it("names the cycle and the range with an en dash, without the asset", () => {
        expect(caption(asset("dji"))).toBe("10-Year Cycle · 1897\u20132025");
    });
});

describe("restore", () => {
    const assets = [asset("dji"), asset("spx")];
    const shown = { labels: true, today: true };
    const entry = (
        attribute: string | null,
        pick: { asset: string; log: boolean; labels?: boolean; today?: boolean; zoom: { start: number; end: number } }
    ) => ({
        attributes: { asset: attribute },
        pick
    });

    it("starts from the attribute with no stored view", () => {
        expect(restore({ asset: "spx" }, undefined, assets)).toEqual({
            ...shown,
            asset: assets[1],
            log: false,
            zoom: { start: 0, end: 100 }
        });
    });

    it("takes the stored view made under the same attribute", () => {
        const stored = entry(null, { asset: "spx", log: true, zoom: { start: 20, end: 25 } });
        expect(restore({}, stored, assets)).toEqual({ ...shown, asset: assets[1], log: true, zoom: { start: 20, end: 25 } });
    });

    it("drops the stored view when the attribute changed", () => {
        const stored = entry(null, { asset: "spx", log: true, labels: false, today: false, zoom: { start: 20, end: 25 } });
        expect(restore({ asset: "dji" }, stored, assets)).toEqual({ ...shown, asset: assets[0], log: false, zoom: { start: 0, end: 100 } });
    });

    it("falls back to the attribute and the whole decade for a gone asset, and keeps what Show sets", () => {
        const stored = entry("spx", { asset: "gone", log: true, labels: false, today: false, zoom: { start: 20, end: 25 } });
        expect(restore({ asset: "spx" }, stored, assets)).toEqual({
            asset: assets[1],
            log: true,
            labels: false,
            today: false,
            zoom: { start: 0, end: 100 }
        });
    });

    it("shows the axis labels and Today for a view stored before they could be hidden", () => {
        const stored = entry(null, { asset: "dji", log: false, zoom: { start: 0, end: 100 } });
        expect(restore({}, stored, assets)).toMatchObject(shown);
    });

    it("clamps a stored zoom", () => {
        const stored = entry(null, { asset: "dji", log: false, zoom: { start: -5, end: 140 } });
        expect(restore({}, stored, assets)?.zoom).toEqual({ start: 0, end: 100 });
    });

    it("gives null for an empty list", () => {
        expect(restore({}, undefined, [])).toBeNull();
    });
});

describe("isMemory", () => {
    const pick = { asset: "dji", log: false, zoom: { start: 0, end: 100 } };

    it("accepts views per instance", () => {
        expect(isMemory({})).toBe(true);
        expect(isMemory({ "1:0": { attributes: { asset: null }, pick } })).toBe(true);
        expect(isMemory({ "1:0": { attributes: { asset: null }, pick: { ...pick, labels: false, today: true } } })).toBe(true);
    });

    it.each([
        null,
        [],
        { "1:0": { attributes: {}, pick: { ...pick, log: "yes" } } },
        { "1:0": { attributes: {}, pick: { ...pick, today: 0 } } },
        { "1:0": { pick } }
    ])("rejects %j", (value) => {
        expect(isMemory(value)).toBe(false);
    });
});

describe("chartSummary", () => {
    const at = (year: number, slot: number) => year + slot / 366;

    it("gives each Decade Year's last value, then the low and the high with their dates", () => {
        const points = Array.from({ length: 10 }, (_, year) => [
            { dec: at(year, 0), value: year },
            { dec: at(year, 365), value: year + 0.5 }
        ]).flat();
        points[5] = { dec: at(2, 283), value: -5 };
        expect(chartSummary(points)).toBe(
            "Years ending in 0 end at +0.50%, 1 at +1.50%, 2 at \u22125.00%, 3 at +3.50%, 4 at +4.50%, 5 at +5.50%, " +
                "6 at +6.50%, 7 at +7.50%, 8 at +8.50%, 9 at +9.50%. " +
                "Low \u22125.00% on Oct 10 of years ending in 2. High +9.50% on Dec 31 of years ending in 9."
        );
    });

    it("skips nulls and a Decade Year with no value", () => {
        const points = [
            { dec: at(0, 0), value: 0 },
            { dec: at(0, 365), value: null },
            { dec: at(1, 0), value: null },
            { dec: at(2, 0), value: 2 }
        ];
        expect(chartSummary(points)).toBe(
            "Years ending in 0 end at 0.00%, 2 at +2.00%. Low 0.00% on Jan 1 of years ending in 0. High +2.00% on Jan 1 of years ending in 2."
        );
    });

    it("is empty with no value", () => {
        expect(chartSummary([{ dec: 0, value: null }])).toBe("");
    });
});
