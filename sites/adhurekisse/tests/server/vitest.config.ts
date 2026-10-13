import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "server-only": new URL("./empty.ts", import.meta.url).pathname } },
  test: { environment: "node", include: ["tests/server/server*.test.ts"] },
});
