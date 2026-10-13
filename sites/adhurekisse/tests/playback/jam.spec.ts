import { expect, test } from "@playwright/test";
import { FakeStack, tracks } from "./fake-stack";
import { exerciseJam } from "../e2e/jam-flow";
import { enterMusicRoom, observeAudio, openJam, roomCode } from "../e2e/helpers";

test("two isolated browsers exercise Jam against Next with mocked Supabase HTTP and Realtime", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: "coverage", description: "Mocked Supabase integration, not live cloud or database RLS verification" });
  const stack = new FakeStack();
  const host = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const guest = await browser.newContext({ baseURL, viewport: { width: 430, height: 932 }, serviceWorkers: "block" });
  try {
    await Promise.all([stack.install(host, "host"), stack.install(guest, "guest")]);
    const hostPage = await host.newPage(); const guestPage = await guest.newPage();
    await Promise.all([observeAudio(hostPage), observeAudio(guestPage)]);
    await exerciseJam(hostPage, guestPage, guest, tracks[0].title, tracks[1].title, testInfo);
    expect(stack.commands.map((command) => command.type)).toEqual(expect.arrayContaining(["set_track", "start_at", "play", "pause", "seek", "suggest_track", "skip_next", "set_collaborative", "end_room"]));
    stack.assertNoUnexpectedRequests();
  } finally { await Promise.all([host.close(), guest.close()]); }
});

test("successful HTTP room creation alone never claims a live connection", async ({ context, page }) => {
  const stack = new FakeStack(); stack.realtimeEnabled = false;
  await stack.install(context, "host");
  await enterMusicRoom(page);
  const panel = await openJam(page);
  await panel.getByRole("button", { name: "Create a private room" }).click();
  await expect(panel.getByRole("region", { name: "Room invitation" })).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("Reconnecting");
  await expect(panel.getByText("Together, live", { exact: true })).not.toBeVisible();
  await expect(panel.getByLabel("Choose a shared track")).toBeDisabled();
  stack.assertNoUnexpectedRequests();
});

test("an invalid room code fails and an occupied room refuses a third browser", async ({ browser, baseURL }) => {
  const stack = new FakeStack();
  const contexts = await Promise.all(["host", "guest", "third"].map(() => browser.newContext({ baseURL, serviceWorkers: "block" })));
  try {
    await Promise.all(contexts.map((context, index) => stack.install(context, (["host", "guest", "third"] as const)[index])));
    const [host, guest, third] = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all([enterMusicRoom(host), enterMusicRoom(guest), enterMusicRoom(third)]);
    const thirdPanel = await openJam(third);
    await thirdPanel.getByLabel("Six-character room code").fill("BAD999");
    await thirdPanel.getByRole("button", { name: "Join", exact: true }).click();
    await expect(thirdPanel.getByRole("alert")).toContainText("No open room with that code");
    await openJam(host);
    await host.getByRole("button", { name: "Create a private room" }).click();
    const code = await roomCode(host);
    const guestPanel = await openJam(guest);
    await guestPanel.getByLabel("Six-character room code").fill(code);
    await guestPanel.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guestPanel.getByRole("status")).toHaveText("Together, live");
    await thirdPanel.getByLabel("Six-character room code").fill(code);
    await thirdPanel.getByRole("button", { name: "Join", exact: true }).click();
    await expect(thirdPanel.getByRole("alert")).toContainText("already has two listeners");
    await expect(thirdPanel.getByText("Together, live", { exact: true })).not.toBeVisible();
    stack.assertNoUnexpectedRequests();
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});
