import { describe, expect, it } from "vitest";
import { BootError, readBoot } from "./boot";

const purchase = {
    attributes: { base: "btc", quote: "usd", period: 3 },
    rest: { root: "https://example.test/wp-json/", nonce: "abc123" },
    card: {
        case: "purchase",
        priceHtml: '<span class="amount">$2,999.00</span> / year',
        ctaUrl: "https://example.test/product/tia-pro/",
        loginUrl: "https://example.test/wp-login.php"
    },
    instance: "42:1"
};

describe("readBoot", () => {
    it("returns the boot of a visitor with a Purchase card", () => {
        expect(readBoot(JSON.stringify(purchase))).toEqual(purchase);
    });

    it("returns the boot of a Member, whose card is null", () => {
        const member = { ...purchase, attributes: {}, card: null };
        expect(readBoot(JSON.stringify(member))).toEqual(member);
    });

    it("accepts a Trial card with its source and no CTA", () => {
        const trial = { ...purchase, card: { case: "trial", source: "indicator-suite" } };
        expect(readBoot(JSON.stringify(trial))).toEqual(trial);
    });

    it("accepts an Upgrade card", () => {
        const upgrade = { ...purchase, card: { case: "upgrade", priceHtml: purchase.card.priceHtml, ctaUrl: purchase.card.ctaUrl } };
        expect(readBoot(JSON.stringify(upgrade))).toEqual(upgrade);
    });

    it("accepts an Unavailable card with no price and no CTA", () => {
        const unavailable = { ...purchase, card: { case: "unavailable" } };
        expect(readBoot(JSON.stringify(unavailable))).toEqual(unavailable);
    });

    it.each([
        ["a missing attribute", undefined],
        ["JSON that does not parse", "{"],
        ["a value that is not an object", "[]"],
        ["attributes as a list", JSON.stringify({ ...purchase, attributes: [] })],
        ["rest without a nonce", JSON.stringify({ ...purchase, rest: { root: "/wp-json/" } })],
        ["an unknown card case", JSON.stringify({ ...purchase, card: { case: "gift" } })],
        ["a price that is not a string", JSON.stringify({ ...purchase, card: { ...purchase.card, priceHtml: 2999 } })],
        ["an unknown Trial source", JSON.stringify({ ...purchase, card: { case: "trial", source: "stripe" } })],
        ["a missing card", JSON.stringify({ ...purchase, card: undefined })],
        ["an instance without a position", JSON.stringify({ ...purchase, instance: "42" })]
    ])("throws a BootError on %s", (_, json) => {
        expect(() => readBoot(json)).toThrow(BootError);
    });
});
