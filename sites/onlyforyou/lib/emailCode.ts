// Client-side helpers for the Resend-sent email verification flow. These call
// same-origin API routes; the account itself is created by the server (service
// role) so registration rate limits stay authoritative.

async function postJson(url: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: Record<string, unknown> = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

export interface RegisterResult {
  ok: boolean;
  /** Whether the verification code was actually delivered to the inbox. */
  delivered?: boolean;
  error?: string;
}

export async function registerAccount(input: { email: string; password: string; displayName?: string }): Promise<RegisterResult> {
  const { status, body } = await postJson("/api/auth/register", {
    email: input.email,
    password: input.password,
    display_name: input.displayName,
  });
  if (status === 409) return { ok: false, error: "An account already exists for this email. Sign in instead." };
  if (status === 429) return { ok: false, error: "Too many accounts from this address. Please try again later." };
  if (status < 200 || status >= 300) return { ok: false, error: (body.error as string) ?? "Could not create the account. Try again." };
  return { ok: true, delivered: body.delivered !== false };
}

export async function requestEmailCode(email: string): Promise<{ ok: boolean }> {
  const { status, body } = await postJson("/api/auth/email-code", { email });
  return { ok: status >= 200 && status < 300 && body.ok !== false };
}

export async function verifyEmailCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const { status, body } = await postJson("/api/auth/verify-code", { email, code });
  if (status >= 200 && status < 300 && body.ok === true) return { ok: true };
  return { ok: false, error: (body.error as string) ?? "That code is invalid or expired. Request a new one." };
}
