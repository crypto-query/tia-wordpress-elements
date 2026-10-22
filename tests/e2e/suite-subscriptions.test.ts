import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { logIn, wp } from "./wp";

test.beforeAll(() => {
    wp("eval", "TIA_Elements_Stripe_Entitlement_Source::delete_transients();");
});

const panel = (page: Page) => page.locator(".white-panel");
const suite = (page: Page) => panel(page).locator("table.tia-suite-subscriptions");

/** Logs in a seeded user with the Stripe stub on, and opens the My Account subscriptions endpoint. */
async function open(page: Page, context: BrowserContext, login: string) {
    await logIn(page, login);
    await context.addCookies([{ name: "tia_elements_test", value: "stripe-stub", url: "http://localhost:8000" }]);
    await page.goto("/my-account/subscriptions/");
}

test("the Suite table renders under the WooCommerce Subscriptions table", async ({ page, context }) => {
    await open(page, context, "fx-pro-active");

    const wcs = panel(page).locator("table.woocommerce-MyAccount-subscriptions");
    await expect(wcs).toBeVisible();
    await expect(suite(page)).toBeVisible();
    const below = await wcs.evaluate(
        (table, next) => !!(table.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING),
        await suite(page).elementHandle()
    );
    expect(below).toBe(true);

    // The store's own price format: a site can filter the symbol, as the live one does.
    const price = wp("eval", 'echo html_entity_decode( wp_strip_all_tags( wc_price( 999, array( "currency" => "USD" ) ) ) );');
    await expect(suite(page).getByRole("rowgroup").last().getByRole("row")).toHaveCount(1);
    await expect(suite(page).locator("tbody td")).toHaveText([
        "TIA Indicator Suite",
        "Active",
        /^\s*-\s+Billing paused\. Ends \w+ \d{1,2}, \d{4}\s*$/,
        `${price} / year`,
        ""
    ]);
});

test("a Suite subscriber without a WooCommerce subscription does not see the no-subscriptions message", async ({ page, context }) => {
    await open(page, context, "fx-no-role");

    await expect(suite(page)).toBeVisible();
    await expect(page.locator(".no_subscriptions")).toBeHidden();
    await expect(suite(page).locator("tbody td:nth-child(2)")).toHaveText([
        "Active",
        "Pending cancellation",
        "Active",
        "Active",
        "Payment overdue",
        "Paused",
        "Pending"
    ]);
});

test("a user with no Suite subscription sees the page as WooCommerce draws it", async ({ page, context }) => {
    await open(page, context, "fx-other-paid");

    await expect(page.locator(".no_subscriptions")).toBeVisible();
    // Neither the table nor its <style>.
    expect(await page.content()).not.toContain("tia-suite-subscriptions");
});
