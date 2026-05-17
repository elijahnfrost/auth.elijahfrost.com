// High-level config accessors. KV is the sole source of truth.
//
// Failure to read the codes map is propagated as ConfigUnavailableError so
// callers can decide whether to 503 (gated traffic) or surface a softer
// error (login form). There is no env-var fallback; the Worker fails closed
// on unavailable config and the Vercel app does the same for any path that
// strictly requires a codes lookup.

import { kvDelete, kvGet, kvListKeys, kvPut } from "./kv";
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
    const e = entry as { scope?: unknown; label?: unknown; password?: unknown };
    if (!isGrantableScope(e.scope)) continue;
    out[hash] = {
      scope: e.scope,
      label: typeof e.label === "string" ? e.label : undefined,
      password: typeof e.password === "string" && e.password.length > 0 ? e.password : undefined,
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

// Per-isolate cache; matches the Worker's 30s cache so the auth page and
// the gate read the same policy value within a hot window. Cache misses
// fall through to KV. A missing or errored read defaults to "gated", which
// is also cached so we don't hammer KV on truly-unconfigured subdomains.
const POLICY_CACHE = new Map<string, { policy: Policy; expiresAt: number }>();
const POLICY_TTL_MS = 30_000;

export async function loadPolicy(subdomain: string): Promise<Policy> {
  const now = Date.now();
  const cached = POLICY_CACHE.get(subdomain);
  if (cached && cached.expiresAt > now) return cached.policy;

  let policy: Policy = "gated";
  try {
    const raw = await kvGet(`policy:${subdomain}`);
    if (raw && isPolicy(raw)) policy = raw;
  } catch {
    // transient KV error or missing key; default already set
  }
  POLICY_CACHE.set(subdomain, { policy, expiresAt: now + POLICY_TTL_MS });
  return policy;
}

export async function savePolicy(subdomain: string, policy: Policy): Promise<void> {
  if (!POLICIES.includes(policy)) throw new Error(`invalid policy: ${policy}`);
  await kvPut(`policy:${subdomain}`, policy);
}

export async function deletePolicy(subdomain: string): Promise<void> {
  await kvDelete(`policy:${subdomain}`);
}

// --- Tombstones --------------------------------------------------------------
//
// When admin Remove finishes deleting a subdomain (Vercel detach, DNS delete,
// KV policy delete), it writes `removed:<sub>` with a 300s TTL. The webhook
// handler checks this before enrolling, so a `project.domain.deleted` event
// arriving moments after Remove cannot resurrect the row.
//
// The TTL is long enough to cover Vercel's webhook retries (a few minutes)
// and short enough that a legitimate manual re-add after that window does
// not need explicit cleanup — though /admin/api/projects/add deletes the
// tombstone up front for instant re-enrollment.

export const TOMBSTONE_TTL_SECONDS = 300;
const TOMBSTONE_PREFIX = "removed:";

export interface Tombstone {
  ts: number;
  source: string;
}

export async function writeTombstone(subdomain: string, source: string): Promise<void> {
  const value: Tombstone = { ts: Date.now(), source };
  await kvPut(`${TOMBSTONE_PREFIX}${subdomain}`, JSON.stringify(value), {
    ttlSeconds: TOMBSTONE_TTL_SECONDS,
  });
}

export async function readTombstone(subdomain: string): Promise<Tombstone | null> {
  let raw: string | null;
  try {
    raw = await kvGet(`${TOMBSTONE_PREFIX}${subdomain}`);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const p = parsed as { ts?: unknown; source?: unknown };
      if (typeof p.ts === "number" && typeof p.source === "string") {
        return { ts: p.ts, source: p.source };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export async function deleteTombstone(subdomain: string): Promise<void> {
  await kvDelete(`${TOMBSTONE_PREFIX}${subdomain}`);
}

export interface TombstoneInfo {
  subdomain: string;
  expiration: number | null;
  remainingSeconds: number | null;
}

export async function listTombstones(): Promise<TombstoneInfo[]> {
  const keys = await kvListKeys(TOMBSTONE_PREFIX);
  const nowSec = Math.floor(Date.now() / 1000);
  return keys
    .map((k) => {
      const sub = k.name.startsWith(TOMBSTONE_PREFIX)
        ? k.name.slice(TOMBSTONE_PREFIX.length)
        : k.name;
      const exp = typeof k.expiration === "number" ? k.expiration : null;
      return {
        subdomain: sub,
        expiration: exp,
        remainingSeconds: exp != null ? Math.max(0, exp - nowSec) : null,
      };
    })
    .sort((a, b) => a.subdomain.localeCompare(b.subdomain));
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
