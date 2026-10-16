import { get, post } from "../shared/api";
import { memoize } from "../shared/memo";

/** A curve the asset offers; a year-curve lists its `years`. */
export type Curve = { id: number; name?: string; info?: string; years?: number[]; static?: number[] };

export type Asset = {
    id: string;
    name: string;
    title: string;
    range: { begin: number; end: number };
    base: string;
    quote: string;
    group: "Crypto" | "Stocks" | "Metals" | "Indices";
    /** Newest first. */
    base_years: number[];
    /** Upstream order. */
    curves: Curve[];
};

/** `at` is epoch ms at UTC midnight of the day. */
export type Point = [at: number, value: number | null];

export type CurveData = { id: number; name: string; points: Point[] };

export type Cutoff = { at: number; date: string; trial: boolean; source: "tia-pro" | "indicator-suite" };

export type PredictiveCycles = {
    data: { id: string; base_year: number; curves: CurveData[] };
    cutoff: Cutoff | null;
};

export type Selection = { asset: Asset; baseYear: number };

/** The asset list, loaded once for every Block on the page. */
export const getAssets = memoize(
    (_: void, signal) => get<Asset[]>("/tia-data/v1/predictive-cycles/assets", signal),
    () => "assets"
);

/** A year-curve lists the years (or offsets) it keeps; any other curve sends only its id. */
export type CurveRequest = { id: number; years?: number[] };

export type DataRequest = { id: string; base_year: number; curves: CurveRequest[] };

/** The curves of one asset and Base Year, a year-curve averaged over its sent years; memoized for every Block on the page. */
export const getPredictiveCycles = memoize(
    (request: DataRequest, signal: AbortSignal) => post<PredictiveCycles>("/tia-data/v1/predictive-cycles/data", request, signal),
    ({ id, base_year, curves }) => [id, base_year, ...curves.flatMap(({ years }) => (years ? [years.join(",")] : []))].join("/")
);
