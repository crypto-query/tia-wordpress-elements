import type { Asset, Selection, YearReturns } from "./api";

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type Tone = "positive" | "negative" | "zero" | "none";

/** The Block's attributes if the asset list still has them, else the first asset and its smallest period. */
export function pickSelection(attributes: Record<string, unknown>, assets: Asset[]): Selection | null {
    const match = assets.find(({ base, quote }) => base === attributes.base && quote === attributes.quote);
    const asset = match ?? assets[0];
    if (!asset) {
        return null;
    }
    const period =
        match && typeof attributes.period === "number" && asset.periods.includes(attributes.period) ? attributes.period : asset.periods[0];
    return period === undefined ? null : { base: asset.base, quote: asset.quote, period };
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

/** "+3.21%", "−2.10%" with U+2212, "0.00%" for a real 0, "" for null. */
export function formatReturn(value: number | null): string {
    if (value === null) {
        return "";
    }
    const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function toneOf(value: number | null): Tone {
    if (value === null) {
        return "none";
    }
    return value > 0 ? "positive" : value < 0 ? "negative" : "zero";
}
