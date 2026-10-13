import { expect, test, type Page } from "@playwright/test";
import { songs } from "../../data/songs";
import { enterMusicRoom, openJam, roomCode } from "../e2e/helpers";
import { FakeStack, SUPABASE, USERS } from "./fake-stack";

const email = "new-listener@qa.test";
const password = "correct horse battery staple";

for (const width of [320, 390]) {
  test(`registration and signed-out gate fit a ${width}px mobile viewport`, async ({ context, page }) => {
    const stack = new FakeStack(); await stack.install(context);
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.getByRole("dialog", { name: "Sign in required" }).getByRole("button", { name: "REGISTER", exact: true }).click();
    await fillRegistration(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
    stack.assertNoUnexpectedRequests();
  });
}

async function fillRegistration(page: Page) {
  await expect(page.getByRole("button", { name: "Create account options" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Your name", { exact: true }).fill("New Listener");
  await page.getByLabel("Your email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
}

async function enterAfterAuth(page: Page) {
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enter the music room" }).click();
  await expect(page.getByRole("button", { name: "Enter the music room" })).not.toBeVisible();
}

test("registration checks passwords locally and awaits confirmation without claiming account creation", async ({ context, page, baseURL }) => {
  const stack = new FakeStack(); await stack.install(context);
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account options" }).click();
  await fillRegistration(page);
  await page.getByLabel("Confirm password").fill("another valid password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("passwords don’t match");
  expect(stack.authRequests).toHaveLength(0);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("If this email can be registered");
  await expect(page.getByRole("status")).not.toContainText("Account created");
  expect(stack.authRequests).toEqual([{ path: "/auth/v1/signup", body: expect.objectContaining({ email, password, data: { display_name: "New Listener" } }), redirectTo: `${baseURL}/login?next=%2F` }]);
  expect(stack.rpcRequests).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("sb-qa-local-auth-token"))).toBeNull();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByLabel("Your email")).toHaveValue(email);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(1);
  stack.assertNoUnexpectedRequests();
});

for (const scenario of [
  { code: "over_email_send_rate_limit", status: 429, message: "Too many requests", visible: "Wait a minute" },
  { code: "weak_password", status: 422, message: "Password is too weak", visible: "stronger password" },
  { code: "signup_disabled", status: 422, message: "Signups not allowed", visible: "registration is currently disabled" },
]) {
  test(`registration reports ${scenario.code} and allows a retry`, async ({ context, page }) => {
    const stack = new FakeStack(); stack.signupError = scenario; await stack.install(context);
    await page.goto("/login?mode=register");
    await fillRegistration(page);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(scenario.visible);
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Confirm your email" })).not.toBeVisible();
    expect(stack.rpcRequests).toHaveLength(0);
    stack.signupError = null;
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
    stack.assertNoUnexpectedRequests();
  });
}

for (const duplicate of ["obfuscated", "explicit"] as const) {
  test(`${duplicate} duplicate signup gets the same private, conditional confirmation response`, async ({ context, page }) => {
    const stack = new FakeStack(); stack.signupMode = "duplicate";
    if (duplicate === "explicit") stack.signupError = { status: 422, code: "user_already_exists", message: "User already registered" };
    await stack.install(context); await page.goto("/login?mode=register");
    await fillRegistration(page); await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("If this email can be registered, check your inbox for a confirmation link. If you already have an account, sign in instead.");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(stack.rpcRequests).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem("sb-qa-local-auth-token"))).toBeNull();
    stack.assertNoUnexpectedRequests();
  });
}

test("immediate signup opens curated solo listening without creating a Jam or granting private tracks", async ({ context, page, baseURL }) => {
  const stack = new FakeStack(); stack.signupMode = "session"; await stack.install(context);
  await page.goto("/login?mode=register"); await fillRegistration(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`); await enterAfterAuth(page);
  await expect(page.getByRole("dialog", { name: "Jam together" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Owner dashboard" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Archive", exact: true }).click();
  const archive = page.getByRole("dialog", { name: "Song archive" });
  await expect(archive.getByRole("button").filter({ hasText: songs[0].title })).toBeVisible();
  await expect(archive.getByText("Evening tone", { exact: true })).toHaveCount(0);
  await expect.poll(() => stack.libraryReads.length).toBeGreaterThan(0);
  expect(stack.libraryReads.every((read) => read.user === USERS.guest && read.trackIds.length === 0)).toBe(true);
  expect(stack.rpcRequests.filter((request) => request.name.startsWith("jam_"))).toHaveLength(0);
  expect(stack.room).toBeNull();
  stack.assertNoUnexpectedRequests();
});

test("failed activation signs out and does not race the SIGNED_IN callback or mislabel a disabled account", async ({ context, page }) => {
  const stack = new FakeStack(); stack.signupMode = "session"; stack.activationResult = false; await stack.install(context);
  await page.goto("/login?mode=register"); await fillRegistration(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("If you’ve already confirmed, ask the owner");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
  expect(stack.rpcRequests.filter((request) => request.name === "activate_account")).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("sb-qa-local-auth-token"))).toBeNull();
  await expect(page).toHaveURL(/\/login\?mode=register$/);
  stack.assertNoUnexpectedRequests();
});

for (const mode of ["password", "otp"] as const) {
  test(`${mode} sign-in preserves a Jam invite and makes automatic-join failure visible`, async ({ context, page, baseURL }) => {
    const stack = new FakeStack(); await stack.install(context);
    await page.goto("/?jam=BAD999");
    const gate = page.getByRole("dialog", { name: "Sign in required" });
    await expect(gate.getByRole("button", { name: "SIGN IN", exact: true })).toHaveAttribute("href", "/login?next=%2F%3Fjam%3DBAD999");
    await gate.getByRole("button", { name: "SIGN IN", exact: true }).click();
    if (mode === "password") await page.getByRole("button", { name: "Use a password instead" }).click();
    await page.getByLabel("Your email", { exact: true }).fill(email);
    if (mode === "password") {
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
      expect(stack.authRequests[0].redirectTo).toBe(`${baseURL}/login?next=%2F%3Fjam%3DBAD999`);
      expect(stack.authRequests[0].body.create_user).toBe(false);
      await page.getByLabel("Email sign-in code").fill("123456");
      await page.getByRole("button", { name: "Enter the room", exact: true }).click();
    }
    await expect(page).toHaveURL(`${baseURL}/?jam=BAD999`); await enterAfterAuth(page);
    const panel = page.getByRole("dialog", { name: "Jam together" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("No open room with that code");
    expect(stack.rpcRequests.filter((request) => request.name === "jam_join_room")).toHaveLength(1);
    stack.assertNoUnexpectedRequests();
  });
}

test("signup confirmation preserves the invite, auto-opens the joined Jam, and keeps private tracks private", async ({ browser, context, page, baseURL }) => {
  const stack = new FakeStack(); const hostContext = await browser.newContext({ baseURL, serviceWorkers: "block" });
  try {
    await stack.install(hostContext, "host"); await stack.install(context);
    const host = await hostContext.newPage(); await enterMusicRoom(host);
    const hostPanel = await openJam(host);
    await hostPanel.getByRole("button", { name: "Create a private room code" }).click();
    const code = await roomCode(host);
    await page.goto(`/?jam=${code}`);
    const register = page.getByRole("dialog", { name: "Sign in required" }).getByRole("button", { name: "REGISTER", exact: true });
    await expect(register).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/?jam=${code}`)}&mode=register`);
    await register.click(); await fillRegistration(page);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
    expect(stack.authRequests[0].redirectTo).toBe(`${baseURL}/login?next=${encodeURIComponent(`/?jam=${code}`)}`);
    expect(stack.room?.guest_id).toBeNull();
    await page.goto(stack.confirmationLink());
    await expect(page).toHaveURL(`${baseURL}/?jam=${code}`); await enterAfterAuth(page);
    const panel = page.getByRole("dialog", { name: "Jam together" });
    await expect(panel).toBeVisible(); await expect(panel.getByRole("status")).toHaveText("Together, live");
    await expect(panel.getByRole("region", { name: "Room invitation" })).toContainText(code);
    await expect(panel.getByLabel("Choose a shared track")).toBeDisabled();
    await expect.poll(() => stack.libraryReads.filter((read) => read.user === USERS.guest).length).toBeGreaterThan(0);
    expect(stack.libraryReads.filter((read) => read.user === USERS.guest).every((read) => read.trackIds.length === 0)).toBe(true);
    expect(stack.rpcRequests.filter((request) => request.name === "jam_join_room")).toHaveLength(1);
    stack.assertNoUnexpectedRequests();
  } finally { await hostContext.close(); }
});

test("a fresh solo listener can optionally join a copied room code; the invite link still copies", async ({ browser, context, page, baseURL }) => {
  const stack = new FakeStack(); stack.signupMode = "session";
  const hostContext = await browser.newContext({ baseURL, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  try {
    await stack.install(hostContext, "host"); await stack.install(context);
    const host = await hostContext.newPage(); await enterMusicRoom(host);
    const hostPanel = await openJam(host); await hostPanel.getByRole("button", { name: "Create a private room code" }).click();
    const code = await roomCode(host);
    await hostPanel.getByRole("button", { name: "Copy code", exact: true }).click();
    await expect(hostPanel.getByRole("button", { name: "Code copied", exact: true })).toBeVisible();
    expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await hostPanel.getByRole("button", { name: "Invite link", exact: true }).click();
    await expect(hostPanel.getByRole("button", { name: "Link copied", exact: true })).toBeVisible();
    expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/?jam=${code}`);
    await page.goto("/login?mode=register"); await fillRegistration(page);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/`); await enterAfterAuth(page);
    expect(stack.room?.guest_id).toBeNull();
    const guestPanel = await openJam(page);
    await guestPanel.getByLabel("Six-character room code").fill(code.toLowerCase());
    await guestPanel.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guestPanel.getByRole("status")).toHaveText("Together, live");
    expect(stack.room?.guest_id).toBe(USERS.guest);
    stack.assertNoUnexpectedRequests();
  } finally { await hostContext.close(); }
});

for (const destination of ["/library", "/admin", "//evil.example", "/?jam=ABC123&next=//evil.example"]) {
  test(`password sign-in validates destination ${destination}`, async ({ context, page, baseURL }) => {
    const stack = new FakeStack(); await stack.install(context);
    await page.goto(`/login?next=${encodeURIComponent(destination)}`);
    await page.getByRole("button", { name: "Use a password instead" }).click();
    await page.getByLabel("Your email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const expected = ["/library", "/admin"].includes(destination) ? destination : "/";
    // This is a navigation assertion, not an auth-response latency budget:
    // isolated Next dev may compile /admin for the first time after redirect.
    await expect(page).toHaveURL(`${baseURL}${expected}`, { timeout: 60_000 });
    if (expected === "/admin") await expect(page.getByRole("heading", { name: "The owner’s studio" })).toBeVisible();
    if (expected === "/") { await enterAfterAuth(page); expect(stack.room).toBeNull(); }
    expect(stack.rpcRequests.filter((request) => request.name.startsWith("jam_"))).toHaveLength(0);
    stack.assertNoUnexpectedRequests();
  });
}

test("anonymous fake requests do not emulate an authenticated guest", async ({ context, page }) => {
  const stack = new FakeStack(); await stack.install(context); await page.goto("/login");
  const statuses = await page.evaluate(async (origin) => Promise.all(["/auth/v1/user", "/rest/v1/profiles", "/rest/v1/rpc/activate_account"].map(async (path) => (await fetch(`${origin}${path}`, { headers: { authorization: "Bearer qa-public-placeholder" } })).status)), SUPABASE);
  expect(statuses).toEqual([401, 401, 401]);
  expect(stack.rpcRequests).toHaveLength(0);
  stack.assertNoUnexpectedRequests();
});
