import globals from "globals";
import javascriptEslint from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import sveltePlugin from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import svelteConfig from "./svelte.config.js";

export default [
    // Base JavaScript configuration
    javascriptEslint.configs.recommended,

    // TypeScript configuration
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        plugins: {
            "@typescript-eslint": typescriptEslint
        },
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: "module",
                extraFileExtensions: [".svelte"]
            }
        },
        rules: {
            ...typescriptEslint.configs.recommended.rules,
            "no-undef": "off",
            "no-redeclare": "off",
            "preserve-caught-error": "off",
            "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true, allowShortCircuit: true }]
        }
    },

    // Svelte-specific configuration
    ...sveltePlugin.configs.recommended,
    {
        files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: typescriptParser,
                svelteConfig
            }
        }
    },

    // TailwindCSS linting (better-tailwindcss plugin)
    betterTailwindcss.configs.recommended,
    {
        files: ["**/*.svelte", "**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
        settings: {
            "better-tailwindcss": {
                entryPoint: "src/shared/design-system.css",
                // required for enforce-canonical-classes px→token autofix
                // Removing this silently disables those rewrites.
                rootFontSize: 16
            }
        },
        rules: {
            "better-tailwindcss/enforce-consistent-class-order": "off",
            "better-tailwindcss/enforce-consistent-line-wrapping": "off",
            // `dark` is the theme marker the dark variant is built on — mode-watcher
            // writes it onto <html> — not a utility, so the rule cannot resolve it.
            // Same species as the `group` and `peer` markers it already ignores.
            // Needed wherever markup scopes a dark preview to a subtree.
            "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["^dark$"] }]
        }
    },
    // A test may reach for `console` freely — to silence a dependency that writes to it, or to see
    // something while it is being written. Production code may not.
    {
        files: ["**/*.ts", "**/*.js", "**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        ignores: ["tests/**", "**/*.test.ts", "**/*.test-d.ts", "**/*.svelte.test.ts"],
        rules: {
            "no-console": "error"
        }
    },
    // A rejected (400) REST request is a client bug; the reader sees "not available", so the console carries it.
    {
        files: ["src/shared/api.ts"],
        rules: {
            "no-console": ["error", { allow: ["error"] }]
        }
    },

    // Global settings
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser
            }
        }
    },

    // Files to ignore
    {
        ignores: [
            ".agents",
            ".claude",
            ".gemini",
            ".vscode",
            ".opencode",
            ".pi",
            ".scratch",
            ".temp",
            "build",
            "dist",
            "package",
            "packages",
            "vendor",
            "wordpress",
            "**/.env",
            "**/.env.*",
            "!**/.env.example",
            "**/.DS_Store",
            "**/node_modules",
            "**/package-lock.json",
            "eslint.config.js",
            "svelte.config.js"
        ]
    }
];
