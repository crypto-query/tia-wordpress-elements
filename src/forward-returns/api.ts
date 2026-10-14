import { get } from "../shared/api";
import { memoize } from "../shared/memo";

/** One `base/quote` pair, its group in the asset select, and the Holding Periods it has data for, ascending. */
export type Asset = { title: string; base: string; quote: string; group: string; periods: number[] };

export type MonthReturn = { month: number; value: number | null };

/** Months 1–12 of one Year. */
export type YearReturns = { year: number; months: MonthReturn[] };

/** Years newest first. */
export type PeriodReturns = { period: number; returns: YearReturns[] };

export type ForwardReturns = { title: string; base: string; quote: string; periods: PeriodReturns[] };

export type Selection = { base: string; quote: string; period: number };

/** The asset list, loaded once for every Block on the page. */
export const getAssets = memoize(
    (_: void, signal) => get<Asset[]>("/tia-data/v1/forward-returns/assets", signal),
    () => "assets"
);

/** One asset's returns for one Holding Period, memoized by `base/quote/period` for every Block on the page. */
export const getForwardReturns = memoize(
    ({ base, quote, period }: Selection, signal: AbortSignal) => {
        const query = new URLSearchParams({ base, quote, period: String(period) });
        return get<ForwardReturns>(`/tia-data/v1/forward-returns/data?${query}`, signal);
    },
    ({ base, quote, period }) => `${base}/${quote}/${period}`
);
