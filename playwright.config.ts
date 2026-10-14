import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "tests/e2e",
    forbidOnly: !!process.env.CI,
    // Every test shares one WordPress site; the settings test changes the member roles it reads.
    workers: 1,
    reporter: "list",
    use: {
        baseURL: "http://localhost:8000",
        trace: "retain-on-failure"
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
