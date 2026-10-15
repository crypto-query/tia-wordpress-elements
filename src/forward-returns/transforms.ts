import type { Asset, Selection, YearReturns } from "./api";

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type Tone = "positive" | "negative" | "zero" | "none";

/** The Holding Periods a Member can pick, by length in months: the ones the data route accepts. */
const HOLDING_PERIODS = new Map([
    [1, "Monthly"],
    [3, "Quarterly"],
    [6, "Semiannually"],
    [12, "Annually"]
]);

export const assetKey = ({ base, quote }: { base: string; quote: string }) => `${base}/${quote}`;

/** The asset's Holding Periods as radio options. */
export function periodOptions(asset: Asset): { value: string; label: string }[] {
    return asset.periods.flatMap((period) => {
        const label = HOLDING_PERIODS.get(period);
        return label ? [{ value: String(period), label }] : [];
    });
}

/** The asset with `period` if it has that Holding Period, else with its smallest one. */
export function selectAsset({ base, quote, periods }: Asset, period?: number): Selection | null {
    const kept = period !== undefined && periods.includes(period) ? period : periods[0];
    return kept === undefined ? null : { base, quote, period: kept };
}

/** The Block's attributes if the asset list still has them, else the first asset and its smallest period. */
export function pickSelection(attributes: Record<string, unknown>, assets: Asset[]): Selection | null {
    const match = assets.find(({ base, quote }) => base === attributes.base && quote === attributes.quote);
    const asset = match ?? assets[0];
    return asset ? selectAsset(asset, match && typeof attributes.period === "number" ? attributes.period : undefined) : null;
}

/** The Entry Months (1–12) of a Holding Period, from the calendar rather than the data. */
export function entryMonths(period: number, offset = 0): number[] {
    const months = [];
    for (let month = 1 + offset; month <= 12; month += period) {
        months.push(month);
    }
    return months;
}

export const cellValue = (year: YearReturns, month: number): number | null =>
    year.months.find((entry) => entry.month === month)?.value ?? null;

// Sign and tone follow the shown 2 decimals, so a value that shows as 0.00% is a 0.
const shown = (value: number) => Number(value.toFixed(2));

/** "+3.21%", "−2.10%" with U+2212, "0.00%" for a real 0, "" for null. */
export function formatReturn(value: number | null): string {
    if (value === null) {
        return "";
    }
    value = shown(value);
    const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function toneOf(value: number | null): Tone {
    if (value === null) {
        return "none";
    }
    value = shown(value);
    return value > 0 ? "positive" : value < 0 ? "negative" : "zero";
}

/** Months since year 0, so month arithmetic crosses year ends. */
const monthIndex = (year: number, month: number) => year * 12 + month - 1;

/** A cell whose last month is the current UTC month or later: its period has not ended yet. */
export const isPartial = (year: number, month: number, period: number, now: Date): boolean =>
    monthIndex(year, month) + period - 1 >= monthIndex(now.getUTCFullYear(), now.getUTCMonth() + 1);

/** What a Member left out for one asset and Holding Period. A cell is keyed by Year and Entry Month, so it belongs to one Entry Offset. */
export type Exclusions = { years: number[]; cells: string[] };

export const cellKey = (year: number, month: number) => `${year}-${month}`;

export const toggle = <T>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];

export type CellState = "empty" | "partial" | "year-excluded" | "excluded" | "counted";

export function cellState(year: number, month: number, value: number | null, period: number, exclusions: Exclusions, now: Date): CellState {
    if (value === null) {
        return "empty";
    }
    if (isPartial(year, month, period, now)) {
        return "partial";
    }
    if (exclusions.years.includes(year)) {
        return "year-excluded";
    }
    return exclusions.cells.includes(cellKey(year, month)) ? "excluded" : "counted";
}

/** Returns is Wins ÷ Totals in percent to 2 decimals, null when nothing counts. */
export type Results = { totals: number; wins: number; losses: number; returns: number | null };

/** The results of one Entry Month column. A cell counts when it is not Excluded, not Partial and not null. */
export function columnResults(years: YearReturns[], month: number, period: number, exclusions: Exclusions, now: Date): Results {
    const results: Results = { totals: 0, wins: 0, losses: 0, returns: null };
    for (const row of years) {
        const value = cellValue(row, month);
        if (cellState(row.year, month, value, period, exclusions, now) !== "counted") {
            continue;
        }
        results.totals++;
        const tone = toneOf(value);
        results.wins += Number(tone === "positive");
        results.losses += Number(tone === "negative");
    }
    if (results.totals > 0) {
        results.returns = Math.round((results.wins / results.totals) * 10000) / 100;
    }
    return results;
}

export const formatRate = (rate: number | null) => (rate === null ? "\u2014" : `${rate.toFixed(2)}%`);

const monthName = (index: number) => `${MONTH_NAMES[index % 12]} ${Math.floor(index / 12)}`;

/** "Jan 2024 – Mar 2024", "May 2024" for one month, "Jan 2026 – today" for a Partial cell. */
export function periodLabel(year: number, month: number, period: number, now: Date): string {
    const start = monthIndex(year, month);
    if (isPartial(year, month, period, now)) {
        return `${monthName(start)} \u2013 today`;
    }
    return period === 1 ? monthName(start) : `${monthName(start)} \u2013 ${monthName(start + period - 1)}`;
}
