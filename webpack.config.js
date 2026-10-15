import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import defaultConfig from "@wordpress/scripts/config/webpack.config.js";
import scope from "./scripts/postcss-scope.js";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";
const hot = mode === "development" && process.argv.includes("--hot");

const svelteLoader = {
    loader: "svelte-loader",
    options: {
        compilerOptions: { css: "injected", dev: false, hmr: hot },
        emitCss: false,
        // bits-ui ships ~47 warnings; under --hot they fill an overlay that blocks every click.
        onwarn: (warning, handle) => (warning.filename?.includes("node_modules") ? undefined : handle(warning))
    }
};

// The one CSS entry runs Tailwind, then the scope step. No root postcss.config.*: Vitest would load it too.
const scopedTailwind = (loader) =>
    String(loader.loader).includes("postcss-loader")
        ? { ...loader, options: { postcssOptions: { config: false, plugins: [tailwind(), scope()] } } }
        : loader;

export default {
    ...defaultConfig,
    entry: () => ({ ...defaultConfig.entry(), "shared/design-system": "./src/shared/design-system.css" }),
    resolve: {
        ...defaultConfig.resolve,
        extensions: [...defaultConfig.resolve.extensions, ".svelte"],
        mainFields: ["svelte", "browser", "module", "main"],
        // `mode` picks the production branch of esm-env, so no Svelte dev code ships.
        conditionNames: ["svelte", "browser", mode, "import", "module", "default"]
    },
    module: {
        ...defaultConfig.module,
        rules: [
            ...defaultConfig.module.rules.map((rule) =>
                String(rule.test) === String(/\.css$/) ? { ...rule, use: rule.use.map(scopedTailwind) } : rule
            ),
            {
                // bits-ui ships `.svelte.js` rune modules.
                test: /\.svelte(\.js)?$/,
                use: hot ? [fileURLToPath(new URL("./scripts/svelte-hmr-loader.js", import.meta.url)), svelteLoader] : [svelteLoader]
            },
            // Our own `.svelte.ts` rune modules: the default rule strips the types, then Svelte compiles the runes.
            { test: /\.svelte\.ts$/, enforce: "post", use: [svelteLoader] },
            { test: /\.m?js$/, include: /node_modules/, resolve: { fullySpecified: false } }
        ]
    }
};
