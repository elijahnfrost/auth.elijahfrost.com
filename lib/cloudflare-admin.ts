// Cloudflare admin API client. Used by the Projects/Policies admin tabs to
// list and manipulate DNS records and to enumerate the subdomains under
// elijahfrost.com.
//
// Distinct from lib/kv.ts: that file uses CLOUDFLARE_KV_API_TOKEN, narrowly
// scoped to KV reads. This one uses CLOUDFLARE_ADMIN_API_TOKEN, scoped to:
//   - Account -> Workers KV Storage -> Edit (for KV list)
//   - Zone -> DNS -> Edit (for DNS records)
//   - Zone -> Workers Routes -> Edit (kept open for future automation)

const API_BASE = "https://api.cloudflare.com/client/v4";
export const APEX = "elijahfrost.com";
export const VERCEL_CNAME_TARGETS = new Set(["cname.vercel-dns.com"]);

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function adminAuth(): Record<string, string> {
  return { Authorization: `Bearer ${envOrThrow("CLOUDFLARE_ADMIN_API_TOKEN")}` };
}

async function getZoneId(): Promise<string> {
  const res = await fetch(`${API_BASE}/zones?name=${encodeURIComponent(APEX)}`, {
    headers: adminAuth(),
    cache: "no-store",
  });
  const json = (await res.json()) as { success: boolean; result: Array<{ id: string }> };
  if (!res.ok || !json.success || !json.result?.[0]?.id) {
    throw new Error(`zone lookup failed for ${APEX}`);
  }
  return json.result[0].id;
}

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
}

/**
 * List all DNS records for elijahfrost.com that look like Vercel-attached
 * subdomains (CNAME -> *.vercel-dns.com). Returns one entry per subdomain.
 */
export async function listVercelSubdomains(): Promise<DnsRecord[]> {
  const zoneId = await getZoneId();
  // Cloudflare paginates; ask for the max page size. This zone is tiny so
  // one page is plenty, but the loop is here for safety.
  const records: DnsRecord[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${API_BASE}/zones/${zoneId}/dns_records?type=CNAME&per_page=100&page=${page}`,
      { headers: adminAuth(), cache: "no-store" },
    );
    const json = (await res.json()) as {
      success: boolean;
      result: DnsRecord[];
      result_info?: { total_pages?: number };
    };
    if (!res.ok || !json.success) throw new Error(`dns list failed (page ${page})`);
    for (const r of json.result) {
      const suffix = "." + APEX;
      if (!r.name.endsWith(suffix)) continue;
      if (r.name === APEX) continue;
      if (!VERCEL_CNAME_TARGETS.has(r.content) && !r.content.endsWith(".vercel-dns.com")) continue;
      records.push(r);
    }
    const totalPages = json.result_info?.total_pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }
  return records;
}

/**
 * Create a Vercel-pointing CNAME for <subdomain>.elijahfrost.com. Throws if
 * a record with that name already exists (Cloudflare returns 81053/81057);
 * the caller surfaces this to the UI rather than silently overwriting.
 */
export async function createVercelCname(subdomain: string): Promise<DnsRecord> {
  const zoneId = await getZoneId();
  const fullName = `${subdomain}.${APEX}`;
  const res = await fetch(`${API_BASE}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: { ...adminAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "CNAME",
      name: fullName,
      content: "cname.vercel-dns.com",
      proxied: true,
      ttl: 1,
      comment: "ef-auth Projects tab",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    success: boolean;
    result: DnsRecord;
    errors?: Array<{ code: number; message: string }>;
  };
  if (!res.ok || !json.success) {
    const err = json.errors?.[0];
    throw new Error(`dns create failed: ${err?.message ?? res.statusText}`);
  }
  return json.result;
}

export async function deleteDnsRecord(recordId: string): Promise<void> {
  const zoneId = await getZoneId();
  const res = await fetch(`${API_BASE}/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
    headers: adminAuth(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`dns delete failed: ${res.status}`);
}

export async function findDnsRecordByName(subdomain: string): Promise<DnsRecord | null> {
  const zoneId = await getZoneId();
  const fullName = `${subdomain}.${APEX}`;
  const res = await fetch(
    `${API_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(fullName)}`,
    { headers: adminAuth(), cache: "no-store" },
  );
  const json = (await res.json()) as { success: boolean; result: DnsRecord[] };
  if (!res.ok || !json.success) throw new Error("dns lookup failed");
  return json.result[0] ?? null;
}
