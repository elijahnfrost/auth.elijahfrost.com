import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { enrollSubdomain } from "@/lib/enroll";
import { isPolicy, PUBLIC_SUBDOMAINS } from "@/lib/scopes";

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

  let result;
  try {
    result = await enrollSubdomain({
      subdomain,
      intent: { kind: "manual", vercelProjectId },
      policy,
      policyOverwrite: true,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "enroll_failed", detail: (e as Error).message }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  if (!result.ok && result.conflict) {
    return new Response(
      JSON.stringify({
        ok: false,
        step: result.conflict.step,
        error: result.conflict.error,
        subdomain: result.subdomain,
        steps: result.steps,
      }),
      { status: 409, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      subdomain: result.subdomain,
      vercelProject: result.vercelProjectName ?? result.vercelProjectId,
      steps: result.steps,
    }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
