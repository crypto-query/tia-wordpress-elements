import apiFetch from "@wordpress/api-fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, errorKind, get } from "./api";

vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn() }));

const restError = (status: number, code = "some_code") => ({ code, message: "Generic message.", data: { status } });

describe("errorKind", () => {
    it.each([
        [401, "access"],
        [403, "access"],
        [400, "invalid"],
        [404, "unavailable"],
        [500, "unavailable"],
        [502, "unavailable"],
        [503, "unavailable"],
        [504, "unavailable"]
    ] as const)("maps a REST error with status %i to %s", (status, kind) => {
        expect(errorKind(restError(status))).toBe(kind);
    });

    it.each([
        ["a network failure", { code: "fetch_error", message: "You are probably offline." }],
        ["a body that is not JSON", { code: "invalid_json", message: "The response is not a valid JSON response." }],
        ["a TypeError", new TypeError("boom")],
        ["a string", "boom"],
        ["null", null],
        ["a status that is not a number", { data: { status: "401" } }]
    ])("maps %s to unavailable", (_, error) => {
        expect(errorKind(error)).toBe("unavailable");
    });
});

describe("get", () => {
    afterEach(() => {
        vi.mocked(apiFetch).mockReset();
        vi.restoreAllMocks();
    });

    it("returns the parsed body and passes the path and signal on", async () => {
        vi.mocked(apiFetch).mockResolvedValue([1, 2]);
        const signal = new AbortController().signal;

        await expect(get("/tia-data/v1/x", signal)).resolves.toEqual([1, 2]);
        expect(apiFetch).toHaveBeenCalledWith({ path: "/tia-data/v1/x", signal });
    });

    it("throws an ApiError with the kind of the failure", async () => {
        vi.mocked(apiFetch).mockRejectedValue(restError(403, "tia_data_not_member"));

        await expect(get("/x")).rejects.toEqual(expect.objectContaining({ name: "ApiError", kind: "access" }));
        await expect(get("/x")).rejects.toBeInstanceOf(ApiError);
    });

    it("logs an invalid request to the console", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const failure = restError(400, "rest_invalid_param");
        vi.mocked(apiFetch).mockRejectedValue(failure);

        await expect(get("/x")).rejects.toEqual(expect.objectContaining({ kind: "invalid" }));
        expect(log).toHaveBeenCalledWith(expect.any(String), failure);
    });

    it("lets an AbortError through unmapped", async () => {
        const abort = new DOMException("The operation was aborted.", "AbortError");
        vi.mocked(apiFetch).mockRejectedValue(abort);

        await expect(get("/x")).rejects.toBe(abort);
    });
});
