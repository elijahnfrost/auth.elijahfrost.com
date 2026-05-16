import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { savePolicy } from "@/lib/config";
import { isPolicy, PUBLIC_SUBDOMAINS } from "@/lib/scopes";

export const runtime = "edge";

// DNS label rule (relaxed): lowercase alnum + hyphen, can't start/end with -.
// We accept any label since the Worker's default policy already protects
// undeclared subdomains; this just catches typos in the admin UI.
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function isProtectedSubdomain(v: string): boolean {
  return (PUBLIC_SUBDOMAINS as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: { subdomain?: unknown; policy?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const { subdomain, policy } = body;
  if (typeof subdomain !== "string" || subdomain.length > 63 || !SUBDOMAIN_RE.test(subdomain)) {
    return new Response(JSON.stringify({ error: "bad_subdomain" }), { status: 400 });
  }
  if (isProtectedSubdomain(subdomain)) {
    // Flipping policy:auth or policy:www to anything other than "public" would
    // break the admin sign-in flow (auth) or the public CV (www). Lock them.
    return new Response(JSON.stringify({ error: "protected_subdomain" }), { status: 400 });
  }
  if (!isPolicy(policy)) {
    return new Response(JSON.stringify({ error: "bad_policy" }), { status: 400 });
  }

  await savePolicy(subdomain, policy);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
