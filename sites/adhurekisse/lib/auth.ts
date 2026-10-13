// ─────────────────────────────────────────────────────────────────────────────
// Client-side auth helpers (browser only).
//
// Sessions are Supabase sessions in localStorage. API calls attach the access
// token as a Bearer header — no cookie-based privileged endpoints exist, so
// CSRF has nothing to bite on.
// ─────────────────────────────────────────────────────────────────────────────

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  is_active: boolean;
}

export const authEnabled = !!supabase;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) return null;
  // Browser storage is not proof of the displayed identity/role either.
  const { data: identity, error: identityError } = await supabase.auth.getUser(session.access_token);
  if (identityError || !identity.user) return null;
  const { data: active, error } = await supabase.rpc("activate_account");
  if (error || active !== true) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_admin, is_active")
    .eq("id", identity.user.id)
    .single();
  return data?.is_active ? data as Profile : null;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Fetch an API route with the caller's Supabase access token attached.
 * Refreshes the session first when it is close to expiry.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // Never attach a private access token to an absolute/foreign URL.
  if (!input.startsWith("/api/") || input.startsWith("//") || input.includes("\\")) {
    throw new Error("Authenticated requests must use a same-origin API path");
  }
  let session = await getSession();
  if (supabase && session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw new Error("Please sign in again");
    session = refreshed.data.session;
  }
  const token = session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers, cache: "no-store", credentials: "omit", redirect: "error" });
}

// ── DB row shapes used across the client ────────────────────────────────────

export interface TrackRow {
  id: string;
  owner_id: string;
  title: string;
  artist: string;
  album: string | null;
  movie: string | null;
  year: string | null;
  tags: string[];
  audio_key: string | null;
  artwork_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  status: "pending" | "ready" | "failed";
  created_at: string;
  updated_at: string;
  /** Presigned artwork URL — only present on ready tracks with artwork. */
  artworkUrl?: string | null;
}
