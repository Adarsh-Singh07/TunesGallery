import { test, expect } from "./fixtures";
import { enterMusicRoom, expectAudioPlaying, mediaState } from "../e2e/helpers";
import { tracks } from "./fake-stack";

test("a private track selected in the actual music archive decodes real ranged audio", async ({ page, stack }, testInfo) => {
  await enterMusicRoom(page);
  await page.getByRole("button", { name: "Open Archive", exact: true }).filter({ visible: true }).click();
  const archive = page.getByRole("dialog", { name: "Song archive" });
  await archive.getByRole("button").filter({ hasText: "Evening tone" }).click();
  await expectAudioPlaying(page);
  const seek = page.getByRole("slider", { name: "Seek", exact: true }).filter({ visible: true });
  await seek.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await mediaState(page))?.time).toBeGreaterThan(4);
  expect(stack.streamRequests[0].authorization).toMatch(/^Bearer /);
  expect(stack.audioRequests.some((request) => !!request.range)).toBe(true);
  expect(stack.audioRequests.every((request) => !request.authorization)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/qa-audio\.test|signature=qa-/);
  await testInfo.attach("actual-archive-media", { body: JSON.stringify(await mediaState(page)), contentType: "application/json" });
  await page.getByRole("button", { name: "Pause", exact: true }).filter({ visible: true }).click();
  await expect.poll(async () => (await mediaState(page))?.paused).toBe(true);
});

test("private audio decodes and persists through Next link and history navigation", async ({ page, stack }, testInfo) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Play Evening tone", exact: true }).click();
  await expectAudioPlaying(page);
  const before = await mediaState(page);
  await page.evaluate(() => { (window as any).__qaOriginalAudio = (window as any).__qaAudio.find((audio: HTMLAudioElement) => audio.currentSrc.includes("qa-audio.test")); });
  await page.getByRole("link", { name: "Music room", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign out", exact: true, includeHidden: true }).first()).toBeAttached();
  const entry = page.getByRole("button", { name: "Enter the music room" });
  if (!await page.evaluate(() => sessionStorage.getItem("adhurekisse_session_entry") === "1")) {
    await expect(entry).toBeVisible();
    await entry.click();
  }
  await expect(entry).not.toBeVisible();
  await expectAudioPlaying(page);
  await page.getByRole("button", { name: "Open Archive", exact: true }).filter({ visible: true }).click();
  await page.getByRole("link", { name: "Your private tracks & playlists" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("button", { name: "Pause Evening tone", exact: true })).toBeVisible();
  await page.goBack();
  await expectAudioPlaying(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/library$/);
  const after = await mediaState(page);
  expect(after!.time).toBeGreaterThan(before!.time);
  expect(after!.count).toBe(before!.count);
  expect(await page.evaluate(() => (window as any).__qaAudio.includes((window as any).__qaOriginalAudio) && !(window as any).__qaOriginalAudio.paused)).toBe(true);
  expect(stack.streamRequests).toHaveLength(1);
  expect(stack.streamRequests[0].authorization).toMatch(/^Bearer /);
  expect(stack.audioRequests.every((request) => !request.authorization)).toBe(true);
  expect(stack.audioRequests.some((request) => !!request.range && request.status === 206)).toBe(true);
  await testInfo.attach("navigation-media", { body: JSON.stringify({ before, after, streams: stack.streamRequests.length, rangedRequests: stack.audioRequests.filter((request) => request.range).length }), contentType: "application/json" });
  await page.getByRole("button", { name: "Pause Evening tone", exact: true }).click();
  await expect.poll(async () => (await mediaState(page))?.paused).toBe(true);
});

test("late stream authorization cannot replace the user's newer selection", async ({ page, stack }) => {
  stack.delayStream = tracks[0].id;
  await page.goto("/library");
  await page.getByRole("button", { name: "Play Evening tone", exact: true }).click();
  await page.getByRole("button", { name: "Play Morning tone", exact: true }).click();
  await expectAudioPlaying(page);
  await expect.poll(async () => (await mediaState(page))?.src).toContain(tracks[1].id);
  await expect.poll(() => stack.streamRequests.length).toBe(2);
  // Wait on the delayed HTTP response, then check that the current source is still newer.
  await expect.poll(async () => page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/stream")).length)).toBe(2);
  expect((await mediaState(page))!.src).toContain(tracks[1].id);
});

test("authorization failure is visible and never presented as successful playback", async ({ page, stack }) => {
  stack.denyStream = true;
  await page.goto("/library");
  await page.getByRole("button", { name: "Play Evening tone", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Track not found/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause Evening tone", exact: true })).not.toBeVisible();
  expect((await mediaState(page))?.paused ?? true).toBe(true);
  expect(stack.audioRequests).toHaveLength(0);
});

test("library search and details are keyboard usable; sign-out removes private access", async ({ page, stack }) => {
  await page.goto("/library");
  await page.getByLabel("Search your tracks").fill("not-a-track");
  await expect(page.getByRole("heading", { name: "No records found." })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Details for Evening tone" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A room for your records" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tracks", exact: true })).not.toBeVisible();
  expect(stack.streamRequests).toHaveLength(0);
});
