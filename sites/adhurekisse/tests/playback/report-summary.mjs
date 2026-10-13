// Summarize a Playwright JSON report without printing credentials or stream URLs.
import { readFileSync } from "node:fs";
const report = JSON.parse(readFileSync(process.argv[2] ?? "/tmp/omnirush/adhurekisse-playback-report.json", "utf8"));
function walk(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
      console.log(JSON.stringify({ title: spec.title, status: result.status, durationMs: result.duration, errors: (result.errors ?? []).map((error) => error.message?.replace(/\u001b\[[0-9;]*m/g, "").slice(0, 1600)) }, null, 2));
      for (const attachment of result.attachments ?? []) {
        if (attachment.contentType !== "application/json") continue;
        const text = attachment.body ? Buffer.from(attachment.body, "base64").toString("utf8") : attachment.path ? readFileSync(attachment.path, "utf8") : "{}";
        const value = JSON.parse(text);
        const sanitized = JSON.stringify(value, (key, item) => ["src", "authorization", "access_token"].includes(key) ? "[redacted]" : item, 2);
        console.log(`${attachment.name}: ${sanitized}`);
      }
    }
    walk(suite.suites);
  }
}
walk(report.suites);
console.log(JSON.stringify(report.stats, null, 2));
