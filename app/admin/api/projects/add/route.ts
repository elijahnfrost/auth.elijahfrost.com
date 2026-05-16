import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { savePolicy } from "@/lib/config";
import { isPolicy, PUBLIC_SUBDOMAINS } from "@/lib/scopes";
import { APEX, createVercelCname, findDnsRecordByName } from "@/lib/cloudflare-admin";
import { attachDomainToProject } from "@/lib/vercel";

export const runtime = "edge";

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

interface AddBody {
  subdomain?: unknown;
  vercelProjectId?: unknown;
  policy?: unknown;
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const { subdomain, vercelProjectId, policy } = body;
  if (typeof subdomain !== "string" || subdomain.length > 63 || !SUBDOMAIN_RE.test(subdomain)) {
    return new Response(JSON.stringify({ error: "bad_subdomain" }), { status: 400 });
  }
  if ((PUBLIC_SUBDOMAINS as readonly string[]).includes(subdomain)) {
    return new Response(JSON.stringify({ error: "reserved_subdomain" }), { status: 400 });
  }
  if (typeof vercelProjectId !== "string" || vercelProjectId.length === 0) {
    return new Response(JSON.stringify({ error: "bad_vercel_project" }), { status: 400 });
  }
  if (!isPolicy(policy)) {
    return new Response(JSON.stringify({ error: "bad_policy" }), { status: 400 });
  }

  const fullName = `${subdomain}.${APEX}`;

  // Fail-fast if DNS already exists. Each subsequent step is best-effort: on
  // partial failure we report exactly what completed so the admin can finish
  // by hand rather than have us silently roll back work.
  const existing = await findDnsRecordByName(subdomain);
  if (existing) {
    return new Response(
      JSON.stringify({ error: "dns_exists", detail: `${fullName} already has a DNS record` }),
      { status: 409 },
    );
  }

  let dnsCreated = false;
  let vercelAttached = false;
  let policySet = false;

  try {
    await createVercelCname(subdomain);
    dnsCreated = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "dns_failed", detail: (e as Error).message, dnsCreated, vercelAttached, policySet }),
      { status: 502 },
    );
  }

  try {
    await attachDomainToProject(vercelProjectId, fullName);
    vercelAttached = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "vercel_attach_failed", detail: (e as Error).message, dnsCreated, vercelAttached, policySet }),
      { status: 502 },
    );
  }

  try {
    await savePolicy(subdomain, policy);
    policySet = true;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "kv_policy_failed", detail: (e as Error).message, dnsCreated, vercelAttached, policySet }),
      { status: 502 },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, subdomain, vercelProjectId, policy }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
