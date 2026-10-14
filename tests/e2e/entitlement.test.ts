import { expect, test, type Page } from "@playwright/test";
import { wp } from "./wp";

const bootCard = `echo wp_json_encode( TIA_Elements_Blocks::boot( 'tia-elements/forward-returns', array() )['card'] );`;

/** The seeded users (`bun run wp:seed`) and the card each one gets; null = Member. */
const users: [login: string, card: string | null][] = [
    ["fx-no-role", "purchase"],
    ["fx-other-paid", "upgrade"],
    ["fx-active-membership", "upgrade"],
    ["fx-premium", "upgrade"],
    ["fx-pro-active", null],
    ["fx-pro-pending-cancel", null],
    ["fx-pro-on-hold-overdue", null],
    ["fx-pro-no-subs", null],
    ["fx-pro-other-product", null],
    ["fx-elite", null],
    ["fx-two-member-subs", null],
    ["fx-pro-trial", "trial"],
    ["fx-pro-cancel-in-trial", "trial"],
    ["fx-pro-dead", "purchase"],
    ["fx-stale-pro-role", "purchase"],
    ["fx-sub-no-role", "purchase"]
];

for (const [login, card] of users) {
    test(`${login} gets the ${card ?? "Member (null)"} card in the boot JSON`, () => {
        const boot = JSON.parse(wp("eval", bootCard, `--user=${login}`)) as { case: string } | null;
        expect(boot?.case ?? null).toBe(card);
    });
}

async function logIn(page: Page, login: string) {
    await page.goto("/wp-login.php");
    await page.getByLabel("Username or Email Address").fill(login);
    await page.getByLabel("Password", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Log In" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/wp-login.php"));
}

function block(page: Page) {
    return page.locator(".wp-block-tia-elements-forward-returns");
}

test("a TIA Premium holder sees the Upgrade card", async ({ page }) => {
    const price = wp("eval", "echo html_entity_decode( wp_strip_all_tags( wc_get_product( 19339 )->get_price_html() ) );").replace(
        /\s+/g,
        " "
    );
    await logIn(page, "fx-premium");
    await page.goto("/forward-returns/");

    await expect(block(page).getByRole("heading", { name: "Upgrade to TIA Pro." })).toBeVisible();
    await expect(
        block(page).getByText(
            "Your plan does not include Forward Returns. TIA Pro includes Forward Returns, Predictive Cycles and Decennial Cycles."
        )
    ).toBeVisible();
    await expect(block(page).getByRole("link", { name: `Upgrade · ${price}` })).toHaveAttribute(
        "href",
        wp("eval", "echo wc_get_product( 19339 )->get_permalink();")
    );
    await expect(block(page).getByRole("link", { name: "Log in" })).toHaveCount(0);
});

test("a stale TIA Pro role with only a dead TIA Pro subscription sees the Purchase card", async ({ page }) => {
    await logIn(page, "fx-stale-pro-role");
    await page.goto("/forward-returns/");

    await expect(block(page).getByRole("heading", { name: "Forward Returns is part of TIA Pro." })).toBeVisible();
    await expect(block(page).getByText("Already a member?")).toHaveCount(0);
});

test("a TIA Pro Trial user sees the Trial card without a CTA", async ({ page }) => {
    await logIn(page, "fx-pro-trial");
    await page.goto("/forward-returns/");

    await expect(block(page).getByRole("heading", { name: "Forward Returns unlocks after your trial." })).toBeVisible();
    await expect(block(page).getByText("It becomes available when your TIA Pro subscription starts.")).toBeVisible();
    await expect(block(page).getByRole("link")).toHaveCount(0);
    await expect(block(page).getByRole("button")).toHaveCount(0);
});

test("a TIA Elite Member sees no card", async ({ page }) => {
    await logIn(page, "fx-elite");
    await page.goto("/forward-returns/");

    await expect(block(page).locator("[data-boot]")).toHaveAttribute("data-boot", /"card":null/);
    await expect(block(page).getByRole("heading")).toHaveCount(0);
});

test("a Member sees the Unavailable card when the WooCommerce read fails", async ({ page, context }) => {
    await logIn(page, "fx-pro-active");
    await context.addCookies([{ name: "tia_elements_test", value: "wcs-unavailable", url: "http://localhost:8000" }]);
    await page.goto("/forward-returns/");

    await expect(block(page).getByText("This data is not available right now.")).toBeVisible();
    await expect(block(page).getByRole("button")).toHaveCount(1);
    await expect(block(page).getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(block(page).getByRole("link")).toHaveCount(0);

    await context.clearCookies({ name: "tia_elements_test" });
    await page.reload();
    await expect(block(page).locator("[data-boot]")).toHaveAttribute("data-boot", /"card":null/);
});
