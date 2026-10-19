import { expect, type Page } from "@playwright/test";
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

/** Logs a user in through the login form; seeded users (`bun run wp:seed`) have the password `password`. */
export async function logIn(page: Page, login: string, password = "password") {
    await page.goto("/wp-login.php");
    // WordPress focuses and selects the username 200 ms after load; a later fill would land in it.
    await expect(page.getByLabel("Username or Email Address")).toBeFocused();
    await page.getByLabel("Username or Email Address").fill(login);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/wp-login.php"));
}
