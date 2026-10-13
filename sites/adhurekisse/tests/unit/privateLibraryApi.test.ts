import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, collection } from "../../components/private-library/api";
import { loginError } from "../../components/private-library/authErrors";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("../../lib/auth", () => ({ authedFetch: mocks.fetch }));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { refreshSession: mocks.refresh } } }));
beforeEach(() => { mocks.fetch.mockReset(); mocks.refresh.mockReset(); });

describe("frontend API recovery", () => {
  it("refreshes once after an expired session and retries the original request", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: "expired" }, { status: 401 })).mockResolvedValueOnce(Response.json({ tracks: [] }));
    mocks.refresh.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });
    expect(await api("/api/tracks")).toEqual({ tracks: [] });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("surfaces actionable rate limit and duplicate errors without treating failed requests as success", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: "RATE_LIMITED" }, { status: 429 }));
    await expect(api("/api/tracks")).rejects.toThrow(/Wait a minute/);
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: "DUPLICATE" }, { status: 409 }));
    await expect(api("/api/tracks")).rejects.toBeInstanceOf(ApiError);
  });
  it("normalizes a session pre-refresh failure into the same expired-session contract", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("Please sign in again"));
    await expect(api("/api/tracks")).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/session has expired/) });
  });
  it("fetches every page and rejects non-advancing offsets", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ tracks: [{ id: "a" }], nextOffset: 1 })).mockResolvedValueOnce(Response.json({ tracks: [{ id: "b" }], nextOffset: null }));
    expect(await collection("/api/tracks", "tracks")).toEqual([{ id: "a" }, { id: "b" }]);
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/tracks?offset=0", "/api/tracks?offset=1"]);
    mocks.fetch.mockResolvedValueOnce(Response.json({ tracks: [], nextOffset: 0 }));
    await expect(collection("/api/tracks", "tracks")).rejects.toThrow(/next page/);
  });
  it("distinguishes expired codes, credentials, and transport failure", () => {
    expect(loginError({ code: "otp_expired", message: "Token expired" }, "verify")).toMatch(/fresh code/);
    expect(loginError({ code: "invalid_credentials", message: "Invalid login credentials" }, "password")).toMatch(/didn’t match/);
    expect(loginError(new TypeError("Failed to fetch"), "otp")).toMatch(/connection/);
    expect(loginError({ status: 429, message: "Too many requests" }, "otp")).toMatch(/Wait a minute/);
  });
});
