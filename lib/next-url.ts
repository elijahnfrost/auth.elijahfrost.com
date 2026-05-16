const APEX = "elijahfrost.com";
const FALLBACK = "https://elijahfrost.com";

/**
 * Return `raw` if it points to elijahfrost.com or a subdomain of it via https.
 * Anything else (other hosts, non-https schemes, malformed URLs, missing param)
 * falls back to the apex to block open-redirect abuse.
 */
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return FALLBACK;
  }
  if (parsed.protocol !== "https:") return FALLBACK;
  const host = parsed.hostname.toLowerCase();
  if (host !== APEX && !host.endsWith("." + APEX)) return FALLBACK;
  return parsed.toString();
}
