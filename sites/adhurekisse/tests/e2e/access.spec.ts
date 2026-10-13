import { expect, test } from "@playwright/test";
import { enterMusicRoom, hostedSkipReason, missingHostedEnv, openJam, signIn } from "./helpers";

test.skip(missingHostedEnv.length > 0, hostedSkipReason);

test("an unauthenticated caller cannot obtain a stream URL", async ({ request }) => {
  const response = await request.get("/api/tracks/00000000-0000-4000-8000-000000000000/stream");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toHaveProperty("error");
  expect(await response.text()).not.toMatch(/https?:|X-Amz|audio_key/i);
});

test("an authenticated guest receives a clean invalid-invitation error", async ({ page }) => {
  await signIn(page, "GUEST");
  await enterMusicRoom(page);
  const panel = await openJam(page);
  await panel.getByLabel("Six-character room code").fill("ZZZZZZ");
  await panel.getByRole("button", { name: "Join", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("No open room with that code");
  await expect(panel.getByText("Together, live", { exact: true })).not.toBeVisible();
});

test("a signed-in guest cannot retrieve an inaccessible track", async ({ page }) => {
  test.skip(!process.env.E2E_RESTRICTED_TRACK_ID, "Requires E2E_RESTRICTED_TRACK_ID: an existing track not granted to the guest");
  await signIn(page, "GUEST");
  const result = await page.evaluate(async (id) => {
    const entry = Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key));
    const session = entry ? JSON.parse(localStorage.getItem(entry)!) : null;
    if (!session?.access_token) throw new Error("Authenticated session missing");
    const response = await fetch(`/api/tracks/${id}/stream`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    return { status: response.status, body: await response.text() };
  }, process.env.E2E_RESTRICTED_TRACK_ID!);
  expect(result.status).toBe(404);
  expect(result.body).not.toMatch(/https?:|X-Amz|audio_key/i);
});
