import { afterEach, describe, expect, it, vi } from "vitest";
import { Stored } from "./storage.svelte";

const key = "tia-elements:test";
const isCount = (value: unknown): value is { count: number } =>
    typeof value === "object" && value !== null && "count" in value && typeof value.count === "number";
const empty = { count: 0 };

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("Stored", () => {
    it("reads a value of the right shape", () => {
        localStorage.setItem(key, JSON.stringify({ count: 3 }));
        expect(new Stored(key, isCount, empty).current).toEqual({ count: 3 });
    });

    it.each([
        ["nothing stored", null],
        ["JSON that fails to parse", "{"],
        ["another shape", JSON.stringify({ count: "3" })]
    ])("starts empty with %s, and the next write overwrites it", (_, raw) => {
        if (raw !== null) {
            localStorage.setItem(key, raw);
        }
        const stored = new Stored(key, isCount, empty);
        expect(stored.current).toBe(empty);

        stored.set({ count: 1 });
        expect(stored.current).toEqual({ count: 1 });
        expect(localStorage.getItem(key)).toBe(JSON.stringify({ count: 1 }));
    });

    it("keeps the value in memory only with a null key", () => {
        const setItem = vi.spyOn(Storage.prototype, "setItem");
        const stored = new Stored(null, isCount, empty);
        stored.set({ count: 4 });
        expect(stored.current).toEqual({ count: 4 });
        expect(setItem).not.toHaveBeenCalled();
    });

    it("runs from memory with no error when storage fails", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("denied", "SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError");
        });
        const error = vi.spyOn(console, "error");
        const warn = vi.spyOn(console, "warn");

        const stored = new Stored(key, isCount, empty);
        expect(stored.current).toBe(empty);
        expect(() => stored.set({ count: 2 })).not.toThrow();
        expect(stored.current).toEqual({ count: 2 });
        expect(error).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
});
