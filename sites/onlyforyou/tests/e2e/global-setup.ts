// ─────────────────────────────────────────────────────────────────────────────
// Global setup: sign both test users in through Supabase (password users
// provisioned in the TEST project) and persist storage states so each spec
// context starts authenticated.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type Session } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

export async function globalSetup() {
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? "";
  const host = { email: process.env.E2E_HOST_EMAIL!, password: process.env.E2E_HOST_PASSWORD! };
  const guest = { email: process.env.E2E_GUEST_EMAIL!, password: process.env.E2E_GUEST_PASSWORD! };

  if (!url) throw new Error("E2E_SUPABASE_URL missing");

  const browser = await chromium.launch();
  const users = [
    { name: "host", ...host },
    { name: "guest", ...guest },
  ] as const;

  for (const user of users) {
    const supabase = createClient(url, anonKey);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error || !data.session) {
      throw new Error(`E2E sign-in failed for ${user.name}: ${error?.message ?? "no session"}`);
    }

    const context = await browser.newContext();
    const session: Session = data.session;
    await context.addInitScript(
      ({ sbUrl, token }) => {
        const projectRef = new URL(sbUrl).hostname.split(".")[0];
        window.localStorage.setItem(
          `sb-${projectRef}-auth-token`,
          JSON.stringify({ currentSession: token, expiresAt: token.expires_at }),
        );
      },
      { sbUrl: url, token: session },
    );
    await context.storageState({ path: `tests/e2e/.auth-${user.name}.json` });
    await context.close();
  }
  await browser.close();
}
