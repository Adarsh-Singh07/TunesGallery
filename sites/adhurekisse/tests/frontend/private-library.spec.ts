import { expect, test, type Page } from "@playwright/test";

const ownerId = "00000000-0000-4000-8000-000000000001";
const listenerId = "00000000-0000-4000-8000-000000000002";
const trackId = "00000000-0000-4000-8000-000000000003";
const profile = { id: ownerId, email: "owner@example.test", display_name: "Owner", is_admin: true, is_active: true };
const track = { id: trackId, owner_id: ownerId, title: "Moonlight", artist: "An Artist", album: "Home", movie: null, year: "2026", tags: ["late night"], artworkUrl: null, audio_key: "private/audio", artwork_key: null, mime_type: "audio/mpeg", duration_seconds: 123, size_bytes: 100, status: "ready", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

async function mockEnvironment(page: Page, options: { tracks?: typeof track[]; admin?: boolean; signedIn?: boolean } = {}) {
  const user = { ...profile, is_admin: options.admin ?? true };
  if (options.signedIn !== false) await page.addInitScript(({ user }) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "frontend-test-session", refresh_token: "frontend-test-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } }));
  }, { user });
  await page.route("http://127.0.0.1:59999/**", async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.includes("/rpc/accept_invitation") ? true : url.pathname.includes("/profiles") ? (url.searchParams.has("id") ? user : [user, { id: listenerId, display_name: "Listener", email: "listener@example.test", is_admin: false, is_active: true }]) : {};
    await route.fulfill({ json: body });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/tracks" && route.request().method() === "GET") return route.fulfill({ json: { tracks: options.tracks ?? [], nextOffset: null } });
    if (url.pathname === "/api/playlists" && route.request().method() === "GET") return route.fulfill({ json: { playlists: [], nextOffset: null } });
    if (url.pathname === "/api/invitations") return route.fulfill({ json: { invitations: [] } });
    if (url.pathname === "/api/permissions") return route.fulfill({ json: { permissions: [] } });
    await route.fulfill({ status: 500, json: { error: "Unexpected mock request" } });
  });
}

test("empty library onboarding and mobile layout", async ({ page }) => {
  await mockEnvironment(page);
  await page.goto("/library", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your first record starts here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload your first track" })).toHaveAttribute("href", "/admin");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await page.getByRole("button", { name: "Create your first playlist" }).click();
  await expect(page.getByRole("dialog", { name: "A new mixtape" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create your first playlist" })).toBeFocused();
});

test("search, owner metadata save, and artwork validation", async ({ page }) => {
  await mockEnvironment(page, { tracks: [track] });
  let patch: Record<string, unknown> | undefined;
  await page.route(`**/api/tracks/${trackId}`, async (route) => { patch = route.request().postDataJSON(); await route.fulfill({ json: { track: { ...track, ...patch } } }); });
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Search your tracks" }).fill("late night");
  await expect(page.getByRole("button", { name: "Details for Moonlight" })).toBeVisible();
  await page.getByRole("button", { name: "Details for Moonlight" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Moonlight, revisited");
  await dialog.getByLabel("Replace artwork").setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg />") });
  await expect(dialog.getByRole("alert")).toContainText("JPEG");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog.getByRole("status")).toContainText("saved");
  expect(patch?.title).toBe("Moonlight, revisited");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search your tracks" }).fill("not a song");
  await expect(page.getByRole("heading", { name: "No records found." })).toBeVisible();
});

test("playlist create, order, share, revoke, rename and delete use collection contracts", async ({ page }) => {
  const secondTrack = { ...track, id: "00000000-0000-4000-8000-000000000004", title: "City lights" };
  await mockEnvironment(page, { tracks: [track, secondTrack] });
  let playlists: Record<string, unknown>[] = [];
  const mutations: Record<string, unknown>[] = [];
  await page.route("**/api/playlists**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { playlists, nextOffset: null } });
    const body = route.request().postDataJSON(); mutations.push({ method, ...body });
    if (method === "POST") playlists = [{ id: "playlist-1", owner_id: ownerId, ...body, playlist_permissions: [] }];
    if (method === "PATCH" && body.action === "share") playlists = playlists.map((item) => ({ ...item, playlist_permissions: [{ user_id: body.userId }] }));
    else if (method === "PATCH" && body.action === "unshare") playlists = playlists.map((item) => ({ ...item, playlist_permissions: [] }));
    else if (method === "PATCH") playlists = playlists.map((item) => ({ ...item, ...body }));
    if (method === "DELETE") playlists = [];
    await route.fulfill({ json: { playlist: playlists[0], ok: true } });
  });
  await page.goto("/library");
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await page.getByRole("button", { name: "New playlist", exact: true }).click();
  await page.getByLabel("Playlist name").fill("Long way home");
  await page.getByRole("checkbox", { name: /Moonlight/ }).check();
  await page.getByRole("checkbox", { name: /City lights/ }).check();
  await page.getByRole("button", { name: "Move track 2 up" }).click();
  await page.getByRole("button", { name: "Save playlist" }).click();
  await expect(page.getByRole("button", { name: "Long way home", exact: true })).toBeVisible();
  expect(mutations[0]).toMatchObject({ method: "POST", title: "Long way home", trackIds: [secondTrack.id, trackId] });
  await page.getByRole("button", { name: "Share Long way home" }).click();
  await page.getByRole("combobox", { name: "Listener", exact: true }).selectOption(listenerId);
  await page.getByLabel("Also grant access").check();
  await page.getByRole("button", { name: "Share playlist", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("shared");
  expect(mutations.at(-1)).toMatchObject({ method: "PATCH", id: "playlist-1", action: "share", userId: listenerId, grantTracks: true });
  await page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("removed");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Long way home", exact: true }).click();
  await page.getByRole("button", { name: "Edit playlist", exact: true }).click();
  await page.getByLabel("Playlist name").fill("Home again");
  await page.getByRole("button", { name: "Save playlist" }).click();
  await page.getByRole("button", { name: "Delete Home again" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete playlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Every mood deserves a mixtape." })).toBeVisible();
});

test("admin upload queue validates duplicates and keeps metadata editable before upload", async ({ page }) => {
  await mockEnvironment(page);
  await page.goto("/admin");
  const input = page.getByLabel("Choose audio files");
  const audio = { name: "Moonlight.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("test-audio") };
  await input.setInputFiles([audio, audio]);
  await expect(page.getByRole("alert")).toContainText("already in your upload queue");
  await expect(page.getByRole("button", { name: "Upload 1 track" })).toBeEnabled();
  await page.getByLabel("Title", { exact: true }).fill("A better title");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tracks", exact: true }).click();
  await page.getByRole("button", { name: "Uploads", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("A better title");
});

test("login reports rate-limited sign-in errors", async ({ page }) => {
  await mockEnvironment(page, { signedIn: false });
  await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 429, json: { msg: "Too many requests", code: "over_email_send_rate_limit" } }));
  await page.goto("/login");
  await page.getByLabel("Your email").fill("listener@example.test");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByRole("alert")).toContainText("Wait a minute");
});

test("library rendering and refreshing never overwrite the shared playback queue", async ({ page }) => {
  await mockEnvironment(page, { tracks: [track] });
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Play Moonlight" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __queueWrites?: number }).__queueWrites ?? 0)).toBe(0);
  await page.getByRole("button", { name: "Play Moonlight" }).click();
  await expect(page.getByRole("button", { name: "Pause Moonlight" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh library" }).click();
  await expect(page.getByRole("button", { name: "Pause Moonlight" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __queueWrites?: number }).__queueWrites)).toBe(1);
});

test("upload retry resumes the existing track and verifies the matching storage intent", async ({ page }) => {
  await mockEnvironment(page);
  let creates = 0;
  let puts = 0;
  let finalization: Record<string, unknown> | undefined;
  await page.route("**/api/tracks", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { tracks: [], nextOffset: null } });
    creates++;
    await route.fulfill({ status: 201, json: { track: { ...track, status: "pending" }, uploadId: "first-intent", upload: { url: "https://storage.invalid/audio", headers: { "Content-Type": "audio/mpeg" } } } });
  });
  await page.route(`**/api/tracks/${trackId}/upload-url`, (route) => route.fulfill({ json: { uploadId: "retry-intent", upload: { url: "https://storage.invalid/audio", headers: { "Content-Type": "audio/mpeg" } } } }));
  await page.route("https://storage.invalid/**", async (route) => { puts++; await route.fulfill({ status: puts === 1 ? 500 : 200, body: "" }); });
  await page.route(`**/api/tracks/${trackId}/finalize`, async (route) => { finalization = route.request().postDataJSON(); await route.fulfill({ json: { track } }); });
  await page.goto("/admin");
  await page.getByLabel("Choose audio files").setInputFiles({ name: "Moonlight.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("audio-fixture") });
  await page.getByRole("button", { name: "Upload 1 track" }).click();
  await expect(page.getByRole("alert")).toContainText("Storage could not accept");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Ready to play. Audio verified in storage.", { exact: true })).toBeVisible();
  expect(creates).toBe(1);
  expect(puts).toBe(2);
  expect(finalization).toMatchObject({ kind: "audio", uploadId: "retry-intent" });
});

test("invitations report delivery and track grants can be created and revoked", async ({ page }) => {
  await mockEnvironment(page, { tracks: [track] });
  let permissions: { track_id: string; user_id: string; created_at: string }[] = [];
  let invitation: Record<string, unknown> | undefined;
  let revoked = false;
  await page.route("**/api/invitations**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { invitations: [{ id: "accepted-invite", email: "listener@example.test", code: "ABCDEF", expires_at: "2026-01-02", accepted_at: "2026-01-01", accepted_user_id: listenerId, revoked_at: revoked ? "2026-01-03" : null }] } });
    if (route.request().method() === "DELETE") { expect(new URL(route.request().url()).searchParams.get("id")).toBe("accepted-invite"); revoked = true; return route.fulfill({ json: { ok: true } }); }
    invitation = route.request().postDataJSON(); await route.fulfill({ status: 201, json: { invitation: { id: "invite" }, delivery: "sent" } });
  });
  await page.route("**/api/permissions**", async (route) => {
    const method = route.request().method();
    if (method === "POST") { const body = route.request().postDataJSON(); permissions = [{ track_id: body.trackId, user_id: body.userId, created_at: "2026-01-01" }]; }
    if (method === "DELETE") permissions = [];
    await route.fulfill({ json: method === "GET" ? { permissions } : { ok: true } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "People & access" }).click();
  await page.getByLabel("Email address").fill("friend@example.test");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByRole("status")).toContainText("email sent");
  expect(invitation).toMatchObject({ email: "friend@example.test", expiresInDays: 14 });
  await page.getByRole("combobox", { name: "Track", exact: true }).selectOption(trackId);
  await page.getByRole("combobox", { name: "Listener", exact: true }).selectOption(listenerId);
  await page.getByRole("button", { name: "Grant access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove access", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove access", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("revoked");
  await page.getByRole("button", { name: "Revoke room access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revoke room access", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Room access");
});

test("listeners receive an owner-area boundary and sessions expire into sign-in", async ({ page }) => {
  await mockEnvironment(page, { admin: false, tracks: [track] });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "The owner’s studio" })).toBeVisible();
  await page.getByRole("link", { name: "Open my library" }).click();
  await expect(page.getByRole("button", { name: "Play Moonlight" })).toBeVisible();
  await page.route("**/api/tracks**", (route) => route.fulfill({ status: 401, json: { error: "expired" } }));
  await page.route("**/auth/v1/token**", (route) => route.fulfill({ status: 400, json: { error: "invalid_grant", error_description: "Refresh token expired" } }));
  await page.getByRole("button", { name: "Refresh library" }).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Moonlight" })).toHaveCount(0);
});
