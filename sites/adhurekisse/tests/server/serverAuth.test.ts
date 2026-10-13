import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
  return { create: vi.fn(), user: vi.fn(), profile: vi.fn(), accept: vi.fn(), eq: vi.fn() };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { extractBearerToken, requireUser } from "../../lib/server/auth";

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: () => query, eq: mocks.eq, single: mocks.profile };
  mocks.eq.mockReturnValue(query);
  mocks.create.mockReturnValue({ auth: { getUser: mocks.user }, from: () => query, rpc: mocks.accept });
  mocks.user.mockResolvedValue({ data: { user: { id: "user", is_anonymous: false, user_metadata: { is_admin: true, is_active: true } } }, error: null });
  mocks.profile.mockResolvedValue({ data: null, error: null });
  mocks.accept.mockResolvedValue({ data: false, error: null });
});
const req = () => new Request("https://app.test/api/test", { headers: { Authorization: "Bearer valid.jwt.token" } });

it("requires provider-validated identity and an active DB profile rather than metadata", async () => {
  mocks.profile.mockResolvedValue({ data: { id: "user", email: "u@test", is_admin: false, is_active: false } });
  expect(await requireUser(req())).toBeNull();
  mocks.profile.mockResolvedValue({ data: { id: "user", email: "u@test", is_admin: false, is_active: true } });
  expect(await requireUser(req())).toMatchObject({ userId: "user", isAdmin: false });
  expect(mocks.user).toHaveBeenCalledWith("valid.jwt.token");
  expect(mocks.eq).toHaveBeenCalledWith("id", "user");
  mocks.user.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });
  expect(await requireUser(req())).toBeNull();
});
it.each([null, { id: "user", email: "u@test", is_admin: true, is_active: false }])("missing/inactive profile %j cannot bypass denied activation", async (profile) => {
  mocks.profile.mockResolvedValueOnce({ data: profile }).mockResolvedValue({ data: { id: "user", is_active: true, is_admin: true } });
  expect(await requireUser(req())).toBeNull();
  expect(mocks.accept).toHaveBeenCalledWith("activate_account");
  // A denial is final: do not fall back to an invitation RPC or stale profile.
  expect(mocks.accept).toHaveBeenCalledTimes(1);
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it.each([null, { id: "user", email: "u@test", is_active: false, is_admin: true }])("eligible missing/inactive profile %j activates and reloads its role through RLS", async (profile) => {
  mocks.profile.mockResolvedValueOnce({ data: profile, error: profile ? null : { code: "PGRST116" } })
    .mockResolvedValueOnce({ data: { id: "user", email: "u@test", is_active: true, is_admin: false }, error: null });
  mocks.accept.mockResolvedValue({ data: true, error: null });
  expect(await requireUser(req())).toMatchObject({ userId: "user", email: "u@test", isAdmin: false });
  expect(mocks.profile).toHaveBeenCalledTimes(2);
  expect(mocks.accept).toHaveBeenCalledExactlyOnceWith("activate_account");
  expect(mocks.create).toHaveBeenCalledWith("https://test.supabase.invalid", "public-test-key", expect.objectContaining({
    global: { headers: { Authorization: "Bearer valid.jwt.token" } },
  }));
});
it.each([
  { data: null, error: null }, { data: "true", error: null },
  { data: true, error: { message: "activation failed" } },
])("activation requires a successful boolean true: %j", async (result) => {
  mocks.accept.mockResolvedValue(result);
  expect(await requireUser(req())).toBeNull();
  expect(mocks.profile).toHaveBeenCalledTimes(1);
});
it.each([
  { data: null, error: null },
  { data: { id: "user", is_active: false }, error: null },
  { data: { id: "someone-else", is_active: true }, error: null },
  { data: { id: "user", is_active: true }, error: { message: "read failed" } },
])("activation success still requires an active caller profile on reload: %j", async (result) => {
  mocks.profile.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce(result);
  mocks.accept.mockResolvedValue({ data: true, error: null });
  expect(await requireUser(req())).toBeNull();
});
it("retains active administrator roles without attempting to reactivate", async () => {
  mocks.profile.mockResolvedValue({ data: { id: "user", email: "owner@test", is_active: true, is_admin: true } });
  expect(await requireUser(req())).toMatchObject({ userId: "user", isAdmin: true });
  expect(mocks.accept).not.toHaveBeenCalled();
});
it("rejects an anonymous provider identity before profile access", async () => {
  mocks.user.mockResolvedValue({ data: { user: { id: "user", is_anonymous: true } }, error: null });
  mocks.profile.mockResolvedValue({ data: { id: "user", is_active: true, is_admin: true } });
  expect(await requireUser(req())).toBeNull();
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
});
it("rejects malformed bearer headers and cookie-only requests", () => {
  expect(extractBearerToken(new Request("https://app.test", { headers: { Cookie: "token=jwt" } }))).toBeNull();
  expect(extractBearerToken(new Request("https://app.test", { headers: { Authorization: "Bearer token,other" } }))).toBeNull();
  expect(extractBearerToken(req())).toBe("valid.jwt.token");
});
