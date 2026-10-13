import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

// Isolated component browser suite: real owned UI, test-only player/navigation,
// fake public Auth settings, and all cloud/API requests mocked. Uses existing Vite.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/omnirush/adhurekisse-ui-results",
  use: { baseURL: "http://127.0.0.1:3107", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node tests/frontend/serve.mjs",
    cwd: resolve(__dirname, "../.."),
    url: "http://127.0.0.1:3107/login",
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999", NEXT_PUBLIC_SUPABASE_ANON_KEY: "frontend-test-key", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
