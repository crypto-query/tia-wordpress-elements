/**
 * A value kept in `localStorage` under `key`, read once. Use one module-level instance per Block type,
 * so every instance in the bundle shares it and updates live. On storage failure it runs from memory.
 */
export class Stored<T> {
    readonly #key: string;
    #current: T;

    constructor(key: string, isShape: (value: unknown) => value is T, empty: T) {
        this.#key = key;
        this.#current = $state.raw(read(key, isShape, empty));
    }

    get current(): T {
        return this.#current;
    }

    set(value: T) {
        this.#current = value;
        try {
            localStorage.setItem(this.#key, JSON.stringify(value));
        } catch {
            // Full, denied or absent storage: the value lives on in memory.
        }
    }
}

function read<T>(key: string, isShape: (value: unknown) => value is T, empty: T): T {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        return isShape(value) ? value : empty;
    } catch {
        return empty;
    }
}
