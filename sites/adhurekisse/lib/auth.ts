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
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_admin")
    .eq("id", session.user.id)
    .single();
  return (data as Profile) ?? null;
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
  const session = await getSession();
  const token = session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
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
}
