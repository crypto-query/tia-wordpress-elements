import { describe, expect, it } from "vitest";
import { asinhTicks, toAsinh } from "./asinh";

describe("toAsinh", () => {
    it("maps 0 to 0, keeps the sign and passes null through", () => {
        expect(toAsinh(0)).toBe(0);
        expect(toAsinh(-10)).toBeCloseTo(-Math.asinh(10));
        expect(toAsinh(100)).toBeCloseTo(5.2983);
        expect(toAsinh(null)).toBeNull();
    });
});

describe("asinhTicks", () => {
    it("steps 1, 2, 5 per decade on a narrow range, one tick past each end", () => {
        expect(asinhTicks(-8, 15)).toEqual([-10, -5, -2, -1, 0, 1, 2, 5, 10, 20]);
    });

    it("steps by decades on a wide range", () => {
        expect(asinhTicks(-80, 1000)).toEqual([-100, -10, -1, 0, 1, 10, 100, 1000]);
    });

    it("ends on a value that is a tick", () => {
        expect(asinhTicks(-1, 1)).toEqual([-1, 0, 1]);
        expect(asinhTicks(0, 50)).toEqual([0, 1, 2, 5, 10, 20, 50]);
    });

    it("spans at least two ticks for a flat line", () => {
        expect(asinhTicks(0, 0)).toEqual([0, 1]);
        expect(asinhTicks(5, 5)).toEqual([5, 10]);
        expect(asinhTicks(-3, -3)).toEqual([-5, -2]);
    });
});
