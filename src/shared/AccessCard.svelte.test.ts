import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccessCard from "./AccessCard.svelte";

afterEach(cleanup);

const priceHtml = '<span class="amount">$2,999.00</span> / year';

describe("AccessCard", () => {
    it("offers a Purchase card to a visitor", () => {
        render(AccessCard, { feature: "Forward Returns", card: { case: "purchase", priceHtml, ctaUrl: "/" } });

        expect(screen.getByRole("heading", { name: "Forward Returns is part of TIA Pro." })).toBeInTheDocument();
    });

    it("offers an upgrade to TIA Pro at the server's price", () => {
        render(AccessCard, {
            feature: "Forward Returns",
            card: { case: "upgrade", priceHtml, ctaUrl: "https://example.test/upgrade/" }
        });

        expect(screen.getByRole("heading", { name: "Upgrade to TIA Pro." })).toBeInTheDocument();
        expect(
            screen.getByText(
                "Your plan does not include Forward Returns. TIA Pro includes Forward Returns, Predictive Cycles and Decennial Cycles."
            )
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Upgrade · $2,999.00 / year" })).toHaveAttribute("href", "https://example.test/upgrade/");
    });

    it.each([
        ["tia-pro", "It becomes available when your TIA Pro subscription starts."],
        ["indicator-suite", "It becomes available when your TIA Indicator Suite subscription starts."]
    ] as const)("tells a %s trial when Forward Returns unlocks, with no CTA", (source, body) => {
        render(AccessCard, { feature: "Forward Returns", card: { case: "trial", source } });

        expect(screen.getByRole("heading", { name: "Forward Returns unlocks after your trial." })).toBeInTheDocument();
        expect(screen.getByText(body)).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("offers only Try again when the data is not available", async () => {
        const onRetry = vi.fn();
        render(AccessCard, { feature: "Forward Returns", card: { case: "unavailable" }, onRetry });

        expect(screen.getByText("This data is not available right now.")).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        const [button, ...others] = screen.getAllByRole("button");
        expect(others).toHaveLength(0);
        expect(button).toHaveAccessibleName("Try again");

        await fireEvent.click(button);
        expect(onRetry).toHaveBeenCalledOnce();
    });
});
