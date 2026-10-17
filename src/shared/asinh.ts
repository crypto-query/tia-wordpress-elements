/** The Log scale of the cycle charts: `asinh` reads like a log for large values, yet is defined at 0 and below. */
export const toAsinh = (value: number | null): number | null => (value === null ? null : Math.asinh(value));

/**
 * Tick values, in real units, for an `asinh` axis over `[min, max]`: 0 and ±1, 2, 5 × 10ⁿ, or only ±10ⁿ on a
 * wide range, from the last tick at or below `min` to the first one above it at or above `max`.
 */
export function asinhTicks(min: number, max: number): number[] {
    const top = Math.max(Math.abs(min), Math.abs(max), 1);
    const steps = Math.asinh(max) - Math.asinh(min) > 8 ? [1] : [1, 2, 5];
    const positive: number[] = [];
    for (let power = 1; positive.length === 0 || power / 10 < top; power *= 10) {
        positive.push(...steps.map((step) => step * power));
    }
    const all = [...positive.map((value) => -value).reverse(), 0, ...positive];
    const lower = all.findLast((value) => value <= min) ?? all[0];
    const upper = all.find((value) => value >= max && value > lower) ?? all[all.length - 1];
    return all.filter((value) => value >= lower && value <= upper);
}
