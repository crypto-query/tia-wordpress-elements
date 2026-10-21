import { describe, expect, it } from "vitest";
import type { Asset } from "./api";
import { axisName, caption, pickAsset, slotLabel, toSlot, todayMarker, tooltipContent, xAxisTicks } from "./transforms";

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
        expect(todayMarker(new Date(Date.UTC(2026, 0, 1)))).toEqual({ at: 6, label: "2026" });
        expect(todayMarker(new Date(Date.UTC(2024, 1, 29)))).toEqual({ at: 4 + 59 / 366, label: "2024" });
        expect(todayMarker(new Date(Date.UTC(2030, 11, 31, 23, 59)))).toEqual({ at: 364 / 366, label: "2030" });
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
    it("joins the title and range with an en dash", () => {
        expect(caption(asset("dji"))).toBe("DJI 10-Year Cycle · 1897\u20132025");
    });
});
