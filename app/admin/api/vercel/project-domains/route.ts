// Returns the elijahfrost.com domains already attached to a given Vercel
// project. Used by the AddProjectForm to pre-fill the subdomain field after
// the admin picks a Vercel project, so re-adoption of existing bindings is
// one-click instead of requiring the admin to retype the name.

import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { APEX } from "@/lib/cloudflare-admin";

export const runtime = "edge";

interface VercelDomain {
  name: string;
  verified?: boolean;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return new Response(JSON.stringify({ error: "missing_project_id" }), { status: 400 });
  }

  const token = process.env.VERCEL_API_TOKEN;
  const team = process.env.VERCEL_TEAM_ID;
  if (!token || !team) {
    return new Response(JSON.stringify({ error: "missing_env" }), { status: 500 });
  }

  const vercelUrl =
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains` +
    `?teamId=${encodeURIComponent(team)}&limit=100`;
  const res = await fetch(vercelUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return new Response(
      JSON.stringify({ error: "vercel_failed", detail: text, status: res.status }),
      { status: 502 },
    );
  }
  const body = (await res.json()) as {
    domains?: Array<{ name?: unknown; verified?: unknown }>;
  };

  const suffix = "." + APEX;
  const domains: VercelDomain[] = (body.domains ?? [])
    .map((d) => ({
      name: typeof d.name === "string" ? d.name.toLowerCase() : "",
      verified: typeof d.verified === "boolean" ? d.verified : undefined,
    }))
    .filter((d) => d.name.endsWith(suffix) && d.name !== APEX);

  return new Response(JSON.stringify({ domains }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
