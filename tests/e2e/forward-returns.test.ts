import { expect, test, type Page } from "@playwright/test";
import { logIn, wp } from "./wp";

const renderBlock = `do_blocks( '<!-- wp:tia-elements/forward-returns /-->' ); echo defined( 'DONOTCACHEPAGE' ) ? 'no-cache' : 'cache';`;

test("a logged-out visitor sees the Purchase card with the price and the Log in link", async ({ page }) => {
    const price = wp("eval", "echo html_entity_decode( wp_strip_all_tags( wc_get_product( 19339 )->get_price_html() ) );").replace(
        /\s+/g,
        " "
    );
    const product = wp("eval", "echo wc_get_product( 19339 )->get_permalink();");

    await page.goto("/forward-returns/");
    const block = page.locator(".wp-block-tia-elements-forward-returns");

    await expect(block.getByRole("heading", { name: "Forward Returns is part of TIA Pro." })).toBeVisible();
    await expect(block.getByText("Subscribe to see Forward Returns for every asset.")).toBeVisible();
    await expect(block.getByRole("link", { name: `Get TIA Pro · ${price}` })).toHaveAttribute("href", product);
    await expect(block.getByText("Already a member?")).toBeVisible();
    await expect(block.getByRole("link", { name: "Log in" })).toHaveAttribute("href", /\/wp-login\.php\?redirect_to=.*forward-returns/);
});

test("the Block keeps a logged-out page cacheable and opts a logged-in page out", () => {
    expect(wp("eval", renderBlock)).toBe("cache");
    expect(wp("eval", renderBlock, "--user=admin")).toBe("no-cache");
});

const assetsRoute = "/wp-json/tia-data/v1/forward-returns/assets";

const block = (page: Page) => page.locator(".wp-block-tia-elements-forward-returns");

/** GETs a REST route as the logged-in user: cookie auth needs the `wp_rest` nonce. */
async function restGet(page: Page, path: string, switches?: string) {
    const nonce = await (await page.request.get("/wp-admin/admin-ajax.php?action=rest-nonce")).text();
    return page.request.get(path, { headers: { "X-WP-Nonce": nonce, ...(switches && { "X-Tia-Elements-Test": switches }) } });
}

test("an anonymous REST call gets 401 tia_data_logged_out", async ({ request }) => {
    const response = await request.get(assetsRoute);
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ code: "tia_data_logged_out", data: { status: 401 } });
});

test("a non-Member gets 403 tia_data_not_member", async ({ page }) => {
    await logIn(page, "fx-other-paid");
    const response = await restGet(page, assetsRoute, "supabase-stub");
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "tia_data_not_member", data: { status: 403 } });
});

test("a Member gets 503 tia_data_access_unavailable when the WooCommerce read fails", async ({ page }) => {
    await logIn(page, "fx-pro-pending-cancel");
    const response = await restGet(page, assetsRoute, "supabase-stub,wcs-unavailable");
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({ code: "tia_data_access_unavailable", data: { status: 503 } });
});

test("a Member sees the Forward Returns table from the stubbed rows", async ({ page, context }) => {
    await logIn(page, "fx-pro-on-hold-overdue");
    await context.addCookies([{ name: "tia_elements_test", value: "supabase-stub", url: "http://localhost:8000" }]);
    await page.goto("/forward-returns/");
    const table = page.locator(".wp-block-tia-elements-forward-returns").getByRole("table");

    await expect(table.locator("thead").getByRole("columnheader")).toHaveText([
        "Year",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
    ]);
    await expect(table.locator("tbody").getByRole("rowheader")).toHaveText(["2026", "2025", "2024"]);
    const cells = (year: string) =>
        table
            .getByRole("row")
            .filter({ has: page.getByRole("rowheader", { name: year }) })
            .getByRole("cell");
    await expect(cells("2026")).toHaveText(Array<string>(12).fill(""));
    await expect(cells("2025")).toHaveText(["+5.50%", "\u22122.75%", "+0.30%", "+1.90%", "\u22124.40%", "", "", "", "", "", "", ""]);
    await expect(cells("2024")).toHaveText([
        "+0.50%",
        "\u22123.20%",
        "0.00%",
        "+4.75%",
        "\u22121.10%",
        "+2.40%",
        "+3.21%",
        "\u22122.10%",
        "+1.05%",
        "+6.30%",
        "\u22120.40%",
        "+2.20%"
    ]);

    await block(page).getByRole("radio", { name: "Quarterly" }).click();
    await expect(table.locator("thead").getByRole("columnheader")).toHaveText(["Year", "Jan", "Apr", "Jul", "Oct"]);

    await block(page).getByRole("combobox", { name: "Asset" }).click();
    await expect(block(page).getByRole("group", { name: "Crypto" }).getByRole("option")).toHaveText(["Bitcoin - BTC", "Ethereum - ETH"]);
    await block(page).getByRole("combobox", { name: "Search assets…" }).fill("eth");
    await expect(block(page).getByRole("option")).toHaveText(["Ethereum - ETH"]);
    await block(page).getByRole("option", { name: "Ethereum - ETH" }).click();
    await expect(block(page).getByRole("radio", { name: "Quarterly" })).toBeChecked();
    await expect(block(page).getByRole("radio")).toHaveCount(2);
});
