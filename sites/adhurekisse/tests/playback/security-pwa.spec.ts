import { expect, test } from "@playwright/test";
import { AUDIO, FakeStack, tracks } from "./fake-stack";

const id = "00000000-0000-4000-8000-000000000000";
const protectedEndpoints = [
  ["GET", "/api/tracks"], ["POST", "/api/tracks"], ["PATCH", `/api/tracks/${id}`], ["DELETE", `/api/tracks/${id}`],
  ["GET", `/api/tracks/${id}/stream`], ["POST", `/api/tracks/${id}/upload-url`], ["POST", `/api/tracks/${id}/finalize`],
  ["GET", "/api/playlists"], ["POST", "/api/playlists"], ["GET", `/api/playlists/${id}`],
  ["PATCH", `/api/playlists/${id}`], ["DELETE", `/api/playlists/${id}`], ["POST", `/api/playlists/${id}/tracks`],
  ["PATCH", `/api/playlists/${id}/tracks`], ["DELETE", `/api/playlists/${id}/tracks`],
  ["POST", `/api/playlists/${id}/share`], ["DELETE", `/api/playlists/${id}/share`],
  ["GET", "/api/invitations"], ["POST", "/api/invitations"], ["GET", "/api/permissions"], ["POST", "/api/permissions"],
  ["POST", "/api/storage/cleanup"], ["GET", "/api/chat"], ["POST", "/api/chat"],
] as const;

test("actual Next API routes reject unauthenticated reads and writes without leaking private data", async ({ request }, testInfo) => {
  test.setTimeout(600_000); // First-time dev compilation is expensive on WSL.
  const measured = [];
  for (const [method, url] of protectedEndpoints) {
    const response = await request.fetch(url, { method, data: method === "GET" ? undefined : {}, timeout: 120_000 });
    const body = await response.text();
    measured.push({ method, url, status: response.status(), cacheControl: response.headers()["cache-control"] });
    expect.soft(response.status(), `${method} ${url}`).toBe(401);
    expect.soft(response.headers()["cache-control"], url).toContain("no-store");
    expect.soft(response.headers()["x-content-type-options"], url).toBe("nosniff");
    expect.soft(body, url).not.toMatch(/https?:|X-Amz|audio_key|service_role|access_token/i);
  }
  await testInfo.attach("unauthenticated-route-matrix", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
});

test("the PWA controls the page but never caches private API or ranged audio", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  try {
    const stack = new FakeStack(); await stack.install(context);
    const page = await context.newPage(); await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const response = await context.request.get("/manifest.json");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
    const icons = [];
    for (const src of new Set<string>(manifest.icons.map((icon: { src: string }) => icon.src))) {
      const icon = await context.request.get(src, { timeout: 120_000 });
      icons.push({ src, status: icon.status() });
      expect.soft(icon.ok(), `Manifest icon ${src} must be served successfully`).toBe(true);
    }
    const result = await page.evaluate(async ({ audio }) => {
      const api = await fetch("/api/tracks");
      const ranges = [];
      for (let i = 0; i < 2; i++) {
        const response = await fetch(audio, { headers: { Range: "bytes=44-103" } });
        ranges.push({ status: response.status, bytes: (await response.arrayBuffer()).byteLength });
      }
      const cached = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) cached.push(request.url);
      return { apiStatus: api.status, ranges, cached };
    }, { audio: `${AUDIO}/${tracks[0].id}.wav?signature=pwa-test` });
    expect(result.apiStatus).toBe(401);
    expect(result.ranges).toEqual([{ status: 206, bytes: 60 }, { status: 206, bytes: 60 }]);
    expect(stack.audioRequests).toHaveLength(2);
    expect(result.cached.filter((url) => /\/api\/|qa-audio|signature=/.test(url))).toEqual([]);
    await testInfo.attach("pwa-cache-observation", { body: JSON.stringify({ ...result, icons }), contentType: "application/json" });
  } finally { await context.close(); }
});

test("signed-out private library and studio expose sign-in boundaries", async ({ context, page }) => {
  await new FakeStack().install(context);
  for (const path of ["/library", "/admin"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "A room for your records" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", `/login?next=${encodeURIComponent(path)}`);
    await expect(page.getByRole("list", { name: "Tracks", exact: true })).not.toBeVisible();
  }
});
