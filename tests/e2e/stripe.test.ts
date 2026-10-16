import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { logIn, wp } from "./wp";

test.beforeAll(() => {
    wp("eval", "TIA_Elements_Stripe_Entitlement_Source::delete_transients();");
});

const block = (page: Page) => page.locator(".wp-block-tia-elements-forward-returns");

/** Logs in a seeded user with the Stripe and Supabase stubs on, and opens Forward Returns. */
async function open(page: Page, context: BrowserContext, login: string) {
    await logIn(page, login);
    await context.addCookies([{ name: "tia_elements_test", value: "stripe-stub,supabase-stub", url: "http://localhost:8000" }]);
    await page.goto("/forward-returns/");
}

test("a TIA Indicator Suite subscriber sees the Forward Returns table", async ({ page, context }) => {
    await open(page, context, "fx-suite-active");

    await expect(block(page).getByRole("grid").locator("tbody").getByRole("rowheader")).toHaveText(["2026", "2025", "2024"]);
});

test("a TIA Indicator Suite Trial user sees the Trial card", async ({ page, context }) => {
    await open(page, context, "fx-suite-trial");

    await expect(block(page).getByRole("heading", { name: "Forward Returns unlocks after your trial." })).toBeVisible();
    await expect(block(page).getByText("It becomes available when your TIA Indicator Suite subscription starts.")).toBeVisible();
    await expect(block(page).getByRole("link")).toHaveCount(0);
});

test("a paused TIA Indicator Suite subscriber sees the role-picked Purchase card", async ({ page, context }) => {
    await open(page, context, "fx-suite-paused");

    await expect(block(page).getByRole("heading", { name: "Forward Returns is part of TIA Pro." })).toBeVisible();
});

test("a Stripe failure without a WooCommerce grant shows the Unavailable card", async ({ page, context }) => {
    await open(page, context, "fx-suite-error");

    await expect(block(page).getByText("This data is not available right now.")).toBeVisible();
    await expect(block(page).getByRole("button", { name: "Try again" })).toBeVisible();
});
