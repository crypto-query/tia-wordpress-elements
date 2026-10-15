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

test("a Return Cell's tooltip touches the cell under the admin bar's html margin", async ({ page, context }) => {
    await logIn(page, "admin", "admin");
    await context.addCookies([{ name: "tia_elements_test", value: "supabase-stub", url: "http://localhost:8000" }]);
    await page.goto("/forward-returns/");
    await expect(page.locator("#wpadminbar")).toBeVisible();
    const cell = block(page).getByRole("checkbox", { name: "+3.21%" });

    await cell.hover();
    const box = await cell.boundingBox();
    if (box === null) throw new Error("the Return Cell has no box");
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2, { steps: 3 });
    const gap = async () => {
        const panel = await block(page).getByRole("tooltip").boundingBox();
        return panel === null ? null : box.y - (panel.y + panel.height);
    };

    // The arrow fills the gap; the bug left the panel 32 px higher, over the row or header above.
    await expect.poll(gap).toBeGreaterThanOrEqual(0);
    await expect.poll(gap).toBeLessThan(10);
});

const storageKey = "tia-elements:forward-returns";
const stub = { name: "tia_elements_test", value: "supabase-stub", url: "http://localhost:8000" };
const oneBlock = "<!-- wp:tia-elements/forward-returns /-->";

/** Publishes a page with `content` and returns its ID; delete it with `deletePage`. */
const createPage = (content: string) =>
    wp(
        "post",
        "create",
        "--post_type=page",
        "--post_status=publish",
        "--post_title=Forward Returns e2e",
        `--post_content=${content}`,
        "--porcelain"
    );

const deletePage = (id: string) => wp("post", "delete", id, "--force");

const headers = (scope: Page | ReturnType<typeof block>) => scope.locator("thead").getByRole("columnheader");

test("a Member's exclusion, Holding Period and Entry Offset survive a reload", async ({ page, context }) => {
    await logIn(page, "fx-pro-on-hold-overdue");
    await context.addCookies([stub]);
    await page.goto("/forward-returns/");

    await block(page).getByRole("radio", { name: "Quarterly" }).click();
    await block(page).getByRole("button", { name: "Next Entry Offset" }).click();
    await expect(headers(block(page))).toHaveText(["Year", "Feb", "May", "Aug", "Nov"]);
    await block(page).getByRole("checkbox", { name: "\u22123.20%" }).click();
    await expect(block(page).getByRole("checkbox", { name: "\u22123.20%" })).not.toBeChecked();

    await page.reload();
    await expect(block(page).getByRole("radio", { name: "Quarterly" })).toBeChecked();
    await expect(headers(block(page))).toHaveText(["Year", "Feb", "May", "Aug", "Nov"]);
    await expect(block(page).getByRole("checkbox", { name: "\u22123.20%" })).not.toBeChecked();
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toContain('"btc/usd/3"');
});

test("storage that holds bad JSON is ignored and overwritten", async ({ page, context }) => {
    await logIn(page, "fx-pro-on-hold-overdue");
    await context.addCookies([stub]);
    await page.evaluate((key) => localStorage.setItem(key, "{not json"), storageKey);
    await page.goto("/forward-returns/");

    await expect(block(page).getByRole("table").locator("tbody").getByRole("rowheader")).toHaveText(["2026", "2025", "2024"]);
    await block(page).getByRole("checkbox", { name: "+3.21%" }).click();
    await expect
        .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as unknown, storageKey))
        .toMatchObject({ excluded: { "btc/usd/1": { years: [], cells: ["2024-7"] } } });
});

test.describe("two Blocks on one page", () => {
    let id = "";
    test.beforeEach(() => {
        id = createPage(oneBlock + oneBlock);
    });
    test.afterEach(() => deletePage(id));

    test("share exclusions live and keep their own Holding Period", async ({ page, context }) => {
        await logIn(page, "fx-pro-on-hold-overdue");
        await context.addCookies([stub]);
        await page.goto(`/?page_id=${id}`);
        const [first, second] = [block(page).first(), block(page).nth(1)];

        await first.getByRole("checkbox", { name: "+3.21%" }).click();
        await expect(second.getByRole("checkbox", { name: "+3.21%" })).not.toBeChecked();

        await first.getByRole("radio", { name: "Quarterly" }).click();
        await page.reload();
        await expect(first.getByRole("radio", { name: "Quarterly" })).toBeChecked();
        await expect(second.getByRole("radio", { name: "Monthly" })).toBeChecked();
        await expect(second.getByRole("checkbox", { name: "+3.21%" })).not.toBeChecked();
    });
});

test.describe("one Block on its own page", () => {
    let id = "";
    test.beforeEach(() => {
        id = createPage(oneBlock);
    });
    test.afterEach(() => deletePage(id));

    test("a changed default in the attributes beats the stored pick", async ({ page, context }) => {
        await logIn(page, "fx-pro-on-hold-overdue");
        await context.addCookies([stub]);
        await page.goto(`/?page_id=${id}`);
        await block(page).getByRole("radio", { name: "Quarterly" }).click();
        await page.reload();
        await expect(block(page).getByRole("radio", { name: "Quarterly" })).toBeChecked();

        wp("post", "update", id, `--post_content=<!-- wp:tia-elements/forward-returns {"base":"btc","quote":"usd","period":12} /-->`);
        await page.reload();
        await expect(block(page).getByRole("radio", { name: "Annually", exact: true })).toBeChecked();
    });

    test("an admin sees the live preview in the editor and the inspector defaults", async ({ page, context }) => {
        await logIn(page, "admin", "admin");
        await context.addCookies([stub]);
        await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
        const preview = page.frameLocator('iframe[name="editor-canvas"]').locator(".wp-block-tia-elements-forward-returns");

        await expect(preview.getByRole("table").locator("tbody").getByRole("rowheader")).toHaveText(["2026", "2025", "2024"]);
        await preview.getByText("Forward Return results").click();
        const inspector = page.getByRole("region", { name: "Editor settings" });
        await expect(inspector.getByRole("combobox", { name: "Asset" })).toBeVisible();
        await inspector.getByRole("radio", { name: "Quarterly" }).check();
        await expect(headers(preview)).toHaveText(["Year", "Jan", "Apr", "Jul", "Oct"]);
    });

    test("an editor who is not a Member sees the placeholder and read-only defaults", async ({ page, context }) => {
        const user = wp(
            "user",
            "create",
            "fx-e2e-editor",
            "fx-e2e-editor@example.test",
            "--role=editor",
            "--user_pass=password",
            "--porcelain"
        );
        try {
            wp("user", "meta", "update", user, "wp_persisted_preferences", '{"core/edit-post":{"welcomeGuide":false}}', "--format=json");
            await logIn(page, "fx-e2e-editor");
            await context.addCookies([stub]);
            await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
            const canvas = page.frameLocator('iframe[name="editor-canvas"]');

            await canvas.getByText("Preview needs TIA Pro access").click();
            const inspector = page.getByRole("region", { name: "Editor settings" });
            await expect(inspector.getByText("Asset: First asset")).toBeVisible();
            await expect(inspector.getByText("Holding Period: Smallest")).toBeVisible();
            await expect(inspector.getByRole("combobox", { name: "Asset" })).toHaveCount(0);
        } finally {
            wp("user", "delete", user, "--yes");
        }
    });
});
