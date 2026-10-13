import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { FakeStack } from "./fake-stack";
import { enterMusicRoom, openJam } from "../e2e/helpers";

for (const path of ["/login", "/library", "/"]) {
  test(`measure console, navigation performance and axe accessibility for Next ${path}`, async ({ context, page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(!process.env.QA_AXE_SOURCE, "Set QA_AXE_SOURCE to an installed axe-core/axe.min.js to run the measured accessibility audit");
    const stack = new FakeStack(); await stack.install(context, path === "/login" ? undefined : "host");
    const consoleErrors: string[] = []; const pageErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const axe = readFileSync(process.env.QA_AXE_SOURCE!, "utf8");
    if (path === "/") await enterMusicRoom(page); else {
      await page.goto(path);
      await expect(path === "/login" ? page.getByLabel("Your email", { exact: true }) : page.getByRole("button", { name: "Play Evening tone", exact: true })).toBeVisible();
    }
    await page.addScriptTag({ content: axe });
    const result = await page.evaluate(async () => {
      const accessibility = await (window as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return {
        url: location.pathname,
        navigation: { ttfbMs: navigation.responseStart, domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd, resourceCount: performance.getEntriesByType("resource").length },
        violations: accessibility.violations.map((item: any) => ({ id: item.id, impact: item.impact, description: item.description, helpUrl: item.helpUrl, nodes: item.nodes.map((node: any) => ({ target: node.target, summary: node.failureSummary })) })),
        passes: accessibility.passes.length,
      };
    });
    const measurements = [result];
    if (path === "/") {
      const panel = await openJam(page);
      const violations = await page.evaluate(async () => {
        const result = await (window as any).axe.run(document.querySelector('[aria-labelledby="jam-title"]'), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return result.violations.map((item: any) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node: any) => ({ target: node.target })) }));
      });
      measurements.push({ ...result, url: "/#jam-dialog", violations });
      await panel.getByRole("button", { name: "Close Jam panel" }).click();
    }
    await testInfo.attach("browser-qa-measurements", { body: JSON.stringify({ measurements, consoleErrors, pageErrors }, null, 2), contentType: "application/json" });
    expect.soft(pageErrors, "Uncaught browser exceptions").toEqual([]);
    expect.soft(consoleErrors, "Browser console errors").toEqual([]);
    for (const measured of measurements) expect.soft(measured.violations.filter((item: any) => ["serious", "critical"].includes(item.impact)), `Serious/critical axe violations: ${measured.url}`).toEqual([]);
    stack.assertNoUnexpectedRequests();
  });
}
