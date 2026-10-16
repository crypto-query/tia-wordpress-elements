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

/** Every curve of the asset for one Base Year, memoized for every Block on the page. */
export const getPredictiveCycles = memoize(
    ({ asset, baseYear }: Selection, signal: AbortSignal) =>
        post<PredictiveCycles>(
            "/tia-data/v1/predictive-cycles/data",
            {
                id: asset.id,
                base_year: baseYear,
                curves: asset.curves.map(({ id, years }) => (years ? { id, years } : { id }))
            },
            signal
        ),
    ({ asset, baseYear }) => [asset.id, baseYear, ...asset.curves.flatMap(({ years }) => (years ? [years.join(",")] : []))].join("/")
);
