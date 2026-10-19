import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "tests/e2e",
    forbidOnly: !!process.env.CI,
    // Every test shares one WordPress site; the settings test changes the member roles it reads.
    workers: 1,
    // `wp()` starts a fresh wp-cli container per call, 3-8 s each on a busy host, and hooks share the test budget.
    timeout: 60_000,
    reporter: "list",
    use: {
        baseURL: "http://localhost:8000",
        trace: "retain-on-failure"
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
