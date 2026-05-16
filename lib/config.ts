// High-level config accessors. KV is the source of truth; the
// SHARED_PASSWORD_* env vars remain as a safety fallback while we verify
// the new system end-to-end. After verification they can be deleted.

import { kvGet, kvPut } from "./kv";
import {
  CodesMap,
  GrantableScope,
  Policy,
  POLICIES,
  isGrantableScope,
  isPolicy,
} from "./scopes";
import { sha256Hex } from "./cookie";

const FALLBACK_PASSWORD_KEYS = [
  "SHARED_PASSWORD_EASY",
  "SHARED_PASSWORD_STRONG_1",
  "SHARED_PASSWORD_STRONG_2",
] as const;

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

async function fallbackCodes(): Promise<CodesMap> {
  const out: CodesMap = {};
  for (const k of FALLBACK_PASSWORD_KEYS) {
    const v = process.env[k];
    if (typeof v !== "string" || v.length === 0) continue;
    const h = await sha256Hex(v);
    // Env-var passwords match the Worker's fallback behavior: admin scope.
    out[h] = { scope: "admin", label: "env fallback" };
  }
  return out;
}

/**
 * Load the codes map. Returns the KV map if present and non-empty, otherwise
 * derives a map from SHARED_PASSWORD_* env vars (all granted admin) so the
 * system stays usable during the migration window.
 */
export async function loadCodes(): Promise<{ codes: CodesMap; source: "kv" | "fallback" }> {
  try {
    const raw = await kvGet("codes");
    if (raw) {
      const parsed = JSON.parse(raw);
      const map = normalizeCodes(parsed);
      if (Object.keys(map).length > 0) return { codes: map, source: "kv" };
    }
  } catch {
    // fall through
  }
  return { codes: await fallbackCodes(), source: "fallback" };
}

export async function saveCodes(map: CodesMap): Promise<void> {
  await kvPut("codes", JSON.stringify(map));
}

export async function loadPolicy(subdomain: string): Promise<Policy> {
  try {
    const raw = await kvGet(`policy:${subdomain}`);
    if (raw && isPolicy(raw)) return raw;
  } catch {
    // fall through
  }
  return "gated";
}

export async function savePolicy(subdomain: string, policy: Policy): Promise<void> {
  if (!POLICIES.includes(policy)) throw new Error(`invalid policy: ${policy}`);
  await kvPut(`policy:${subdomain}`, policy);
}

/**
 * Look up the scope granted by a cookie value (which is itself a SHA-256 hex
 * digest of the submitted password).
 */
export async function scopeForCookieValue(cookieValue: string | null | undefined): Promise<GrantableScope | "none"> {
  if (!cookieValue || !/^[0-9a-f]{64}$/.test(cookieValue)) return "none";
  const { codes } = await loadCodes();
  const entry = codes[cookieValue];
  return entry ? entry.scope : "none";
}
