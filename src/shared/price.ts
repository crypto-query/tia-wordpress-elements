/**
 * The visible text of WooCommerce price HTML: the current price, without a struck-out old price or the
 * screen-reader copies WooCommerce adds beside it. DOMParser builds an inert document, so nothing runs.
 */
export function priceText(html: string): string {
    const body = new DOMParser().parseFromString(html, "text/html").body;
    body.querySelectorAll("del, .screen-reader-text").forEach((node) => node.remove());
    return (body.textContent ?? "").replace(/\s+/g, " ").trim();
}
