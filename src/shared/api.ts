import apiFetch, { type APIFetchOptions } from "@wordpress/api-fetch";

/** What a failed request means to the reader: `invalid` reads as `unavailable` and goes to the console. */
export type ErrorKind = "access" | "unavailable" | "invalid";

export class ApiError extends Error {
    override name = "ApiError";

    constructor(
        readonly kind: ErrorKind,
        options?: ErrorOptions
    ) {
        super(`The request failed: ${kind}.`, options);
    }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Maps anything apiFetch throws to an error kind. A WP REST error carries its HTTP status in `data.status`. */
export function errorKind(error: unknown): ErrorKind {
    const status = isObject(error) && isObject(error.data) ? error.data.status : undefined;
    if (status === 401 || status === 403) {
        return "access";
    }
    return status === 400 ? "invalid" : "unavailable";
}

/** GETs a REST path through the core `wp-api-fetch` handle, which already adds the root URL and the nonce. */
export const get = <T>(path: string, signal?: AbortSignal): Promise<T> => request<T>({ path, signal });

/** POSTs `body` as JSON to a REST path, with the same error kinds as `get`. */
export const post = <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>({ path, method: "POST", data: body, signal });

async function request<T>(options: APIFetchOptions<true>): Promise<T> {
    try {
        return await apiFetch<T>(options);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
        }
        const kind = errorKind(error);
        if (kind === "invalid") {
            console.error("The REST request was rejected as invalid.", error);
        }
        throw new ApiError(kind, { cause: error });
    }
}
