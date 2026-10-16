import { afterEach, describe, expect, it, vi } from "vitest";
import { post } from "../shared/api";
import { getPredictiveCycles, type Asset } from "./api";

vi.mock("../shared/api", () => ({ get: vi.fn(), post: vi.fn() }));

afterEach(() => {
    vi.mocked(post).mockReset();
});

const asset = (id: string, curves: Asset["curves"]): Asset => ({
    id,
    name: id,
    title: id,
    range: { begin: 2010, end: 2026 },
    base: id,
    quote: "usd",
    group: "Crypto",
    base_years: [2026],
    curves
});

describe("getPredictiveCycles", () => {
    it("POSTs every curve of the asset, a year-curve with all its years", async () => {
        vi.mocked(post).mockResolvedValue({ data: {}, cutoff: null });
        const curves = [{ id: 0, name: "Actual" }, { id: 3, name: "Y2 Midterm", years: [2014, 2018] }, { id: 7 }];

        await getPredictiveCycles({ asset: asset("btc", curves), baseYear: 2026 }, new AbortController().signal);

        expect(post).toHaveBeenCalledWith(
            "/tia-data/v1/predictive-cycles/data",
            { id: "btc", base_year: 2026, curves: [{ id: 0 }, { id: 3, years: [2014, 2018] }, { id: 7 }] },
            expect.any(AbortSignal)
        );
    });

    it("loads once per asset, Base Year and years of each year-curve", async () => {
        vi.mocked(post).mockResolvedValue({ data: {}, cutoff: null });
        const signal = new AbortController().signal;
        const curves = [{ id: 1, years: [2014, 2018] }];

        await getPredictiveCycles({ asset: asset("eth", curves), baseYear: 2026 }, signal);
        await getPredictiveCycles({ asset: asset("eth", [...curves]), baseYear: 2026 }, signal);
        expect(post).toHaveBeenCalledTimes(1);

        await getPredictiveCycles({ asset: asset("eth", [{ id: 1, years: [2014] }]), baseYear: 2026 }, signal);
        await getPredictiveCycles({ asset: asset("eth", curves), baseYear: 2025 }, signal);
        expect(post).toHaveBeenCalledTimes(3);
    });
});
