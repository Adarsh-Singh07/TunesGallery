import { test, expect } from "./fixtures";
import { enterMusicRoom, openJam } from "../e2e/helpers";

for (const width of [320, 360, 375, 390, 414, 430, 768, 1440]) {
  test(`Next private library fits a ${width}px viewport`, async ({ page, stack }) => {
    void stack;
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1024 });
    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Play Evening tone", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
  test(`Next music room and Jam fit a ${width}px viewport`, async ({ page, stack }, testInfo) => {
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1024 });
    await enterMusicRoom(page);
    const panel = await openJam(page);
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await expect.poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Tab");
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await testInfo.attach(`music-room-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    stack.assertNoUnexpectedRequests();
  });
}
