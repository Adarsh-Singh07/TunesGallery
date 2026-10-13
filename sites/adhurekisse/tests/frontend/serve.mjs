import { createServer } from "../../node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = fileURLToPath(new URL("./", import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(tmpdir(), "omnirush", "adhurekisse-ui-vite"),
  server: { host: "127.0.0.1", port: 3107, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
  css: { postcss: { plugins: [] } },
  esbuild: { jsx: "automatic" },
  resolve: { alias: [
    { find: "next/link", replacement: `${root}next-shims.tsx` },
    { find: "next/navigation", replacement: `${root}next-shims.tsx` },
    { find: /.*\/PlaybackContext$/, replacement: `${root}player-shim.tsx` },
  ] },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://127.0.0.1:59999"),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify("frontend-test-key"),
  },
});
await server.listen();
server.printUrls();
