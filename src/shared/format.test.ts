import { describe, expect, it } from "vitest";
import { formatReturn } from "./format";

describe("formatReturn", () => {
    it.each([
        [3.21, "+3.21%"],
        [-2.1, "\u22122.10%"],
        [0, "0.00%"],
        [-0, "0.00%"],
        [12.345678, "+12.35%"],
        [-0.001, "0.00%"],
        [0.004, "0.00%"],
        [-0.005, "\u22120.01%"],
        [null, ""]
    ])("formats %s as %j", (value, text) => {
        expect(formatReturn(value)).toBe(text);
    });
});
