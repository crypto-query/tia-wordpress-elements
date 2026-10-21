import { get } from "../shared/api";
import { memoize } from "../shared/memo";

export type Asset = {
    id: string;
    name: string;
    title: string;
    range: { begin: number; end: number };
    group: "Crypto" | "Stocks" | "Metals" | "Indices";
};

/** `dec` is the decade position, 0 to under 10, in steps of 1/366. */
export type Datapoint = { dec: number; value: number | null };

export type DecennialCycles = { id: string; curve: { name: string; datapoints: Datapoint[] } };

/** The asset list, loaded once for every Block on the page. */
export const getAssets = memoize(
    (_: void, signal) => get<Asset[]>("/tia-data/v1/decennial-cycles/assets", signal),
    () => "assets"
);

/** One asset's 10-Year Cycle, memoized for every Block on the page. */
export const getDecennialCycles = memoize(
    (id: string, signal: AbortSignal) => get<DecennialCycles>(`/tia-data/v1/decennial-cycles/data?id=${encodeURIComponent(id)}`, signal),
    (id) => id
);
