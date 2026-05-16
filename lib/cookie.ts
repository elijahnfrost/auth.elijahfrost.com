export const COOKIE_NAME = "ef_auth";
// Advisory companion cookie: not HttpOnly so frontends can read it via
// document.cookie to flip UI affordances. All real enforcement is at the
// edge (the Worker), so this cookie carrying "admin" doesn't grant access.
export const COOKIE_SCOPE_NAME = "ef_scope";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Hex SHA-256 digest. Used for both the cookie value and constant-time
 *  candidate comparisons against the three configured passwords. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hex-string compare in constant time. Both inputs come from sha256Hex so
 *  they are always 64 chars; equal length is asserted. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
