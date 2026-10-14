// Pure email / code validation. No side effects or server-only imports, so it
// is safe to use in both the browser and in unit tests.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

export function isValidCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}
