import { formatReturn } from "../shared/format";
import type { Asset } from "./api";

/** Slots per Decade Year: a fixed leap-year calendar, slot d is day d + 1. */
export const SLOTS = 366;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** The slot each month starts on. */
const STARTS = LENGTHS.map((_, month) => LENGTHS.slice(0, month).reduce((sum, days) => sum + days, 0));
// Window edges come from float positions, so a hair over a year start still counts as that start.
const EPSILON = 1e-9;

/** The `asset` attribute when listed, else the first asset. */
export function pickAsset(attribute: unknown, assets: Asset[]): Asset | null {
    return assets.find(({ id }) => id === attribute) ?? assets[0] ?? null;
}

/** A decade position to its Decade Year and day slot; rounding up to the next year start carries over. */
export function toSlot(x: number): { year: number; slot: number } {
    const year = Math.floor(x);
    const slot = Math.round((x - year) * SLOTS);
    return slot >= SLOTS ? { year: year + 1, slot: 0 } : { year, slot };
}

/** "Mar 15" for a slot of the leap-year calendar. */
export function slotLabel(slot: number): string {
    const month = STARTS.findLastIndex((start) => start <= slot);
    return `${MONTHS[month]} ${slot - STARTS[month] + 1}`;
}

/** Today's decade position in UTC, labelled with the full year. A non-leap year runs up to one day early. */
export function todayMarker(now: Date): { at: number; label: string } {
    const year = now.getUTCFullYear();
    const day = (Date.UTC(year, now.getUTCMonth(), now.getUTCDate()) - Date.UTC(year, 0, 1)) / 86_400_000;
    return { at: (year % 10) + day / SLOTS, label: String(year) };
}

/**
 * Tick lines and label positions for the window `[start, end]`: year starts with the digit centred in each year,
 * or month starts with the month name centred under a span of less than one year.
 */
export function xAxisTicks(start: number, end: number): { ticks: number[]; labels: number[]; format: (value: number) => string } {
    const inside = (value: number) => value >= start - EPSILON && value <= end + EPSILON;
    if (end - start >= 1) {
        const years = Array.from({ length: 11 }, (_, year) => year);
        return {
            ticks: years.filter(inside),
            labels: years
                .slice(0, 10)
                .map((year) => year + 0.5)
                .filter(inside),
            format: (value) => String(Math.floor(value))
        };
    }
    const years = [Math.floor(start), Math.floor(start) + 1];
    const at = (offset: number) => years.flatMap((year) => STARTS.map((slot, month) => year + (slot + offset * LENGTHS[month]) / SLOTS));
    return {
        ticks: at(0).filter(inside),
        labels: at(0.5).filter(inside),
        format: (value) => MONTHS[STARTS.findLastIndex((slot) => slot <= toSlot(value).slot)]
    };
}

/** "Years ending in 2" or "Years ending in 0 to 9"; the window end is exclusive. */
export function axisName(start: number, end: number): string {
    const first = Math.floor(start + EPSILON);
    const last = Math.max(first, Math.ceil(end - EPSILON) - 1);
    return first === last ? `Years ending in ${first}` : `Years ending in ${first} to ${last}`;
}

/** The tooltip of one point: its Decade Year and date, and the value row unless the value is null. */
export function tooltipContent(x: number, value: number | null): { header: string; rows: { name: string; value: string }[] } {
    const { year, slot } = toSlot(x);
    return {
        header: `Years ending in ${year} · ${slotLabel(slot)}`,
        rows: value === null ? [] : [{ name: "10-Year Cycle", value: formatReturn(value) }]
    };
}

export const caption = ({ title, range }: Asset) => `${title} · ${range.begin}\u2013${range.end}`;
