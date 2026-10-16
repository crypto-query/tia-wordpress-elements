import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { logIn, restoreOption, snapshotOption, wp, type OptionSnapshot } from "./wp";

type Curve = { id: number; years?: number[]; static?: number[] };
type Asset = { id: string; base_years: number[]; curves: Curve[] };
type Cutoff = { at: number; date: string; trial: boolean; source: "tia-pro" | "indicator-suite" };
type Data = { data: { curves: { points: [number, number | null][] }[] }; cutoff: Cutoff | null };

// A stored Stripe key would send non-Members to real Stripe; only the Suite tests turn the Stripe stub on.
let stripeKey: OptionSnapshot;

test.beforeAll(() => {
    stripeKey = snapshotOption("tia_stripe_key");
    wp("option", "delete", "tia_stripe_key");
    wp("eval", "TIA_Elements_Stripe_Entitlement_Source::delete_transients();");
});

test.afterAll(() => {
    restoreOption(stripeKey);
});

const assetsRoute = "/wp-json/tia-data/v1/predictive-cycles/assets";
const dataRoute = "/wp-json/tia-data/v1/predictive-cycles/data";
const stub = "data-server-stub";
const suiteStub = "data-server-stub,stripe-stub";

const block = (page: Page) => page.locator(".wp-block-tia-elements-predictive-cycles");

/** Cookie auth needs the `wp_rest` nonce. */
async function headers(page: Page, switches: string) {
    const nonce = await (await page.request.get("/wp-admin/admin-ajax.php?action=rest-nonce")).text();
    return { "X-WP-Nonce": nonce, "X-Tia-Elements-Test": switches };
}

async function assets(page: Page, switches = stub): Promise<Asset[]> {
    const response = await page.request.get(assetsRoute, { headers: await headers(page, switches) });
    expect(response.status()).toBe(200);
    return (await response.json()) as Asset[];
}

/** Every curve of the asset, with all its years on a year-curve, as the client sends them. */
const allCurves = (asset: Asset) => asset.curves.map(({ id, years }) => (years ? { id, years } : { id }));

async function post(page: Page, body: unknown, switches = stub) {
    return page.request.post(dataRoute, { headers: await headers(page, switches), data: body });
}

async function data(page: Page, asset: Asset, baseYear: number, switches = stub): Promise<Data> {
    const response = await post(page, { id: asset.id, base_year: baseYear, curves: allCurves(asset) }, switches);
    expect(response.status()).toBe(200);
    return (await response.json()) as Data;
}

/** The user's cut-off, read from the default asset's data. */
async function cutoffOf(page: Page, switches = stub): Promise<Cutoff> {
    const [first] = await assets(page, switches);
    const { cutoff } = await data(page, first, first.base_years[0], switches);
    if (cutoff === null) throw new Error("the user has no cut-off");
    return cutoff;
}

const createPage = (baseYear: number) =>
    wp(
        "post",
        "create",
        "--post_type=page",
        "--post_status=publish",
        "--post_title=Predictive Cycles e2e",
        `--post_content=<!-- wp:tia-elements/predictive-cycles {"baseYear":${baseYear}} /-->`,
        "--porcelain"
    );

/**
 * Opens a page on the Base Year of the first day after the cut-off, so the notice shows; returns the page ID to delete.
 * A Dec 31 cut-off hides nothing in its own year, so its page shows the next year, all gray.
 */
async function openAtCutoff(page: Page, context: BrowserContext, switches: string) {
    const cutoff = await cutoffOf(page, switches);
    const year = new Date(cutoff.at + 86_400_000).getUTCFullYear();
    const id = createPage(year);
    await context.addCookies([{ name: "tia_elements_test", value: switches, url: "http://localhost:8000" }]);
    await page.goto(`/?page_id=${id}`);
    await expect(block(page).getByRole("group", { name: `Predictive Cycles chart, BTC, Base Year ${year}` })).toBeVisible();
    return { id, cutoff };
}

test("an anonymous REST call gets 401", async ({ request }) => {
    const response = await request.get(assetsRoute, { headers: { "X-Tia-Elements-Test": stub } });
    expect(response.status()).toBe(401);
});

test("a non-Member gets 403 tia_data_not_member and sees the Purchase card", async ({ page, context }) => {
    await logIn(page, "fx-no-role");
    const response = await page.request.get(assetsRoute, { headers: await headers(page, stub) });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "tia_data_not_member", data: { status: 403 } });

    await context.addCookies([{ name: "tia_elements_test", value: stub, url: "http://localhost:8000" }]);
    await page.goto("/predictive-cycles/");
    await expect(block(page).getByRole("heading", { name: "Predictive Cycles is part of TIA Pro." })).toBeVisible();
    await expect(block(page).getByRole("group")).toHaveCount(0);
});

test("a Member's data holds no value after the cut-off in any Base Year", async ({ page }) => {
    await logIn(page, "fx-pro-active");
    const [first] = await assets(page);
    let after = 0;
    let before = 0;
    for (const year of first.base_years) {
        const { cutoff, data: body } = await data(page, first, year);
        expect(cutoff).toMatchObject({ source: "tia-pro", trial: false });
        expect(typeof cutoff?.date).toBe("string");
        const at = cutoff?.at ?? 0;
        for (const { points } of body.curves) {
            for (const [time, value] of points) {
                if (time > at) {
                    after++;
                    expect(value, `value at ${new Date(time).toISOString()}`).toBeNull();
                } else if (value !== null) {
                    before++;
                }
            }
        }
    }
    // The stub's Base Years run two years past now, so both sides of the cut-off are covered.
    expect(after).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
});

test("a validation failure gives 400 rest_invalid_param", async ({ page }) => {
    await logIn(page, "fx-pro-active");
    const list = await assets(page);
    const btc = list.find(({ id }) => id === "btc");
    const dji = list.find(({ id }) => id === "dji");
    if (!btc || !dji) throw new Error("the stub lists btc and dji");
    const staticCurve = dji.curves.find((curve) => curve.static);
    if (!staticCurve) throw new Error("dji has a static curve");
    const curves = allCurves(btc);

    const bodies = {
        "unknown asset": { id: "nope", base_year: btc.base_years[0], curves },
        "unlisted Base Year": { id: "btc", base_year: 1900, curves },
        "duplicate curve": { id: "btc", base_year: btc.base_years[0], curves: [curves[0], curves[0]] },
        "years on a static curve": { id: "dji", base_year: dji.base_years[0], curves: [{ id: staticCurve.id, years: [2020] }] }
    };
    for (const [name, body] of Object.entries(bodies)) {
        const response = await post(page, body);
        expect(response.status(), name).toBe(400);
        expect(await response.json(), name).toMatchObject({ code: "rest_invalid_param" });
    }
});

test("an upstream 400 on a valid request gives 502 tia_data_upstream", async ({ page }) => {
    await logIn(page, "fx-pro-active");
    const [first] = await assets(page);
    const body = { id: first.id, base_year: first.base_years[0], curves: allCurves(first) };
    const response = await post(page, body, `${stub},data-server-bad-request`);
    expect(response.status()).toBe(502);
    expect(await response.json()).toMatchObject({ code: "tia_data_upstream", data: { status: 502 } });
});

test("a Member sees the spinner, then the chart", async ({ page, context }) => {
    await logIn(page, "fx-pro-active");
    await context.addCookies([{ name: "tia_elements_test", value: stub, url: "http://localhost:8000" }]);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
        (url) => decodeURIComponent(url.href).includes("predictive-cycles/data"),
        async (route) => {
            await held;
            await route.continue();
        }
    );
    await page.goto("/predictive-cycles/");

    await expect(block(page).getByRole("status", { name: "Loading Predictive Cycles" })).toBeVisible();
    release();
    const year = new Date().getUTCFullYear();
    await expect(block(page).getByRole("group", { name: `Predictive Cycles chart, BTC, Base Year ${year}` })).toBeVisible();
});

test.describe("a page on the Base Year of the first hidden day", () => {
    let id = "";
    test.afterEach(() => {
        if (id) wp("post", "delete", id, "--force");
        id = "";
    });

    test("a Member sees the TIA Pro notice with the cut-off date", async ({ page, context }) => {
        await logIn(page, "fx-pro-active");
        const opened = await openAtCutoff(page, context, stub);
        id = opened.id;
        await expect(
            block(page).getByText(
                `Your TIA Pro subscription includes cycle projections up to ${opened.cutoff.date}. Later projections appear when your subscription renews.`
            )
        ).toBeVisible();
    });

    test("a TIA Pro Trial user sees the chart and the trial notice", async ({ page, context }) => {
        await logIn(page, "fx-pro-trial");
        const opened = await openAtCutoff(page, context, stub);
        id = opened.id;
        expect(opened.cutoff).toMatchObject({ source: "tia-pro", trial: true });
        await expect(
            block(page).getByText(
                `Your free trial includes cycle projections up to ${opened.cutoff.date}. You get the full projection when your TIA Pro subscription starts.`
            )
        ).toBeVisible();
        await expect(block(page).getByRole("heading", { name: /unlocks after your trial/ })).toHaveCount(0);
    });

    test("a TIA Indicator Suite subscriber sees the Suite notice", async ({ page, context }) => {
        await logIn(page, "fx-suite-active");
        const opened = await openAtCutoff(page, context, suiteStub);
        id = opened.id;
        expect(opened.cutoff).toMatchObject({ source: "indicator-suite", trial: false });
        await expect(
            block(page).getByText(
                `Your TIA Indicator Suite subscription includes cycle projections up to ${opened.cutoff.date}. Later projections appear when your subscription renews.`
            )
        ).toBeVisible();
    });

    test("a TIA Indicator Suite Trial user sees the Suite trial notice", async ({ page, context }) => {
        await logIn(page, "fx-suite-trial");
        const opened = await openAtCutoff(page, context, suiteStub);
        id = opened.id;
        expect(opened.cutoff).toMatchObject({ source: "indicator-suite", trial: true });
        await expect(
            block(page).getByText(
                `Your free trial includes cycle projections up to ${opened.cutoff.date}. You get the full projection when your TIA Indicator Suite subscription starts.`
            )
        ).toBeVisible();
    });
});
