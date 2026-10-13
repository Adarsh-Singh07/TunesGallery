import { defineConfig, devices } from "@playwright/test";

// Hosted acceptance only. Credentials and two shared ready tracks must belong
// to a disposable TEST deployment. Local mocked Next coverage has its own config.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: process.env.E2E_OUTPUT_DIR ?? "/tmp/omnirush/adhurekisse-hosted-results",
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [
    { name: "chromium-phone", use: { ...devices["Pixel 7"] } },
  ],
});
