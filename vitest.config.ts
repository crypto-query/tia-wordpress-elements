import { defineConfig, defineProject, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

const serverTestGlob = ["src/**/*.test.ts"];
const clientTestGlob = "src/**/*.svelte.test.ts";
const clientSetupFile = "./src/vitest-setup-client.ts";

const serverProject = defineProject({
    extends: true,
    test: {
        name: "server",
        environment: "node",
        include: serverTestGlob,
        // Explicit exclude replaces vitest's default exclude (which drops
        // node_modules) rather than merging with it, so the defaults are
        // repeated here alongside the client glob.
        exclude: [clientTestGlob, "**/node_modules/**", "**/.git/**"]
    }
});

const clientProject = defineProject({
    extends: true,
    test: {
        name: "client",
        include: [clientTestGlob],
        setupFiles: [clientSetupFile],
        browser: {
            enabled: true,
            headless: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }]
        }
    }
});

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            // An empty repo is a green repo: CI runs before the first test exists.
            passWithNoTests: true,
            projects: [serverProject, clientProject]
        }
    })
);
