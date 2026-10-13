export type CardCase = "purchase" | "upgrade" | "trial" | "unavailable";

export type Card = {
    case: CardCase;
    priceHtml?: string;
    ctaUrl?: string;
    loginUrl?: string;
    source?: "tia-pro" | "indicator-suite";
};

/** What `render.php` writes into `data-boot` on each Block's mount element. */
export type Boot = {
    attributes: Record<string, unknown>;
    rest: { root: string; nonce: string };
    card: Card | null;
    instance: string;
};

export class BootError extends Error {
    override name = "BootError";
}

const CASES: readonly unknown[] = ["purchase", "upgrade", "trial", "unavailable"];
const SOURCES: readonly unknown[] = ["tia-pro", "indicator-suite"];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";

function isCard(value: unknown): value is Card {
    return (
        isObject(value) &&
        CASES.includes(value.case) &&
        isOptionalString(value.priceHtml) &&
        isOptionalString(value.ctaUrl) &&
        isOptionalString(value.loginUrl) &&
        (value.source === undefined || SOURCES.includes(value.source))
    );
}

/** Parses and checks the `data-boot` JSON of a mount element. Throws a `BootError` on anything else. */
export function readBoot(json: string | undefined): Boot {
    if (json === undefined) {
        throw new BootError("The mount element has no data-boot attribute.");
    }
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch (cause) {
        throw new BootError("data-boot is not valid JSON.", { cause });
    }
    if (
        isObject(value) &&
        isObject(value.attributes) &&
        isObject(value.rest) &&
        typeof value.rest.root === "string" &&
        typeof value.rest.nonce === "string" &&
        (value.card === null || isCard(value.card)) &&
        typeof value.instance === "string" &&
        /^\d+:\d+$/.test(value.instance)
    ) {
        return {
            attributes: value.attributes,
            rest: { root: value.rest.root, nonce: value.rest.nonce },
            card: value.card,
            instance: value.instance
        };
    }
    throw new BootError("data-boot does not have the Boot shape.");
}
