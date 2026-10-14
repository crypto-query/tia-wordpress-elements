/**
 * Wraps a load in a module-level memo keyed by `key`. Only successful values are kept.
 * shortcut: two callers that miss the same key at once both load it; share the in-flight request if that shows up in practice.
 */
export function memoize<A, T>(load: (args: A, signal?: AbortSignal) => Promise<T>, key: (args: A) => string) {
    // Boxed, so a memoized `undefined` still counts as a hit.
    const values = new Map<string, { value: T }>();
    return async (args: A, signal?: AbortSignal): Promise<T> => {
        const id = key(args);
        const hit = values.get(id);
        if (hit) {
            return hit.value;
        }
        const value = await load(args, signal);
        values.set(id, { value });
        return value;
    };
}
