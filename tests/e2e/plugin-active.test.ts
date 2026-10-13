import { expect, test } from "@playwright/test";

// `bun run wp:use` gives a worktree's copy its own plugin folder, named after the worktree.
const worktree = process.cwd().match(/\/\.agents\/worktrees\/(.+)$/)?.[1];
const slug = worktree ? `tia-wordpress-elements--${worktree.replaceAll("/", "-")}` : "tia-wordpress-elements";

test("the site runs this checkout's copy of the plugin", async ({ page }) => {
    await page.goto("/wp-login.php");
    await page.getByLabel("Username or Email Address").fill("admin");
    await page.getByLabel("Password", { exact: true }).fill("admin");
    await page.getByRole("button", { name: "Log In" }).click();

    await page.goto("/wp-admin/plugins.php");
    await expect(page.locator(`tr[data-plugin="${slug}/tia-wordpress-elements.php"]`)).toHaveClass(/\bactive\b/);
});
