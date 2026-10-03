// ─────────────────────────────────────────────────────────────────────────────
// Server-only auth helpers for API routes.
//
// API routes authenticate with `Authorization: Bearer <access_token>` sent by
// the browser client. Because privileged operations never rely on cookies,
// cross-site request forgery cannot reach them; the token is short-lived and
// issued by Supabase Auth.
//
// NEVER import this module from client code — it holds the service-role key.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/** Supabase client acting AS the caller — RLS applies to every query. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client — bypasses RLS. Server-side only, for R2 bookkeeping. */
export function serviceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthContext {
  userId: string;
  email: string;
  isAdmin: boolean;
  /** Supabase client bound to the caller (RLS enforced). */
  db: SupabaseClient;
}

/**
 * Authenticate the request and load the caller's profile.
 * Returns null when the token is missing/invalid or the user has no profile
 * (i.e. was never invited).
 */
export async function requireUser(req: Request): Promise<AuthContext | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const token = extractBearerToken(req);
  if (!token) return null;

  const db = userClient(token);
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("id, email, is_admin")
    .eq("id", userData.user.id)
    .single();
  if (!profile) return null; // signed up but never invited / provisioned

  return {
    userId: profile.id,
    email: profile.email,
    isAdmin: !!profile.is_admin,
    db,
  };
}

export function unauthorized(message = "Unauthorized") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return Response.json({ error: message }, { status: 403 });
}
