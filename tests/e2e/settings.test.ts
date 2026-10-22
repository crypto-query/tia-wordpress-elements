import { expect, test, type Page } from "@playwright/test";
import { logIn, restoreOption, snapshotOption, wp, type OptionSnapshot } from "./wp";

test.describe.configure({ mode: "serial" });

let snapshots: OptionSnapshot[] = [];

// A save under a stub cookie writes the stubbed URLs and keys into the options, so every option is restored.
test.beforeAll(() => {
    snapshots = [
        "tia_supabase_url",
        "tia_supabase_key",
        "tia_data_server_url",
        "tia_stripe_key",
        "tia_stripe_suite_product",
        "tia_member_roles",
        "tia_forward_returns_assets",
        "tia_predictive_cycles_assets",
        "tia_decennial_cycles_assets"
    ].map(snapshotOption);
});

test.afterAll(() => {
    snapshots.forEach(restoreOption);
});

const cookie = (value: string) => ({ name: "tia_elements_test", value, url: "http://localhost:8000" });

async function openSettings(page: Page) {
    await logIn(page, "admin", "admin");

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

test("Test connection reports the data server", async ({ page, context }) => {
    await openSettings(page);

    await context.addCookies([cookie("data-server-stub")]);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Data server: connected (HTTP 200).")).toBeVisible();

    await context.addCookies([cookie("data-server-forbidden")]);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Data server: HTTP 403: this server's egress IP is not on the data server allowlist.")).toBeVisible();
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

test("an admin disables an asset, and the asset route no longer lists it", async ({ page, context }) => {
    // The earlier tests leave a fake Stripe key and no Member role; both would keep the Member out of the route.
    for (const option of ["tia_predictive_cycles_assets", "tia_stripe_key", "tia_member_roles"]) {
        wp("option", "delete", option);
    }
    await context.addCookies([cookie("data-server-stub,supabase-stub")]);

    await openSettings(page);
    const field = page.getByRole("group", { name: "Predictive Cycles assets" });
    const source = page.locator("tr", { has: field }).getByText(/^Source: /);
    await expect(source).toHaveText("Source: default");
    // Group, then label; `foo` is in no list, so it is off in the first group.
    await expect(field.locator("label")).toHaveText(["Bitcoin - BTC", "Foo - not enabled", "Gold - XAU", "Dow Jones Industrial - DJI"]);
    await expect(field.getByRole("combobox", { name: "Group of Gold - XAU" })).toHaveValue("Metals");

    await field.getByRole("checkbox", { name: "Gold - XAU" }).uncheck();
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(source).toHaveText("Source: option");
    await expect(field.getByRole("checkbox", { name: "Gold - XAU" })).not.toBeChecked();

    await context.clearCookies();
    await logIn(page, "fx-pro-active");
    const nonce = await (await page.request.get("/wp-admin/admin-ajax.php?action=rest-nonce")).text();
    const response = await page.request.get("/wp-json/tia-data/v1/predictive-cycles/assets", {
        headers: { "X-WP-Nonce": nonce, "X-Tia-Elements-Test": "data-server-stub" }
    });
    expect(response.status(), await response.text()).toBe(200);
    expect(((await response.json()) as { id: string }[]).map(({ id }) => id)).toEqual(["btc", "dji"]);
});

test("with upstream down the saved list shows read-only, and a save of another field keeps it", async ({ page, context }) => {
    const saved = [
        { id: "btc", group: "Crypto" },
        { id: "gone", group: "Metals" }
    ];
    wp("option", "update", "tia_predictive_cycles_assets", JSON.stringify(saved), "--format=json");
    await context.addCookies([cookie("data-server-forbidden,supabase-stub")]);

    await openSettings(page);
    const field = page.getByRole("group", { name: "Predictive Cycles assets" });
    await expect(field.getByText("The upstream asset list is not available now.")).toBeVisible();
    await expect(field.getByRole("row")).toHaveText([/Asset\s*Group/, /btc\s*Crypto/, /gone\s*Metals/]);
    await expect(field.getByRole("checkbox")).toHaveCount(0);

    await page.getByLabel("Suite product ID").fill("prod_e2e");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(page.getByLabel("Suite product ID")).toHaveValue("prod_e2e");
    expect(JSON.parse(wp("option", "get", "tia_predictive_cycles_assets", "--format=json"))).toEqual(saved);
});
