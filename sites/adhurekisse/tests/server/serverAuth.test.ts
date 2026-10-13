import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
  return { create: vi.fn(), user: vi.fn(), profile: vi.fn(), accept: vi.fn() };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { extractBearerToken, requireUser } from "../../lib/server/auth";

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: () => query, eq: () => query, single: mocks.profile };
  mocks.create.mockReturnValue({ auth: { getUser: mocks.user }, from: () => query, rpc: mocks.accept });
  mocks.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
});
const req = () => new Request("https://app.test/api/test", { headers: { Authorization: "Bearer valid.jwt.token" } });

it("requires provider-validated identity and an active DB profile rather than metadata", async () => {
  mocks.profile.mockResolvedValue({ data: { id: "user", email: "u@test", is_admin: false, is_active: false } });
  expect(await requireUser(req())).toBeNull();
  mocks.profile.mockResolvedValue({ data: { id: "user", email: "u@test", is_admin: false, is_active: true } });
  expect(await requireUser(req())).toMatchObject({ userId: "user", isAdmin: false });
  mocks.user.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });
  expect(await requireUser(req())).toBeNull();
});
it("inactive or missing users cannot become active if invitation acceptance is denied", async () => {
  mocks.profile.mockResolvedValue({ data: null });
  mocks.accept.mockResolvedValue({ data: false, error: null });
  expect(await requireUser(req())).toBeNull();
  expect(mocks.accept).toHaveBeenCalledWith("accept_invitation");
});
it("rejects malformed bearer headers and cookie-only requests", () => {
  expect(extractBearerToken(new Request("https://app.test", { headers: { Cookie: "token=jwt" } }))).toBeNull();
  expect(extractBearerToken(new Request("https://app.test", { headers: { Authorization: "Bearer token,other" } }))).toBeNull();
  expect(extractBearerToken(req())).toBe("valid.jwt.token");
});
