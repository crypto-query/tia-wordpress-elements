/** One instance's last pick and the attribute values it was made under; an unset attribute is `null`. */
export type InstanceEntry<P> = { attributes: Record<string, unknown>; pick: P };

/** The listed attributes, with `null` for an unset one, so a missing attribute and `null` compare equal. */
export const normalise = (attributes: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
    Object.fromEntries(keys.map((key) => [key, attributes[key] ?? null]));

/** The stored pick if no listed attribute changed since it was stored, else `null`: the new default wins. */
export function storedPick<P>(entry: InstanceEntry<P> | undefined, attributes: Record<string, unknown>, keys: readonly string[]): P | null {
    if (!entry) {
        return null;
    }
    return keys.every((key) => (entry.attributes[key] ?? null) === (attributes[key] ?? null)) ? entry.pick : null;
}

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
