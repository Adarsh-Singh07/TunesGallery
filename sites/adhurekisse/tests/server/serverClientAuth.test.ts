import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), refresh: vi.fn(), rpc: vi.fn(), eq: vi.fn(), fetch: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: {
  auth: { getSession: mocks.session, getUser: mocks.user, refreshSession: mocks.refresh },
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: mocks.eq }) }),
} }));
import { authedFetch, getProfile } from "../../lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.session.mockResolvedValue({ data: { session: { access_token: "old-token", expires_at: Date.now() / 1000, user: { id: "forged-admin-id" } } } });
});

it("uses verified identity rather than a forged local session user for profile lookup", async () => {
  mocks.user.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.eq.mockReturnValue({ single: async () => ({ data: { id: "verified-user", is_active: true, is_admin: false } }) });
  expect(await getProfile()).toMatchObject({ id: "verified-user", is_admin: false });
  expect(mocks.eq).toHaveBeenCalledWith("id", "verified-user");
});

it("never attaches a token to foreign URLs or follows API redirects", async () => {
  await expect(authedFetch("https://evil.test/api/tracks")).rejects.toThrow("same-origin");
  await expect(authedFetch("/api/\\evil.test")).rejects.toThrow("same-origin");
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.refresh.mockResolvedValue({ data: { session: { access_token: "fresh-token" } }, error: null });
  mocks.fetch.mockResolvedValue(new Response("ok"));
  await authedFetch("/api/tracks");
  const [, options] = mocks.fetch.mock.calls[0];
  expect(options.headers.get("authorization")).toBe("Bearer fresh-token");
  expect(options).toMatchObject({ cache: "no-store", credentials: "omit", redirect: "error" });
});
