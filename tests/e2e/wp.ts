import { execFileSync } from "node:child_process";

/** Runs wp-cli on the Docker site and returns its trimmed output. */
export function wp(...args: string[]): string {
    return execFileSync("bash", ["scripts/wp-cli.sh", ...args], { encoding: "utf8" }).trim();
}

/** An option's JSON value, or `null` when the option does not exist. */
export type OptionSnapshot = { name: string; json: string | null };

export function snapshotOption(name: string): OptionSnapshot {
    try {
        return { name, json: wp("option", "get", name, "--format=json") };
    } catch {
        // `wp option get` exits non-zero when the option does not exist.
        return { name, json: null };
    }
}

export function restoreOption({ name, json }: OptionSnapshot): void {
    if (json === null) {
        wp("option", "delete", name);
    } else {
        wp("option", "update", name, json, "--format=json");
    }
}
