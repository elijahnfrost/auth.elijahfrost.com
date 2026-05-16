import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { findProjectIdForDomain, listProjects } from "@/lib/vercel";
import { APEX, listVercelSubdomains } from "@/lib/cloudflare-admin";
import { loadPolicy } from "@/lib/config";

export const runtime = "edge";

export interface ProjectRow {
  subdomain: string;
  fullName: string;
  dnsRecordId: string;
  dnsTarget: string;
  vercelProjectId: string | null;
  vercelProjectName: string | null;
  policy: string;
}

export async function GET() {
  if (!(await isAdmin())) return notAdminResponse();

  const [records, projects] = await Promise.all([listVercelSubdomains(), listProjects()]);
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ProjectRow[] = await Promise.all(
    records.map(async (r) => {
      const subdomain = r.name.replace(new RegExp(`\\.${APEX.replace(/\./g, "\\.")}$`), "");
      const [projectId, policy] = await Promise.all([
        findProjectIdForDomain(r.name),
        loadPolicy(subdomain),
      ]);
      return {
        subdomain,
        fullName: r.name,
        dnsRecordId: r.id,
        dnsTarget: r.content,
        vercelProjectId: projectId,
        vercelProjectName: projectId ? (projectsById.get(projectId) ?? null) : null,
        policy,
      };
    }),
  );

  rows.sort((a, b) => a.subdomain.localeCompare(b.subdomain));

  return new Response(JSON.stringify({ rows }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
