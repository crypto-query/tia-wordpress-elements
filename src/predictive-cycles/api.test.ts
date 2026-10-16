import { afterEach, describe, expect, it, vi } from "vitest";
import { post } from "../shared/api";
import { getPredictiveCycles } from "./api";

vi.mock("../shared/api", () => ({ get: vi.fn(), post: vi.fn() }));

afterEach(() => {
    vi.mocked(post).mockReset();
});

describe("getPredictiveCycles", () => {
    it("POSTs the request as it is", async () => {
        vi.mocked(post).mockResolvedValue({ data: {}, cutoff: null });
        const request = { id: "btc", base_year: 2026, curves: [{ id: 0 }, { id: 3, years: [2014, 2018] }, { id: 7 }] };

        await getPredictiveCycles(request, new AbortController().signal);

        expect(post).toHaveBeenCalledWith("/tia-data/v1/predictive-cycles/data", request, expect.any(AbortSignal));
    });

    it("loads once per asset, Base Year and years of each year-curve", async () => {
        vi.mocked(post).mockResolvedValue({ data: {}, cutoff: null });
        const signal = new AbortController().signal;
        const request = (base_year: number, years: number[]) => ({ id: "eth", base_year, curves: [{ id: 0 }, { id: 1, years }] });

        await getPredictiveCycles(request(2026, [2014, 2018]), signal);
        await getPredictiveCycles(request(2026, [2014, 2018]), signal);
        expect(post).toHaveBeenCalledTimes(1);

        await getPredictiveCycles(request(2026, [2014]), signal);
        await getPredictiveCycles(request(2025, [2014, 2018]), signal);
        expect(post).toHaveBeenCalledTimes(3);
    });
});
