// Thin Cloudflare KV client for the Vercel app.
//
// The Worker reads KV via its binding; this side has to go through the
// REST API. Both touch the same namespace (id: ef-auth-config).
//
// Required env vars (set in Vercel project settings):
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_KV_NAMESPACE_ID
//   CLOUDFLARE_KV_API_TOKEN          // scoped: Workers KV Storage:Edit

const API_BASE = "https://api.cloudflare.com/client/v4";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function namespaceUrl(key: string): string {
  const account = envOrThrow("CLOUDFLARE_ACCOUNT_ID");
  const ns = envOrThrow("CLOUDFLARE_KV_NAMESPACE_ID");
  return `${API_BASE}/accounts/${account}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${envOrThrow("CLOUDFLARE_KV_API_TOKEN")}` };
}

export async function kvGet(key: string): Promise<string | null> {
  const res = await fetch(namespaceUrl(key), {
    method: "GET",
    headers: authHeader(),
    // KV is the source of truth; never serve stale.
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`kvGet(${key}) failed: ${res.status}`);
  return await res.text();
}

export async function kvPut(
  key: string,
  value: string,
  opts?: { ttlSeconds?: number },
): Promise<void> {
  // CF's single-key PUT accepts `?expiration_ttl=<seconds>` for relative TTL.
  // Minimum supported TTL is 60 seconds (silently rounded by CF otherwise).
  const base = namespaceUrl(key);
  const url = opts?.ttlSeconds && opts.ttlSeconds > 0
    ? `${base}?expiration_ttl=${Math.max(60, Math.floor(opts.ttlSeconds))}`
    : base;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeader(),
      "Content-Type": "text/plain",
    },
    body: value,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`kvPut(${key}) failed: ${res.status}`);
}

export interface KvKeyInfo {
  name: string;
  // Unix seconds when CF will purge the key; undefined if no TTL.
  expiration?: number;
}

/**
 * List keys matching an optional prefix. Used by the tombstone debug endpoint
 * to surface remaining TTLs.
 */
export async function kvListKeys(prefix?: string): Promise<KvKeyInfo[]> {
  const account = envOrThrow("CLOUDFLARE_ACCOUNT_ID");
  const ns = envOrThrow("CLOUDFLARE_KV_NAMESPACE_ID");
  const url = new URL(`${API_BASE}/accounts/${account}/storage/kv/namespaces/${ns}/keys`);
  if (prefix) url.searchParams.set("prefix", prefix);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeader(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`kvListKeys failed: ${res.status}`);
  const body = (await res.json()) as { result?: KvKeyInfo[] };
  return body.result ?? [];
}

export async function kvDelete(key: string): Promise<void> {
  const res = await fetch(namespaceUrl(key), {
    method: "DELETE",
    headers: authHeader(),
    cache: "no-store",
  });
  // 404 means the key is already gone — treat as success for idempotency.
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`kvDelete(${key}) failed: ${res.status}`);
}
