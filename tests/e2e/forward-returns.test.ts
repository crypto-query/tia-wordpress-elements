import { expect, test } from "@playwright/test";
import { wp } from "./wp";

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
