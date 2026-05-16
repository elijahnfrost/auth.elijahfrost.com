import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { savePolicy } from "@/lib/config";
import { GATED_SUBDOMAINS, isPolicy } from "@/lib/scopes";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: { subdomain?: unknown; policy?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const { subdomain, policy } = body;
  if (typeof subdomain !== "string" || !(GATED_SUBDOMAINS as readonly string[]).includes(subdomain)) {
    return new Response(JSON.stringify({ error: "bad_subdomain" }), { status: 400 });
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
