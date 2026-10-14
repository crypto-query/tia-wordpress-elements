import { describe, expect, it, vi } from "vitest";
import { memoize } from "./memo";

const load = () => vi.fn(async (id: number) => ({ id }));

describe("memoize", () => {
    it("loads each key once and shares the value with every caller", async () => {
        const fetch = load();
        const get = memoize(fetch, (id) => String(id));

        const first = await get(1);
        expect(await get(1)).toBe(first);
        await get(2);

        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("passes the signal to the load", async () => {
        const fetch = load();
        const signal = new AbortController().signal;
        await memoize(fetch, String)(1, signal);
        expect(fetch).toHaveBeenCalledWith(1, signal);
    });

    it("does not keep a failed load", async () => {
        const fetch = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("ok");
        const get = memoize(fetch, String);

        await expect(get(1)).rejects.toThrow("down");
        expect(await get(1)).toBe("ok");
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
