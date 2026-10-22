import { isObject } from "../shared/boot";
import { formatReturn } from "../shared/format";
import { clamp, storedPick, type InstanceEntry } from "../shared/load-rules";
import type { Asset, Datapoint } from "./api";

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
    return { at: (year % 10) + day / SLOTS, label: `Today · ${year}` };
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

/** The Block attributes a stored pick is tied to. */
export const ATTRIBUTE_KEYS = ["asset"] as const;

/** The x zoom in percent of the decade. */
export type Zoom = { start: number; end: number };

export const FULL_ZOOM: Zoom = { start: 0, end: 100 };

/** One instance's view; the zoom belongs to its asset. */
/** `labels` and `today` came later, so a stored pick may lack them; they default to on. */
export type InstancePick = { asset: string; log: boolean; labels?: boolean; today?: boolean; zoom: Zoom };

/** What `localStorage` keeps: each instance's view, nothing shared. */
export type Memory = Record<string, InstanceEntry<InstancePick>>;

const isPick = (value: unknown) =>
    isObject(value) &&
    typeof value.asset === "string" &&
    typeof value.log === "boolean" &&
    ["undefined", "boolean"].includes(typeof value.labels) &&
    ["undefined", "boolean"].includes(typeof value.today) &&
    isObject(value.zoom) &&
    Number.isFinite(value.zoom.start) &&
    Number.isFinite(value.zoom.end);

const isEntry = (value: unknown) =>
    isObject(value) &&
    isObject(value.attributes) &&
    Object.values(value.attributes).every((attribute) => attribute === null || typeof attribute === "string") &&
    isPick(value.pick);

export const isMemory = (value: unknown): value is Memory => isObject(value) && Object.values(value).every(isEntry);

export type View = { asset: Asset; log: boolean; labels: boolean; today: boolean; zoom: Zoom };

/** The view to start with: the stored one unless the attribute changed. A stored asset that is gone falls back to the attribute rule and the whole decade, keeping what Show sets. */
export function restore(attributes: Record<string, unknown>, entry: InstanceEntry<InstancePick> | undefined, assets: Asset[]): View | null {
    const pick = storedPick(entry, attributes, ATTRIBUTE_KEYS);
    const stored = pick && assets.find(({ id }) => id === pick.asset);
    const kept = { log: pick?.log ?? false, labels: pick?.labels ?? true, today: pick?.today ?? true };
    if (!pick || !stored) {
        const asset = pickAsset(attributes.asset, assets);
        return asset && { asset, ...kept, zoom: FULL_ZOOM };
    }
    const start = clamp(pick.zoom.start, 0, 100);
    return { asset: stored, ...kept, zoom: { start, end: clamp(pick.zoom.end, start, 100) } };
}

/** For screen readers: each Decade Year's last value, then the low and the high with their dates. Nulls are left out. */
export function chartSummary(points: Datapoint[]): string {
    const known = points.filter((point): point is { dec: number; value: number } => point.value !== null);
    if (known.length === 0) {
        return "";
    }
    const ends = [...Map.groupBy(known, ({ dec }) => toSlot(dec).year)].map(
        ([year, inYear], index) => `${year}${index === 0 ? " end" : ""} at ${formatReturn(inYear.at(-1)?.value ?? null)}`
    );
    const low = known.reduce((best, point) => (point.value < best.value ? point : best));
    const high = known.reduce((best, point) => (point.value > best.value ? point : best));
    const when = ({ dec }: Datapoint) => {
        const { year, slot } = toSlot(dec);
        return `${slotLabel(slot)} of years ending in ${year}`;
    };
    return (
        `Years ending in ${ends.join(", ")}. ` +
        `Low ${formatReturn(low.value)} on ${when(low)}. High ${formatReturn(high.value)} on ${when(high)}.`
    );
}
