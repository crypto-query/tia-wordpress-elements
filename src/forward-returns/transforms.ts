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
