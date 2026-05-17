import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { deletePolicy, writeTombstone } from "@/lib/config";
import { PUBLIC_SUBDOMAINS } from "@/lib/scopes";
import {
  APEX,
  deleteDnsRecord,
  findDnsRecordByName,
} from "@/lib/cloudflare-admin";
import { detachDomainFromProject, findProjectIdForDomain } from "@/lib/vercel";

export const runtime = "edge";

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: { subdomain?: unknown };
  try {
    body = (await req.json()) as { subdomain?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }
  const { subdomain } = body;
  if (typeof subdomain !== "string" || subdomain.length > 63 || !SUBDOMAIN_RE.test(subdomain)) {
    return new Response(JSON.stringify({ error: "bad_subdomain" }), { status: 400 });
  }
  if ((PUBLIC_SUBDOMAINS as readonly string[]).includes(subdomain)) {
    return new Response(JSON.stringify({ error: "reserved_subdomain" }), { status: 400 });
  }

  const fullName = `${subdomain}.${APEX}`;

  // Tombstone FIRST, before Vercel detach. Detaching a domain in Vercel
  // queues a project.domain.deleted webhook delivery; if we wrote the
  // tombstone last, the webhook handler could see Vercel detached + DNS
  // already deleted (CF replicas vary) and re-enroll the row before our
  // tombstone landed. Writing first closes that window.
  //
  // Partial failures: a tombstone-then-failed-delete leaves the row visible
  // in the admin list (DNS/KV still there) but blocks webhook auto-
  // enrollment for ~5min. Admin Add always deletes the tombstone up front,
  // so the user can recover at any time.
  let tombstoned = false;
  try {
    await writeTombstone(subdomain, "admin-remove");
    tombstoned = true;
  } catch {
    // Non-fatal: the deletes are still the source of truth. We surface
    // tombstoned:false so the caller knows the webhook race is open.
  }

  let vercelDetached = false;
  let dnsDeleted = false;
  let policyDeleted = false;

  // 1. Detach domain from whichever Vercel project owns it (idempotent).
  try {
    const projectId = await findProjectIdForDomain(fullName);
    if (projectId) {
      await detachDomainFromProject(projectId, fullName);
    }
    vercelDetached = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "vercel_detach_failed", detail: (e as Error).message, tombstoned, vercelDetached, dnsDeleted, policyDeleted }),
      { status: 502 },
    );
  }

  // 2. Delete the DNS record.
  try {
    const rec = await findDnsRecordByName(subdomain);
    if (rec) await deleteDnsRecord(rec.id);
    dnsDeleted = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "dns_delete_failed", detail: (e as Error).message, tombstoned, vercelDetached, dnsDeleted, policyDeleted }),
      { status: 502 },
    );
  }

  // 3. Remove the KV policy entry.
  try {
    await deletePolicy(subdomain);
    policyDeleted = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "kv_policy_delete_failed", detail: (e as Error).message, tombstoned, vercelDetached, dnsDeleted, policyDeleted }),
      { status: 502 },
    );
  }

  return new Response(JSON.stringify({ ok: true, tombstoned }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
