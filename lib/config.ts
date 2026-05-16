// High-level config accessors. KV is the sole source of truth.
//
// Failure to read the codes map is propagated as ConfigUnavailableError so
// callers can decide whether to 503 (gated traffic) or surface a softer
// error (login form). There is no env-var fallback; the Worker fails closed
// on unavailable config and the Vercel app does the same for any path that
// strictly requires a codes lookup.

import { kvGet, kvPut } from "./kv";
import {
  CodesMap,
  GrantableScope,
  Policy,
  POLICIES,
  isGrantableScope,
  isPolicy,
} from "./scopes";

export class ConfigUnavailableError extends Error {}

function normalizeCodes(raw: unknown): CodesMap {
  if (!raw || typeof raw !== "object") return {};
  const out: CodesMap = {};
  for (const [hash, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) continue;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { scope?: unknown; label?: unknown };
    if (!isGrantableScope(e.scope)) continue;
    out[hash] = {
      scope: e.scope,
      label: typeof e.label === "string" ? e.label : undefined,
    };
  }
  return out;
}

/**
 * Load the codes map from KV. Throws ConfigUnavailableError if KV is
 * unreachable, the `codes` key is missing, or its body is not a JSON object.
 */
export async function loadCodes(): Promise<{ codes: CodesMap }> {
  let raw: string | null;
  try {
    raw = await kvGet("codes");
  } catch (e) {
    throw new ConfigUnavailableError(`kv read failed: ${(e as Error).message}`);
  }
  if (raw == null) throw new ConfigUnavailableError("codes key missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigUnavailableError(`codes JSON parse failed: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ConfigUnavailableError("codes JSON is not an object");
  }
  return { codes: normalizeCodes(parsed) };
}

export async function saveCodes(map: CodesMap): Promise<void> {
  await kvPut("codes", JSON.stringify(map));
}

export async function loadPolicy(subdomain: string): Promise<Policy> {
  try {
    const raw = await kvGet(`policy:${subdomain}`);
    if (raw && isPolicy(raw)) return raw;
  } catch {
    // A missing specific policy is benign; a transient KV error here
    // shouldn't take down /admin rendering.
  }
  return "gated";
}

export async function savePolicy(subdomain: string, policy: Policy): Promise<void> {
  if (!POLICIES.includes(policy)) throw new Error(`invalid policy: ${policy}`);
  await kvPut(`policy:${subdomain}`, policy);
}

/**
 * Look up the scope granted by a cookie value (which is itself a SHA-256 hex
 * digest of the submitted password). Returns "none" on any failure so that
 * a transient KV outage cannot grant access, only deny it.
 */
export async function scopeForCookieValue(cookieValue: string | null | undefined): Promise<GrantableScope | "none"> {
  if (!cookieValue || !/^[0-9a-f]{64}$/.test(cookieValue)) return "none";
  try {
    const { codes } = await loadCodes();
    const entry = codes[cookieValue];
    return entry ? entry.scope : "none";
  } catch {
    return "none";
  }
}
