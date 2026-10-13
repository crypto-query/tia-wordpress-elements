import { expect, test, type Page } from "@playwright/test";
import { restoreOption, snapshotOption, wp, type OptionSnapshot } from "./wp";

test.describe.configure({ mode: "serial" });

let snapshots: OptionSnapshot[] = [];

test.beforeAll(() => {
    snapshots = ["tia_stripe_key", "tia_member_roles"].map(snapshotOption);
});

test.afterAll(() => {
    snapshots.forEach(restoreOption);
});

async function openSettings(page: Page) {
    await page.goto("/wp-login.php");
    await page.getByLabel("Username or Email Address").fill("admin");
    await page.getByLabel("Password", { exact: true }).fill("admin");
    await page.getByRole("button", { name: "Log In" }).click();

    await page.goto("/wp-admin/options-general.php?page=tia-elements-settings");
}

test("a saved secret is never shown again, and a blank submit keeps it", async ({ page }) => {
    const secret = `rk_test_e2e_${Date.now()}`;
    wp("option", "delete", "tia_stripe_key");

    await openSettings(page);
    const key = page.getByLabel("Stripe restricted key");
    const source = page.locator("tr", { has: key }).getByText(/^Source: /);
    await expect(source).toHaveText("Source: unset");

    await key.fill(secret);
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(key).toHaveValue("");
    await expect(key).toHaveAttribute("autocomplete", "new-password");
    expect(await page.content()).not.toContain(secret);
    await expect(source).toHaveText("Source: option");

    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(source).toHaveText("Source: option");
});

test("saving the page unchanged keeps the member roles default unsaved", async ({ page }) => {
    wp("option", "delete", "tia_member_roles");

    await openSettings(page);
    const roles = page.getByRole("group", { name: "Member roles" });
    const source = page.locator("tr", { has: roles }).getByText(/^Source: /);
    await expect(source).toHaveText("Source: default");
    await expect(roles.getByRole("checkbox", { name: "TIA Pro - Annual" })).toBeChecked();

    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(source).toHaveText("Source: default");
    expect(() => wp("option", "get", "tia_member_roles")).toThrow();

    for (const box of await roles.getByRole("checkbox").all()) {
        await box.uncheck();
    }
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(source).toHaveText("Source: option");
});
