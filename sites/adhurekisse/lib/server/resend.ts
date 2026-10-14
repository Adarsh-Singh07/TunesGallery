// ─────────────────────────────────────────────────────────────────────────────
// Server-only Resend (https://resend.com) email delivery.
//
// The Resend API key and From address come from environment and never reach
// the browser. Only short, one-shot verification emails are sent here.
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM = process.env.RESEND_FROM ?? "";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isResendConfigured(): boolean {
  return RESEND_API_KEY.startsWith("re_") && RESEND_FROM.includes("@");
}

/** Build a plain, link-free email body. No tracking, no external assets. */
function verificationHtml(code: string, brandName: string, minutes: number): string {
  const rule: Record<string, string> = { "·": "&middot;" };
  const brand = String(brandName).replace(/[&<>"]/g, (ch) => (rule[ch] ?? ch));
  return [
    '<!doctype html><html><body style="margin:0;background:#0b0a0f;color:#f5ead8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a0f;padding:40px 16px;">',
    '<tr><td align="center"><table role="presentation" width="440" cellpadding="0" cellspacing="0" style="width:100%;max-width:440px;background:#16131c;border:1px solid #2a2433;border-radius:14px;padding:32px;">',
    `<tr><td style="font-size:12px;letter-spacing:.2em;color:#9c7b7b;text-transform:uppercase;">${brand}</td></tr>`,
    '<tr><td style="padding-top:18px;font-size:17px;line-height:1.5;color:#f5ead8;">Your verification code</td></tr>',
    `<tr><td style="padding:20px 0;"><div style="font-size:34px;letter-spacing:.35em;color:#c4736a;">${code}</div></td></tr>`,
    `<tr><td style="font-size:13px;line-height:1.6;color:#9c7b7b;">Enter this code to verify your account. It expires in ${minutes} minutes. If you didn’t request it, you can safely ignore this email.</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join("");
}

/**
 * Send a verification code via Resend. Returns true only when Resend accepted
 * the message. Failures are logged without the code value and reported to the
 * caller so they can surface a safe, non-enumerable error.
 */
export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  brandName: string,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const minutes = 15;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject: `Your ${brandName} verification code`,
      html: verificationHtml(code, brandName, minutes),
      raw: {
        to,
        subject: `Your ${brandName} verification code`,
        text: `Your ${brandName} verification code is ${code}.\nIt expires in ${minutes} minutes. If you didn't request it, ignore this email.`,
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    // Never log the code or the recipient's full address in production.
    console.error("resend:verification-failed", response.status, detail);
    return false;
  }
  return true;
}
