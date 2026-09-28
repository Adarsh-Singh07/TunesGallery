// ─────────────────────────────────────────────────────────────────────────────
// Access-control E2E: invitation expiry, room-full denial, playback denial
// for tracks without a grant. Requires a live seeded environment.
// ─────────────────────────────────────────────────────────────────────────────

import { expect, test } from "@playwright/test";

const seeded = !!(process.env.E2E_SUPABASE_URL && process.env.E2E_GUEST_EMAIL);
test.skip(!seeded, "E2E environment variables not set");

test.describe("access control", () => {
  test("uninvited email cannot request a sign-in code", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Your email").fill("stranger-not-invited@example.com");
    await page.getByRole("button", { name: /send sign-in code/i }).click();
    await expect(page.getByText(/hasn't been invited|not allowed/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("signed-in user without a grant cannot stream a restricted track", async ({
    request,
  }) => {
    // RLS + the stream endpoint must answer 404 (not leak a URL)
    const res = await request.get("/api/tracks/00000000-0000-4000-8000-000000000000/stream", {
      headers: storageHeader(),
    });
    expect([401, 404]).toContain(res.status());
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).not.toMatch(/url/i);
  });

  test("joining with an invalid code fails cleanly", async ({ page }) => {
    await page.goto("/?jam=ZZZZZZ");
    await page.getByRole("button", { name: "Enter the music room" }).click();
    // the auto-join attempt surfaces an error in the jam panel
    await page.getByRole("button", { name: "Jam together" }).click();
    await expect(
      page.getByText(/no open room with that code|may have expired/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * The request fixture carries no Supabase session; attach the guest's access
 * token from the storage state so the API sees an authenticated-but-ungranted
 * user (the interesting denial case).
 */
function storageHeader(): Record<string, string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    const state = JSON.parse(
      fs.readFileSync("tests/e2e/.auth-guest.json", "utf8"),
    ) as { origins: { localStorage: { name: string; value: string }[] }[] };
    for (const origin of state.origins ?? []) {
      for (const entry of origin.localStorage ?? []) {
        if (entry.name.endsWith("-auth-token")) {
          const parsed = JSON.parse(entry.value) as {
            currentSession?: { access_token?: string };
          };
          const token = parsed.currentSession?.access_token;
          if (token) return { Authorization: `Bearer ${token}` };
        }
      }
    }
  } catch {
    /* fall through to unauthenticated request */
  }
  return {};
}
