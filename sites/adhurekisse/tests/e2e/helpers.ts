import { expect, type Page } from "@playwright/test";

export const requiredHostedEnv = [
  "E2E_BASE_URL", "E2E_HOST_EMAIL", "E2E_HOST_PASSWORD",
  "E2E_GUEST_EMAIL", "E2E_GUEST_PASSWORD", "E2E_TEST_TRACK_TITLE",
  "E2E_SECOND_TRACK_TITLE",
] as const;
export const missingHostedEnv = requiredHostedEnv.filter((name) => !process.env[name]);
export const hostedSkipReason = `Hosted acceptance requires a seeded TEST deployment; missing: ${missingHostedEnv.join(", ")}`;

export async function signIn(page: Page, role: "HOST" | "GUEST" | "THIRD") {
  await page.goto("/login?next=%2Flibrary");
  await page.getByRole("button", { name: "Use a password instead" }).click();
  await page.getByLabel("Your email", { exact: true }).fill(process.env[`E2E_${role}_EMAIL`]!);
  await page.getByLabel("Password", { exact: true }).fill(process.env[`E2E_${role}_PASSWORD`]!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

export async function enterMusicRoom(page: Page, path = "/") {
  await page.goto(path);
  // The shell renders before asynchronous auth completes. Wait for authenticated
  // UI, otherwise a premature absence check can miss the entry gate entirely.
  await expect(page.getByRole("button", { name: "Sign out", exact: true, includeHidden: true }).first()).toBeAttached();
  const entry = page.getByRole("button", { name: "Enter the music room" });
  const entered = await page.evaluate(() => sessionStorage.getItem("adhurekisse_session_entry") === "1");
  if (!entered) { await expect(entry).toBeVisible(); await entry.click(); }
  await expect(entry).not.toBeVisible();
}

export async function openJam(page: Page) {
  await page.getByRole("button", { name: "Jam together", exact: true }).filter({ visible: true }).click();
  return page.getByRole("dialog", { name: "Jam together" });
}

export async function roomCode(page: Page) {
  const invite = page.getByRole("region", { name: "Room invitation" });
  await expect(invite).toBeVisible();
  const code = (await invite.innerText()).match(/\b[A-Z0-9]{6}\b/)?.[0];
  expect(code, "Invitation must expose the six-character room code").toBeTruthy();
  return code!;
}

// Observe genuine browser media elements, including detached new Audio() elements.
// This does not replace play(), pause(), duration, events, or provider behavior.
export async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const elements: HTMLAudioElement[] = [];
    Object.defineProperty(window, "__qaAudio", { value: elements });
    window.Audio = new Proxy(window.Audio, {
      construct(target, args) {
        const audio = Reflect.construct(target, args) as HTMLAudioElement;
        elements.push(audio);
        return audio;
      },
    });
  });
}

export async function mediaState(page: Page) {
  return page.evaluate(() => {
    const elements = (window as unknown as { __qaAudio: HTMLAudioElement[] }).__qaAudio;
    const active = elements?.filter((audio) => !!audio.currentSrc).at(-1);
    return active ? { time: active.currentTime, duration: active.duration, paused: active.paused, ready: active.readyState, src: active.currentSrc, rate: active.playbackRate, count: elements.length } : null;
  });
}

export async function expectAudioPlaying(page: Page) {
  const enable = page.getByRole("button", { name: "Enable audio", exact: true });
  await expect.poll(async () => {
    if (await enable.isVisible()) await enable.click();
    const audio = await mediaState(page);
    return !!audio && !audio.paused && audio.time > 0 && audio.duration > 0;
  }, { timeout: 30_000, message: "A real browser audio element must decode and advance" }).toBe(true);
}
