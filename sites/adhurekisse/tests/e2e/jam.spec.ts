import { expect, test } from "@playwright/test";
import { enterMusicRoom, hostedSkipReason, missingHostedEnv, observeAudio, openJam, roomCode, signIn } from "./helpers";
import { exerciseJam } from "./jam-flow";

test.skip(missingHostedEnv.length > 0, hostedSkipReason);

test("host and guest complete a real hosted synchronized Jam session", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const host = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const guest = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  try {
    await Promise.all([observeAudio(hostPage), observeAudio(guestPage)]);
    await Promise.all([signIn(hostPage, "HOST"), signIn(guestPage, "GUEST")]);
    await exerciseJam(hostPage, guestPage, guest, process.env.E2E_TEST_TRACK_TITLE!, process.env.E2E_SECOND_TRACK_TITLE!, testInfo);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test("a third invited account is refused while both room seats are occupied", async ({ browser }) => {
  test.skip(!process.env.E2E_THIRD_EMAIL || !process.env.E2E_THIRD_PASSWORD, "Room-full hosted acceptance additionally requires E2E_THIRD_EMAIL and E2E_THIRD_PASSWORD");
  const contexts = await Promise.all(["host", "guest", "third"].map(() => browser.newContext({ baseURL: process.env.E2E_BASE_URL })));
  try {
    const [host, guest, third] = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all([signIn(host, "HOST"), signIn(guest, "GUEST"), signIn(third, "THIRD")]);
    await Promise.all([enterMusicRoom(host), enterMusicRoom(guest), enterMusicRoom(third)]);
    await openJam(host);
    await host.getByRole("button", { name: "Create a private room" }).click();
    const code = await roomCode(host);
    for (const page of [guest, third]) {
      await openJam(page);
      await page.getByLabel("Six-character room code").fill(code);
      await page.getByRole("button", { name: "Join", exact: true }).click();
      if (page === guest) await expect(guest.getByRole("dialog", { name: "Jam together" }).getByRole("status")).toHaveText("Together, live");
    }
    await expect(third.getByRole("alert")).toContainText("already has two listeners");
    await host.getByRole("button", { name: "End room", exact: true }).click();
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});
