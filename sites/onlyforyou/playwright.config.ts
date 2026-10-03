import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a LIVE, seeded environment:
 *   E2E_BASE_URL          e.g. http://localhost:3000
 *   E2E_SUPABASE_URL      test Supabase project
 *   E2E_SUPABASE_ANON_KEY
 *   E2E_HOST_EMAIL / E2E_HOST_PASSWORD
 *   E2E_GUEST_EMAIL / E2E_GUEST_PASSWORD
 *   E2E_TEST_TRACK_TITLE  title of a ready R2 track both users can access
 *
 * Without these variables the suite skips itself with a clear message —
 * these flows cannot be meaningfully faked.
 */
const hasEnv = !!(
  process.env.E2E_BASE_URL &&
  process.env.E2E_SUPABASE_URL &&
  process.env.E2E_HOST_EMAIL &&
  process.env.E2E_GUEST_EMAIL
);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-phone", use: { ...devices["Pixel 7"] } },
  ],
  globalSetup: hasEnv ? "./tests/e2e/global-setup.ts" : undefined,
});
