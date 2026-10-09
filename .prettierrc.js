/** @type {import("prettier").Options} */
const config = {
    singleQuote: false,
    printWidth: 140,
    useTabs: false,
    tabWidth: 4,
    trailingComma: "none",
    arrowParens: "always",
    bracketSameLine: true,
    htmlWhitespaceSensitivity: "css",
    svelteSortOrder: "options-scripts-markup-styles",
    svelteAllowShorthand: true,
    svelteIndentScriptAndStyle: true,
    overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
    plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"]
    // ponytail: add `tailwindStylesheet: "src/app.css"` once the design-system stylesheet lands.
    // Without it the sorter does not know @theme- and @utility-defined classes.
};

export default config;
