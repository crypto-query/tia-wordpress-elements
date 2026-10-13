import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "tests/e2e",
    forbidOnly: !!process.env.CI,
    reporter: "list",
    use: {
        baseURL: "http://localhost:8000",
        trace: "retain-on-failure"
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
