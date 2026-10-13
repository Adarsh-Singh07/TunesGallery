import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { enterMusicRoom, expectAudioPlaying, mediaState, openJam, roomCode } from "./helpers";

/** Same user-visible acceptance flow against real Next pages in both projects. */
export async function exerciseJam(host: Page, guest: Page, guestContext: BrowserContext, firstTrack: string, secondTrack: string, testInfo: TestInfo) {
  await Promise.all([enterMusicRoom(host), enterMusicRoom(guest)]);
  const hostPanel = await openJam(host);
  await hostPanel.getByRole("button", { name: "Create a private room" }).click();
  const code = await roomCode(host);
  const guestPanel = await openJam(guest);
  await guestPanel.getByLabel("Six-character room code").fill(code);
  await guestPanel.getByRole("button", { name: "Join", exact: true }).click();
  await expect(hostPanel.getByRole("status")).toHaveText("Together, live");
  await expect(guestPanel.getByRole("status")).toHaveText("Together, live");
  await expect(host.getByRole("region", { name: "Room participants" })).toContainText("Guest");
  await expect(guestPanel.getByRole("button", { name: "Play for both", exact: true })).toBeDisabled();

  // Select by visible option text without depending on catalogue indices.
  const firstValue = await hostPanel.getByRole("option").filter({ hasText: firstTrack }).getAttribute("value");
  await hostPanel.getByLabel("Choose a shared track").selectOption(firstValue!);
  await hostPanel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(guestPanel.getByRole("listitem").filter({ hasText: firstTrack })).toBeVisible();
  await hostPanel.getByRole("button", { name: `Play ${firstTrack} for both`, exact: true }).click();
  await Promise.all([expectAudioPlaying(host), expectAudioPlaying(guest)]);
  await expect(guestPanel.getByRole("heading", { name: firstTrack, exact: true })).toBeVisible();
  const positions = await Promise.all([mediaState(host), mediaState(guest)]);
  expect(Math.abs(positions[0]!.time - positions[1]!.time), "Browser media drift after scheduled start (seconds)").toBeLessThan(1.5);
  await testInfo.attach("jam-initial-media", { body: JSON.stringify(positions.map((state) => ({ time: state!.time, duration: state!.duration, paused: state!.paused }))), contentType: "application/json" });

  await hostPanel.getByRole("button", { name: "Pause for both", exact: true }).click();
  await expect.poll(async () => (await mediaState(guest))?.paused).toBe(true);
  await expect(guestPanel.getByRole("button", { name: "Play for both", exact: true })).toBeDisabled();
  await hostPanel.getByRole("button", { name: "Play for both", exact: true }).click();
  await Promise.all([expectAudioPlaying(host), expectAudioPlaying(guest)]);
  await hostPanel.getByLabel("Seek back ten seconds for both").click();
  await expect.poll(async () => Math.abs((await mediaState(host))!.time - (await mediaState(guest))!.time)).toBeLessThan(1.5);

  const secondValue = await guestPanel.getByRole("option").filter({ hasText: secondTrack }).getAttribute("value");
  await guestPanel.getByLabel("Choose a shared track").selectOption(secondValue!);
  await guestPanel.getByRole("button", { name: "Suggest", exact: true }).click();
  await expect(hostPanel.getByRole("listitem").filter({ hasText: secondTrack })).toContainText("guest suggestion");
  await hostPanel.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guestPanel.getByRole("heading", { name: secondTrack, exact: true })).toBeVisible();
  await Promise.all([expectAudioPlaying(host), expectAudioPlaying(guest)]);

  const message = `A shared moment ${testInfo.testId.slice(-8)}`;
  await guestPanel.getByLabel("Chat message").fill(message);
  await guestPanel.getByRole("button", { name: "Send message" }).click();
  await expect(hostPanel.getByRole("log", { name: "Room chat" })).toContainText(message);
  await hostPanel.getByRole("button", { name: "React ❤️", exact: true }).click();
  await expect(guestPanel.getByRole("log", { name: "Room chat" })).toContainText("❤️");
  await guestPanel.getByRole("button", { name: "15 min", exact: true }).click();
  await expect(guestPanel.getByRole("button", { name: /Cancel ·/ })).toBeVisible();
  await expect(hostPanel.getByRole("button", { name: "15 min", exact: true })).toBeVisible();
  await guestPanel.getByRole("button", { name: /Cancel ·/ }).click();

  await hostPanel.getByLabel("Let my guest control playback too").check();
  await expect(guestPanel.getByRole("button", { name: "Pause for both", exact: true })).toBeEnabled();
  await guestPanel.getByRole("button", { name: "Pause for both", exact: true }).click();
  await expect.poll(async () => (await mediaState(host))?.paused).toBe(true);
  await hostPanel.getByRole("button", { name: "Play for both", exact: true }).click();
  await expectAudioPlaying(guest);

  await guestContext.setOffline(true);
  await expect(guestPanel.getByRole("status")).toContainText("Reconnecting");
  await expect(guestPanel.getByRole("status")).not.toContainText("Together, live");
  await expect(guestPanel.getByRole("button", { name: "Pause for both", exact: true })).toBeDisabled();
  await guestContext.setOffline(false);
  await expect(guestPanel.getByRole("status")).toHaveText("Together, live", { timeout: 60_000 });
  await expectAudioPlaying(guest);
  await hostPanel.getByRole("button", { name: "End room", exact: true }).click();
  await expect(guestPanel.getByRole("status")).toContainText("room has ended");
  await guestPanel.getByRole("button", { name: "Back to solo", exact: true }).click();
  await expect(guestPanel.getByRole("button", { name: "Create a private room" })).toBeVisible();
}
