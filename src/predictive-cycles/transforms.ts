import type { Asset, Curve, Cutoff, DataRequest, Selection } from "./api";

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

/** Epoch ms of the 12 UTC month starts of `year`. */
export const monthStarts = (year: number): number[] => Array.from({ length: 12 }, (_, month) => Date.UTC(year, month, 1));
