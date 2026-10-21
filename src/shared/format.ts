// Sign and tone follow the shown 2 decimals, so a value that shows as 0.00% is a 0.
export const roundToShown = (value: number) => Number(value.toFixed(2));

/** "+3.21%", "−2.10%" with U+2212, "0.00%" for a real 0, "" for null. */
export function formatReturn(value: number | null): string {
    if (value === null) {
        return "";
    }
    value = roundToShown(value);
    const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

const tickNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 });

/** Axis tick: "−10%" with U+2212, "0%", "20%"; keeps the tick's own precision and no "+". */
export function formatTick(value: number): string {
    return `${value < 0 ? "\u2212" : ""}${tickNumber.format(Math.abs(value))}%`;
}
