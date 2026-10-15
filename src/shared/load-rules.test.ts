import { describe, expect, it } from "vitest";
import { clamp, normalise, storedPick } from "./load-rules";

const keys = ["base", "quote", "period"] as const;
const entry = { attributes: { base: "btc", quote: "usd", period: null }, pick: "stored" };

describe("storedPick", () => {
    it("drops the pick when an attribute changed since it was stored", () => {
        expect(storedPick(entry, { base: "eth", quote: "usd" }, keys)).toBeNull();
        expect(storedPick(entry, { base: "btc", quote: "usd", period: 6 }, keys)).toBeNull();
    });

    it("keeps the pick when the attributes are unchanged", () => {
        expect(storedPick(entry, { base: "btc", quote: "usd", period: null }, keys)).toBe("stored");
    });

    it("treats a missing attribute and null as equal", () => {
        expect(storedPick(entry, { base: "btc", quote: "usd" }, keys)).toBe("stored");
        expect(storedPick({ ...entry, attributes: { base: "btc", quote: "usd" } }, { base: "btc", quote: "usd", period: null }, keys)).toBe(
            "stored"
        );
    });

    it("ignores attributes outside the key list", () => {
        expect(storedPick(entry, { base: "btc", quote: "usd", className: "wide" }, keys)).toBe("stored");
    });

    it("has no pick without a stored entry", () => {
        expect(storedPick(undefined, {}, keys)).toBeNull();
    });
});

describe("normalise", () => {
    it("keeps the listed attributes and sets an unset one to null", () => {
        expect(normalise({ base: "btc", className: "wide" }, keys)).toEqual({ base: "btc", quote: null, period: null });
    });
});

describe("clamp", () => {
    it("clamps a stored range into its bounds", () => {
        expect(clamp(9, 0, 5)).toBe(5);
        expect(clamp(-1, 0, 5)).toBe(0);
        expect(clamp(3, 0, 5)).toBe(3);
    });
});
