import { isObject } from "../shared/boot";
import { formatReturn } from "../shared/format";
import { clamp, storedPick, type InstanceEntry } from "../shared/load-rules";
import type { Asset, Curve, CurveData, Cutoff, DataRequest, Selection } from "./api";

/** Default pick: the asset attribute if listed, else the first; the Base Year attribute, else the current UTC year, else the largest. */
export function pickSelection(attributes: Record<string, unknown>, assets: Asset[], now: Date): Selection | null {
    const asset = assets.find(({ id }) => id === attributes.asset) ?? assets[0];
    if (!asset || asset.base_years.length === 0) {
        return null;
    }
    const years = asset.base_years;
    const wanted = [attributes.baseYear, now.getUTCFullYear()].find((year) => typeof year === "number" && years.includes(year));
    return { asset, baseYear: typeof wanted === "number" ? wanted : Math.max(...years) };
}

/** Steps to the next older (`-1`) or newer (`1`) listed Base Year, by value; null at the bound. */
export function stepYear(years: number[], year: number, step: -1 | 1): number | null {
    const next = years.filter((other) => (other - year) * step > 0);
    if (next.length === 0) {
        return null;
    }
    return step < 0 ? Math.max(...next) : Math.min(...next);
}

/** Excluded years (or offsets) per curve id. */
export type Exclusions = Record<number, number[]>;

/** Every curve of the asset; a year-curve sends only its included years. */
export function dataRequest({ asset, baseYear }: Selection, excluded: Exclusions): DataRequest {
    return {
        id: asset.id,
        base_year: baseYear,
        curves: asset.curves.map(({ id, years }) =>
            years ? { id, years: years.filter((year) => !(excluded[id] ?? []).includes(year)) } : { id }
        )
    };
}

/** Upstream lists calendar years, or offsets before the Base Year as small numbers (Decade offsets, "20 & 60"). */
const isOffsets = (values: number[]) => values.every((value) => value < 1000);

export type Chip = { value: number; text: string; name: string };

/** One chip per year of a year-curve. An offset chip shows the year it means at the Base Year. */
export function chips({ years = [] }: Curve, baseYear: number): Chip[] {
    if (!isOffsets(years)) {
        return years.map((year) => ({ value: year, text: String(year), name: String(year) }));
    }
    return years.map((offset) => {
        const year = baseYear - offset;
        return { value: offset, text: String(year), name: `${year} (${offset} years before ${baseYear})` };
    });
}

/** Upstream `info` as it is, then the years or offsets the curve averages. */
export function curveInfo({ info, years, static: fixed }: Curve): string {
    const values = years ?? fixed ?? [];
    const list = values.join(", ");
    const tail = values.length === 0 ? "" : isOffsets(values) ? `Offsets: ${list} years before the Base Year` : `Years: ${list}`;
    return [info, tail].filter(Boolean).join("\n");
}

/** Excludes or includes one year of a year-curve; the last included year stays. */
export function toggleYear({ years = [] }: Curve, excluded: number[], year: number): number[] {
    if (excluded.includes(year)) {
        return excluded.filter((other) => other !== year);
    }
    const included = years.filter((other) => !excluded.includes(other));
    return included.length > 1 ? [...excluded, year] : excluded;
}

const SLOTS: ReadonlyMap<string, number> = new Map([
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
]);

/** The `--chart-n` slot of each curve, by its exact upstream name. An unknown name takes the first unused slot, else `index mod 11`. */
export function curveSlots(names: string[]): number[] {
    const used = new Set(names.flatMap((name) => SLOTS.get(name) ?? []));
    return names.map((name, index) => {
        const known = SLOTS.get(name);
        if (known !== undefined) {
            return known;
        }
        const free = Array.from({ length: 11 }, (_, slot) => slot + 1).find((slot) => !used.has(slot));
        if (free === undefined) {
            return (index % 11) + 1;
        }
        used.add(free);
        return free;
    });
}

export type CutoffCase = "none" | "before" | "inside";

/** Where the Access Cut-off falls against the plotted days. */
export function cutoffCase(cutoff: Cutoff | null, firstAt: number, lastAt: number): CutoffCase {
    if (!cutoff || cutoff.at >= lastAt) {
        return "none";
    }
    return cutoff.at < firstAt ? "before" : "inside";
}

const PRODUCTS: Record<Cutoff["source"], string> = { "tia-pro": "TIA Pro", "indicator-suite": "TIA Indicator Suite" };

export function notice({ date, trial, source }: Cutoff): string {
    return trial
        ? `Your free trial includes cycle projections up to ${date}. You get the full projection when your ${PRODUCTS[source]} subscription starts.`
        : `Your ${PRODUCTS[source]} subscription includes cycle projections up to ${date}. Later projections appear when your subscription renews.`;
}

export const zoneLabel = ({ trial }: Cutoff): string => (trial ? "Available after trial" : "Available after renewal");

/** The tooltip header: "Oct 10 · day 283", in UTC. */
export function dayLabel(at: number): string {
    const date = new Date(at);
    const day = Math.round((at - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
    return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · day ${day}`;
}

export type TooltipRow = { name: string; slot: number; value: string };

/** One row per shown curve with a value on day `at`, in list order. */
export function tooltipRows(curves: CurveData[], hidden: string[], at: number): TooltipRow[] {
    const slots = curveSlots(curves.map(({ name }) => name));
    return curves.flatMap(({ name, points }, index) => {
        const value = hidden.includes(name) ? null : (points.find(([day]) => day === at)?.[1] ?? null);
        return value === null ? [] : [{ name, slot: slots[index], value: formatReturn(value) }];
    });
}

/** The Block attributes a stored pick is tied to. */
export const ATTRIBUTE_KEYS = ["asset", "baseYear"] as const;

/** The x zoom in percent of the year. */
export type Zoom = { start: number; end: number };

export const FULL_ZOOM: Zoom = { start: 0, end: 100 };

/** One instance's view. Curves are hidden by name, so a hidden curve stays hidden on every asset that has it. */
export type InstancePick = { asset: string; baseYear: number; hidden: string[]; log: boolean; zoom: Zoom };

/** What `localStorage` keeps: year exclusions per asset for every instance, and each instance's view. */
export type Memory = { excluded: Record<string, Exclusions>; instances: Record<string, InstanceEntry<InstancePick>> };

export const EMPTY_MEMORY: Memory = { excluded: {}, instances: {} };

const isRecordOf = (value: unknown, check: (entry: unknown) => boolean) => isObject(value) && Object.values(value).every(check);

const isIntegers = (value: unknown) => Array.isArray(value) && value.every((entry) => Number.isInteger(entry));

const isPick = (value: unknown) =>
    isObject(value) &&
    typeof value.asset === "string" &&
    Number.isInteger(value.baseYear) &&
    Array.isArray(value.hidden) &&
    value.hidden.every((name) => typeof name === "string") &&
    typeof value.log === "boolean" &&
    isObject(value.zoom) &&
    Number.isFinite(value.zoom.start) &&
    Number.isFinite(value.zoom.end);

const isEntry = (value: unknown) =>
    isObject(value) &&
    isRecordOf(value.attributes, (attribute) => attribute === null || typeof attribute === "string" || typeof attribute === "number") &&
    isPick(value.pick);

export const isMemory = (value: unknown): value is Memory =>
    isObject(value) && isRecordOf(value.excluded, (entry) => isRecordOf(entry, isIntegers)) && isRecordOf(value.instances, isEntry);

export type View = { selection: Selection; hidden: string[]; log: boolean; zoom: Zoom };

/**
 * The view to start with: the stored one unless the attributes changed. A stored asset that is gone falls back to
 * the attribute rule, and its zoom to the whole year; a stored Base Year that is gone, to the attribute rule.
 */
export function restore(
    attributes: Record<string, unknown>,
    entry: InstanceEntry<InstancePick> | undefined,
    assets: Asset[],
    now: Date
): View | null {
    const pick = storedPick(entry, attributes, ATTRIBUTE_KEYS);
    const asset = pick && assets.find(({ id }) => id === pick.asset);
    const kept = { hidden: pick?.hidden ?? [], log: pick?.log ?? false };
    if (!pick || !asset) {
        const selection = pickSelection(attributes, assets, now);
        return selection && { selection, ...kept, zoom: FULL_ZOOM };
    }
    const baseYear = asset.base_years.includes(pick.baseYear) ? pick.baseYear : attributes.baseYear;
    const selection = pickSelection({ asset: asset.id, baseYear }, [asset], now);
    const start = clamp(pick.zoom.start, 0, 100);
    return selection && { selection, ...kept, zoom: { start, end: clamp(pick.zoom.end, start, 100) } };
}

/** Reset has something to do: a hidden curve on any asset, an excluded year of this asset, or a zoom. */
export const canReset = (hidden: string[], excluded: Exclusions, zoom: Zoom): boolean =>
    hidden.length > 0 || Object.values(excluded).some((years) => years.length > 0) || zoom.start > 0 || zoom.end < 100;

/** Epoch ms of the 12 UTC month starts of `year`. */
export const monthStarts = (year: number): number[] => Array.from({ length: 12 }, (_, month) => Date.UTC(year, month, 1));
