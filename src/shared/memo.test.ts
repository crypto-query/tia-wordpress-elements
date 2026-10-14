import { describe, expect, it, vi } from "vitest";
import { memoize } from "./memo";

/** A load whose answers the test settles by hand, one per call. */
function manualLoad() {
    const calls: { signal: AbortSignal; resolve: (value: string) => void }[] = [];
    const load = vi.fn(
        (_: number, signal: AbortSignal) =>
            new Promise<string>((resolve, reject) => {
                calls.push({ signal, resolve });
                signal.addEventListener("abort", () => reject(signal.reason));
            })
    );
    return { load, calls };
}

describe("memoize", () => {
    it("loads each key once and shares the value with every caller", async () => {
        const load = vi.fn(async (id: number) => ({ id }));
        const get = memoize(load, String);

        const first = await get(1);
        expect(await get(1)).toBe(first);
        await get(2);

        expect(load).toHaveBeenCalledTimes(2);
    });

    it("does not keep a failed load", async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("ok");
        const get = memoize(load, String);

        await expect(get(1)).rejects.toThrow("down");
        expect(await get(1)).toBe("ok");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("shares one load between callers that miss the same key at once", async () => {
        const { load, calls } = manualLoad();
        const get = memoize(load, String);

        const both = Promise.all([get(1), get(1)]);
        calls[0]?.resolve("one");

        expect(await both).toEqual(["one", "one"]);
        expect(load).toHaveBeenCalledOnce();
    });

    it("keeps the shared load for the callers that still wait", async () => {
        const { load, calls } = manualLoad();
        const get = memoize(load, String);
        const leaving = new AbortController();

        const left = get(1, leaving.signal);
        const stayed = get(1, new AbortController().signal);
        leaving.abort();

        await expect(left).rejects.toThrow();
        expect(calls[0]?.signal.aborted).toBe(false);
        calls[0]?.resolve("one");
        expect(await stayed).toBe("one");
    });

    it("aborts the load when every caller has aborted, and loads again on the next call", async () => {
        const { load, calls } = manualLoad();
        const get = memoize(load, String);
        const first = new AbortController();
        const second = new AbortController();

        const results = [get(1, first.signal), get(1, second.signal)];
        first.abort();
        second.abort();

        await Promise.allSettled(results);
        expect(calls[0]?.signal.aborted).toBe(true);

        const again = get(1);
        calls[1]?.resolve("fresh");
        expect(await again).toBe("fresh");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("rejects at once for a signal that is already aborted, without a load", async () => {
        const { load } = manualLoad();
        await expect(memoize(load, String)(1, AbortSignal.abort())).rejects.toThrow();
        expect(load).not.toHaveBeenCalled();
    });
});
