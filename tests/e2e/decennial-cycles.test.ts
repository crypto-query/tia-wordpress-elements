import { expect, test, type Page } from "@playwright/test";
import { logIn, restoreOption, snapshotOption, wp, type OptionSnapshot } from "./wp";

type Asset = { id: string; name: string; title: string; range: { begin: number; end: number }; group: string };
type Data = { id: string; curve: { name: string; datapoints: { dec: number; value: number | null }[] } };

// A stored Stripe key would send non-Members to real Stripe.
let stripeKey: OptionSnapshot;

test.beforeAll(() => {
    stripeKey = snapshotOption("tia_stripe_key");
    wp("option", "delete", "tia_stripe_key");
    wp("eval", "TIA_Elements_Stripe_Entitlement_Source::delete_transients();");
});

test.afterAll(() => {
    restoreOption(stripeKey);
});

const assetsRoute = "/wp-json/tia-data/v1/decennial-cycles/assets";
const dataRoute = "/wp-json/tia-data/v1/decennial-cycles/data";
const stub = "data-server-stub";

/** Cookie auth needs the `wp_rest` nonce. */
async function headers(page: Page, switches: string) {
    const nonce = await (await page.request.get("/wp-admin/admin-ajax.php?action=rest-nonce")).text();
    return { "X-WP-Nonce": nonce, "X-Tia-Elements-Test": switches };
}

async function getData(page: Page, query: string, switches = stub) {
    return page.request.get(`${dataRoute}${query}`, { headers: await headers(page, switches) });
}

test.describe("the REST routes", () => {
    test("a logged-out call gets 401", async ({ request }) => {
        for (const route of [assetsRoute, `${dataRoute}?id=dji`]) {
            const response = await request.get(route, { headers: { "X-Tia-Elements-Test": stub } });
            expect(response.status(), route).toBe(401);
        }
    });

    test("a non-Member gets 403 tia_data_not_member", async ({ page }) => {
        await logIn(page, "fx-no-role");
        for (const route of [assetsRoute, `${dataRoute}?id=dji`]) {
            const response = await page.request.get(route, { headers: await headers(page, stub) });
            expect(response.status(), route).toBe(403);
            expect(await response.json(), route).toMatchObject({ code: "tia_data_not_member", data: { status: 403 } });
        }
    });

    test("the asset list holds the enabled indices by name, and leaves foo out", async ({ page }) => {
        await logIn(page, "fx-pro-active");
        const response = await page.request.get(assetsRoute, { headers: await headers(page, stub) });
        expect(response.status()).toBe(200);
        const assets = (await response.json()) as Asset[];
        expect(assets.map(({ id }) => id)).toEqual(["xao", "xjo", "dji", "ndx", "spx"]);
        expect(assets[2]).toEqual({
            id: "dji",
            name: "Dow Jones Industrial - DJI",
            title: "Dow Jones Industrial 10-Year Cycle",
            range: { begin: 1897, end: 2025 },
            group: "Indices"
        });
    });

    test("the data is the first curve, every row of the decade", async ({ page }) => {
        await logIn(page, "fx-pro-active");
        const response = await getData(page, "?id=dji");
        expect(response.status()).toBe(200);
        const body = (await response.json()) as Data;
        expect(body.id).toBe("dji");
        expect(body.curve.name).toBe("Gain");
        expect(body.curve.datapoints).toHaveLength(3660);
        expect(body.curve.datapoints[0]).toEqual({ dec: 0, value: 0 });
        expect(body.curve.datapoints[366].dec).toBe(1);
        expect(body.curve.datapoints[3659].dec).toBeCloseTo(3659 / 366, 9);
    });

    test("a Trial user gets the data", async ({ page }) => {
        await logIn(page, "fx-pro-trial");
        expect((await page.request.get(assetsRoute, { headers: await headers(page, stub) })).status()).toBe(200);
        const response = await getData(page, "?id=dji");
        expect(response.status()).toBe(200);
        expect(((await response.json()) as Data).curve.datapoints).toHaveLength(3660);
    });

    test("a missing, unknown or not enabled id gives 400 rest_invalid_param", async ({ page }) => {
        await logIn(page, "fx-pro-active");
        for (const query of ["", "?id=", "?id=nope", "?id=foo", "?id[]=dji"]) {
            const response = await getData(page, query);
            expect(response.status(), query).toBe(400);
            expect(await response.json(), query).toMatchObject({ code: "rest_invalid_param" });
        }
    });

    test("an upstream 500 or 400 gives 502 tia_data_upstream", async ({ page }) => {
        await logIn(page, "fx-pro-active");
        for (const error of ["data-server-no-data", "data-server-bad-request"]) {
            const response = await getData(page, "?id=dji", `${stub},${error}`);
            expect(response.status(), error).toBe(502);
            expect(await response.json(), error).toMatchObject({ code: "tia_data_upstream", data: { status: 502 } });
        }
    });

    test("a table with no curve gives 404 tia_data_not_found", async ({ page }) => {
        await logIn(page, "fx-pro-active");
        const response = await getData(page, "?id=dji", `${stub},data-server-no-curve`);
        expect(response.status()).toBe(404);
        expect(await response.json()).toMatchObject({ code: "tia_data_not_found", data: { status: 404 } });
    });
});

test.describe("the Block", () => {
    const block = (page: Page) => page.locator(".wp-block-tia-elements-decennial-cycles");
    const chart = (page: Page) => block(page).getByRole("img", { name: "Decennial Cycles chart, All Ordinaries - XAO, 1959–2025" });

    async function open(page: Page, user: string, switches = stub) {
        await logIn(page, user);
        await page.context().addCookies([{ name: "tia_elements_test", value: switches, url: "http://localhost:8000" }]);
        await page.goto("/decennial-cycles/");
    }

    test("a Member sees the spinner, then the caption and the chart of the first asset", async ({ page }) => {
        let release = () => {};
        const held = new Promise<void>((resolve) => (release = resolve));
        await page.route(
            (url) => decodeURIComponent(url.href).includes("decennial-cycles/data"),
            async (route) => {
                await held;
                await route.continue();
            }
        );
        await open(page, "fx-pro-active");

        await expect(block(page).getByText("All Ordinaries 10-Year Cycle · 1959–2025")).toBeVisible();
        await expect(block(page).getByRole("status", { name: "Loading Decennial Cycles" })).toBeVisible();
        release();
        await expect(chart(page)).toBeVisible();
        await expect(block(page).getByRole("status")).toHaveCount(0);
    });

    test("a non-Member sees the Purchase card and no chart", async ({ page }) => {
        await open(page, "fx-no-role");
        await expect(block(page).getByRole("heading", { name: "Decennial Cycles is part of TIA Pro." })).toBeVisible();
        await expect(block(page).getByRole("img")).toHaveCount(0);
    });

    test("a Trial user sees the chart and no card", async ({ page }) => {
        await open(page, "fx-pro-trial");
        await expect(chart(page)).toBeVisible();
        await expect(block(page).getByRole("heading")).toHaveCount(0);
    });

    test("an upstream failure shows the error and Try again", async ({ page }) => {
        await open(page, "fx-pro-active", `${stub},data-server-no-data`);
        await expect(block(page).getByText("This data is not available right now.")).toBeVisible();
        await expect(block(page).getByRole("button", { name: "Try again" })).toBeVisible();
        await expect(chart(page)).toHaveCount(0);
    });

    test("an admin picks the default asset in the inspector and the preview follows", async ({ page }) => {
        const id = wp(
            "post",
            "create",
            "--post_type=page",
            "--post_title=Decennial Cycles e2e",
            "--post_content=<!-- wp:tia-elements/decennial-cycles /-->",
            "--porcelain"
        );
        try {
            await logIn(page, "admin", "admin");
            await page.context().addCookies([{ name: "tia_elements_test", value: stub, url: "http://localhost:8000" }]);
            await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
            const preview = page.frameLocator('iframe[name="editor-canvas"]').locator(".wp-block-tia-elements-decennial-cycles");

            await preview.getByText("All Ordinaries 10-Year Cycle · 1959–2025").click();
            const inspector = page.getByRole("region", { name: "Editor settings" });
            await expect(inspector.getByRole("combobox", { name: "Asset" })).toHaveValue("");
            await inspector.getByRole("combobox", { name: "Asset" }).selectOption("dji");
            await expect(preview.getByText("Dow Jones Industrial 10-Year Cycle · 1897–2025")).toBeVisible();
        } finally {
            wp("post", "delete", id, "--force");
        }
    });

    test("an editor who is not a Member sees the placeholder and read-only defaults", async ({ page }) => {
        const id = wp(
            "post",
            "create",
            "--post_type=page",
            "--post_title=Decennial Cycles e2e",
            "--post_content=<!-- wp:tia-elements/decennial-cycles /-->",
            "--porcelain"
        );
        const user = wp(
            "user",
            "create",
            "dc-e2e-editor",
            "dc-e2e-editor@example.test",
            "--role=editor",
            "--user_pass=password",
            "--porcelain"
        );
        try {
            wp("user", "meta", "update", user, "wp_persisted_preferences", '{"core/edit-post":{"welcomeGuide":false}}', "--format=json");
            await logIn(page, "dc-e2e-editor");
            await page.context().addCookies([{ name: "tia_elements_test", value: stub, url: "http://localhost:8000" }]);
            await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
            const preview = page.frameLocator('iframe[name="editor-canvas"]').locator(".wp-block-tia-elements-decennial-cycles");

            await expect(preview.getByText("Preview needs TIA Pro access")).toBeVisible();
            await expect(preview.getByRole("img")).toHaveCount(0);
            await preview.getByText("Preview needs TIA Pro access").click();
            const inspector = page.getByRole("region", { name: "Editor settings" });
            await expect(inspector.getByText("Asset: First asset")).toBeVisible();
            await expect(inspector.getByRole("combobox", { name: "Asset" })).toHaveCount(0);
        } finally {
            wp("user", "delete", user, "--yes");
            wp("post", "delete", id, "--force");
        }
    });
});
