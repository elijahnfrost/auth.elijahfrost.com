export const COOKIE_NAME = "ef_auth";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Deterministic cookie value: hex SHA-256 of the shared password. */
export async function cookieValueFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
