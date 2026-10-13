import { readFileSync } from "node:fs";
import tailwind from "@tailwindcss/postcss";
import postcss, { type Container } from "postcss";
import { beforeAll, describe, expect, it } from "vitest";
import scope from "../../scripts/postcss-scope.js";

/** Every selector outside `@keyframes`, in order. Rules nested in rules (`&:focus`) count only with `nested`. */
function selectors(container: Container, nested = true): string[] {
    return (container.nodes ?? []).flatMap((node) => {
        if (node.type === "rule") return [...node.selectors, ...(nested ? selectors(node) : [])];
        if (node.type === "atrule" && !node.name.endsWith("keyframes")) return selectors(node, nested);
        return [];
    });
}

async function scoped(css: string) {
    return selectors(postcss.parse((await postcss([scope()]).process(css, { from: undefined })).css));
}

describe("the scope step", () => {
    it("moves Tailwind's theme variables and the design-system tokens onto the Block root", async () => {
        expect(await scoped(":root, :host { --a: 1 } :root { --b: 2 } .dark { --b: 3 }")).toEqual([
            ".tia-design-system",
            ".tia-design-system",
            ".tia-design-system.dark"
        ]);
    });

    it("gives base rules one root class and utilities two", async () => {
        expect(
            await scoped(`
                :where(.tia-design-system) h1, :where(.tia-design-system)  ::after { margin: 0 }
                .tia-design-system .p-4 { padding: 1rem }
                :where(.tia-design-system .space-y-3 > :not(:last-child)) { margin: 0 }
                .tia-design-system .dark\\:bg-red:where(.dark, .dark *) { color: red }
            `)
        ).toEqual([
            ".tia-design-system h1",
            ".tia-design-system ::after",
            ".tia-design-system.tia-design-system .p-4",
            ".tia-design-system.tia-design-system :where(.space-y-3 > :not(:last-child))",
            ".tia-design-system.tia-design-system .dark\\:bg-red:where(.tia-design-system.dark, .tia-design-system.dark *)"
        ]);
    });

    it("scopes the global base of the forms plugin and the design system, nested rules untouched", async () => {
        expect(await scoped("@layer base { input:where([type='text']), select { &:focus { outline: 0 } } h2 { color: red } }")).toEqual([
            ".tia-design-system input:where([type='text'])",
            ".tia-design-system select",
            "&:focus",
            ".tia-design-system h2"
        ]);
    });

    it("drops @property and @layer and scopes the --tw-* fallback", async () => {
        const css = `
            @layer properties;
            @property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
            @layer properties { @supports (-moz-orient: inline) { *, ::before, ::after, ::backdrop { --tw-shadow: 0 0 #0000 } } }
        `;
        const out = (await postcss([scope()]).process(css, { from: undefined })).css;
        expect(out).not.toMatch(/@layer|@property|@supports/);
        expect(selectors(postcss.parse(out))).toEqual([
            ".tia-design-system",
            ".tia-design-system::before",
            ".tia-design-system::after",
            ".tia-design-system::backdrop",
            ".tia-design-system *",
            ".tia-design-system *::before",
            ".tia-design-system *::after",
            ".tia-design-system *::backdrop"
        ]);
    });
});

describe("the shared Block stylesheet", () => {
    const from = new URL("./design-system.css", import.meta.url).pathname;
    let css = "";

    beforeAll(async () => {
        css = (await postcss([tailwind(), scope()]).process(readFileSync(from, "utf8"), { from })).css;
    });

    it("has no @layer, no @property and no rule outside the Block root", () => {
        expect(css).not.toMatch(/@layer|@property/);
        expect(selectors(postcss.parse(css), false).filter((s) => !s.startsWith(".tia-design-system"))).toEqual([]);
    });

    it("resets the Block root and loads no font", () => {
        expect(css).toMatch(/\.tia-design-system\s*\{\s*all:\s*initial/);
        expect(css).not.toMatch(/@font-face|@import/);
    });

    it("includes the classes the design-system components use", () => {
        expect(css).toContain(".tia-design-system.tia-design-system .rounded-full");
        expect(css).toContain(".tia-design-system input:where([type='text'])");
    });
});
