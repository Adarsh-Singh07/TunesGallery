// Stage the CURRENT working tree, including untracked implementation files.
// Explicit allowlist: never enumerate/read/copy .env*, git metadata, or secrets.
// App source is unchanged: this is an isolated Next dev server, not a harness.
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const parent = process.env.QA_STAGE_PARENT ?? "/tmp/omnirush";
if (!existsSync(parent)) throw new Error(`Stage parent must already exist: ${parent}`);
const stage = process.env.QA_STAGE_DIR ?? mkdtempSync(path.join(parent, "adhurekisse-next-"));
if (path.dirname(stage) !== parent || !path.basename(stage).startsWith("adhurekisse-next-") || !existsSync(stage)) throw new Error("QA_STAGE_DIR must be an existing adhurekisse-next-* directory directly inside QA_STAGE_PARENT");
for (const entry of ["app", "components", "data", "lib", "public", "next.config.ts", "package.json", "postcss.config.js", "tailwind.config.js", "tsconfig.json", "next-env.d.ts"]) {
  if (existsSync(path.join(source, entry))) cpSync(path.join(source, entry), path.join(stage, entry), { recursive: true });
}
const modules = process.env.QA_NODE_MODULES ?? path.join(source, "node_modules");
if (!existsSync(path.join(stage, "node_modules"))) {
  if (process.env.QA_NEXT_TURBO === "1") cpSync(realpathSync(modules), path.join(stage, "node_modules"), { recursive: true });
  else symlinkSync(realpathSync(modules), path.join(stage, "node_modules"), "dir");
}
mkdirSync(path.join(stage, ".next"), { recursive: true });
console.log(`QA isolated Next source: ${stage}`);
const child = spawn(process.execPath, [path.join(stage, "node_modules/next/dist/bin/next"), "dev", ...(process.env.QA_NEXT_TURBO === "1" ? ["--turbopack"] : []), "--hostname", "127.0.0.1", "--port", process.env.QA_PORT ?? "3210"], {
  cwd: stage,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: "https://qa-local.supabase.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "qa-public-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET_NAME: "",
  },
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
