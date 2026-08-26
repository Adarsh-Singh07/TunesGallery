// ─────────────────────────────────────────────────────────────────────────────
// PKCE helpers for Spotify Authorization Code with PKCE flow
//
// No client secret is ever used in browser code. PKCE lets us safely
// exchange an authorization code for tokens without a backend.
// ─────────────────────────────────────────────────────────────────────────────

const CODE_VERIFIER_KEY = "spotify_code_verifier";
const ACCESS_TOKEN_KEY  = "spotify_access_token";
const REFRESH_TOKEN_KEY = "spotify_refresh_token";
const EXPIRES_AT_KEY    = "spotify_expires_at";

/** Generate a cryptographically secure random string */
function generateRandomString(length: number): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((v) => charset[v % charset.length])
    .join("");
}

/** SHA-256 hash of a string → Uint8Array */
async function sha256(plain: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/** Base64-URL encode a Uint8Array */
function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Spotify authorization URL using PKCE.
 * Stores the code verifier in sessionStorage for later exchange.
 */
export async function buildSpotifyAuthUrl(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error(
      "Spotify is not configured. Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID and NEXT_PUBLIC_SPOTIFY_REDIRECT_URI.",
    );
  }

  const verifier = generateRandomString(128);
  const challenge = base64urlEncode(await sha256(verifier));
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);

  const scopes = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-modify-playback-state",
    "user-read-playback-state",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: scopes,
    show_dialog: "true",
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Exchange the authorization code for tokens (called from /callback page) */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY);

  if (!clientId || !redirectUri || !verifier) {
    throw new Error("Missing Spotify config or code verifier — cannot exchange code.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  saveTokens(data.access_token, data.refresh_token, data.expires_in);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
}

/** Refresh the access token using the stored refresh token */
export async function refreshAccessToken(): Promise<string | null> {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!clientId || !refreshToken) return null;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  saveTokens(
    data.access_token,
    data.refresh_token ?? refreshToken,
    data.expires_in,
  );
  return data.access_token;
}

/** Get a valid access token, refreshing if expired */
export async function getValidAccessToken(): Promise<string | null> {
  const token     = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) ?? 0);

  if (!token) return null;

  // Refresh 60 s before expiry
  if (Date.now() > expiresAt - 60_000) {
    return refreshAccessToken();
  }

  return token;
}

export function isSpotifyConnected(): boolean {
  if (typeof window === "undefined") return false;
  const token     = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) ?? 0);
  // Treat as connected if token exists (we can refresh even if expired)
  return !!token && !!localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
}

// ── Private ──────────────────────────────────────────────────────────────────

function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000));
}
