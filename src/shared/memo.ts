type Pending<T> = { promise: Promise<T>; controller: AbortController; waiting: number };

/**
 * Wraps a load in a module-level memo keyed by `key`. Only successful values are kept.
 * Callers that miss the same key at once share one load; it aborts only when every caller has aborted.
 */
export function memoize<A, T>(load: (args: A, signal: AbortSignal) => Promise<T>, key: (args: A) => string) {
    // Boxed, so a memoized `undefined` still counts as a hit.
    const values = new Map<string, { value: T }>();
    const pending = new Map<string, Pending<T>>();

    const drop = (id: string, entry: Pending<T>) => {
        if (pending.get(id) === entry) {
            pending.delete(id);
        }
    };

    function start(args: A, id: string): Pending<T> {
        const controller = new AbortController();
        const promise = load(args, controller.signal).then((value) => {
            values.set(id, { value });
            return value;
        });
        const entry = { promise, controller, waiting: 0 };
        pending.set(id, entry);
        promise.then(
            () => drop(id, entry),
            () => drop(id, entry)
        );
        return entry;
    }

    return (args: A, signal?: AbortSignal): Promise<T> => {
        const id = key(args);
        const hit = values.get(id);
        if (hit) {
            return Promise.resolve(hit.value);
        }
        if (signal?.aborted) {
            return Promise.reject(signal.reason);
        }
        const entry = pending.get(id) ?? start(args, id);
        entry.waiting++;
        return new Promise<T>((resolve, reject) => {
            const leave = () => {
                reject(signal?.reason);
                if (--entry.waiting === 0) {
                    entry.controller.abort();
                    drop(id, entry);
                }
            };
            signal?.addEventListener("abort", leave, { once: true });
            entry.promise.then(resolve, reject).finally(() => signal?.removeEventListener("abort", leave));
        });
    };
}
