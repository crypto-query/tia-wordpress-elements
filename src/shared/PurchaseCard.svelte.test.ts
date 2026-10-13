import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import PurchaseCard from "./PurchaseCard.svelte";

afterEach(cleanup);

const regular =
    '<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#36;</span>2,999.00</bdi></span> <span class="subscription-details"> / year</span>';
const sale =
    '<del aria-hidden="true"><span class="amount">$3,999.00</span></del> <span class="screen-reader-text">Original price was: $3,999.00.</span><ins aria-hidden="true"><span class="amount">$2,999.00</span></ins><span class="screen-reader-text">Current price is: $2,999.00.</span> / year';

describe("PurchaseCard", () => {
    it("names the feature and sells TIA Pro at the server's price", () => {
        render(PurchaseCard, { feature: "Forward Returns", priceHtml: regular, ctaUrl: "https://example.test/product/tia-pro/" });

        expect(screen.getByRole("heading", { name: "Forward Returns is part of TIA Pro." })).toBeInTheDocument();
        expect(screen.getByText("Subscribe to see Forward Returns for every asset.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Get TIA Pro · $2,999.00 / year" })).toHaveAttribute(
            "href",
            "https://example.test/product/tia-pro/"
        );
        expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    });

    it("shows a sale price once, without the old price", () => {
        render(PurchaseCard, { feature: "Forward Returns", priceHtml: sale, ctaUrl: "/" });

        expect(screen.getByRole("link", { name: "Get TIA Pro · $2,999.00 / year" })).toBeInTheDocument();
    });

    it("renders price markup as text only", () => {
        render(PurchaseCard, { feature: "Forward Returns", priceHtml: '<img src="x" onerror="1">$10', ctaUrl: "/" });

        expect(screen.getByRole("link", { name: "Get TIA Pro · $10" }).querySelector("img")).toBeNull();
    });

    it("offers Log in to a logged-out visitor", () => {
        render(PurchaseCard, {
            feature: "Forward Returns",
            priceHtml: regular,
            ctaUrl: "/",
            loginUrl: "https://example.test/wp-login.php"
        });

        expect(screen.getByText(/Already a member\?/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "https://example.test/wp-login.php");
    });
});
