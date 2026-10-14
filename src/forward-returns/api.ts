import { get } from "../shared/api";

/** One `base/quote` pair with the Holding Periods it has data for, ascending. */
export type Asset = { title: string; base: string; quote: string; periods: number[] };

export type MonthReturn = { month: number; value: number | null };

/** Months 1–12 of one Year. */
export type YearReturns = { year: number; months: MonthReturn[] };

/** Years newest first. */
export type PeriodReturns = { period: number; returns: YearReturns[] };

export type ForwardReturns = { title: string; base: string; quote: string; periods: PeriodReturns[] };

export type Selection = { base: string; quote: string; period: number };

export const getAssets = (signal?: AbortSignal) => get<Asset[]>("/tia-data/v1/forward-returns/assets", signal);

export function getForwardReturns({ base, quote, period }: Selection, signal?: AbortSignal) {
    const query = new URLSearchParams({ base, quote, period: String(period) });
    return get<ForwardReturns>(`/tia-data/v1/forward-returns/data?${query}`, signal);
}
