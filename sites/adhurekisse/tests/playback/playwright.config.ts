import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.QA_PORT ?? 3210);
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  outputDir: process.env.QA_OUTPUT_DIR ?? "/tmp/omnirush/adhurekisse-playback-results",
  reporter: [["list"], ["json", { outputFile: process.env.QA_REPORT ?? "/tmp/omnirush/adhurekisse-playback-report.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    serviceWorkers: "block", // HTTP interception must not silently miss SW requests.
    reducedMotion: "reduce",
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [{ name: "next-local-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node "${path.join(__dirname, "serve-next.mjs")}"`,
    url: `http://127.0.0.1:${port}/login`,
    timeout: 300_000,
    reuseExistingServer: process.env.QA_REUSE_SERVER === "1",
    stdout: "pipe",
    stderr: "pipe",
    env: { QA_PORT: String(port) },
  },
});
