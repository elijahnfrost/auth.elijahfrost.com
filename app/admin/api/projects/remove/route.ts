import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { deletePolicy } from "@/lib/config";
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
      JSON.stringify({ error: "vercel_detach_failed", detail: (e as Error).message, vercelDetached, dnsDeleted, policyDeleted }),
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
      JSON.stringify({ error: "dns_delete_failed", detail: (e as Error).message, vercelDetached, dnsDeleted, policyDeleted }),
      { status: 502 },
    );
  }

  // 3. Remove the KV policy entry.
  try {
    await deletePolicy(subdomain);
    policyDeleted = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "kv_policy_delete_failed", detail: (e as Error).message, vercelDetached, dnsDeleted, policyDeleted }),
      { status: 502 },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
