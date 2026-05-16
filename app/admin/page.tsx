import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/cookie";
import { loadCodes, loadPolicy, scopeForCookieValue } from "@/lib/config";
import { APEX, listVercelSubdomains } from "@/lib/cloudflare-admin";
import { findProjectIdForDomain, listProjects } from "@/lib/vercel";
import { AdminClient, ProjectRow } from "./AdminClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const AUTH_ORIGIN = "https://auth.elijahfrost.com";

async function loadProjectRows(): Promise<{ rows: ProjectRow[] | null; error: string | null }> {
  try {
    const [records, projects] = await Promise.all([listVercelSubdomains(), listProjects()]);
    const projectsById = new Map(projects.map((p) => [p.id, p.name]));
    const rows = await Promise.all(
      records.map(async (r): Promise<ProjectRow> => {
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
    return { rows, error: null };
  } catch (e) {
    return { rows: null, error: (e as Error).message };
  }
}

async function loadVercelProjectsSafe(): Promise<{ projects: { id: string; name: string }[] | null }> {
  try {
    const projects = await listProjects();
    return { projects };
  } catch {
    return { projects: null };
  }
}

export default async function AdminPage() {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  const scope = await scopeForCookieValue(cookie?.value);

  if (scope !== "admin") {
    const next = encodeURIComponent(`${AUTH_ORIGIN}/admin`);
    redirect(`/?next=${next}`);
  }

  const [codesResult, projectsResult, vercelProjectsResult] = await Promise.all([
    loadCodes(),
    loadProjectRows(),
    loadVercelProjectsSafe(),
  ]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem",
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: "1.25rem",
          color: "var(--color-fg-dim)",
          margin: 0,
          marginBottom: "0.5rem",
        }}
      >
        Behind the curtain
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 300,
          letterSpacing: "var(--tracking-tight)",
          fontSize: "clamp(2rem, 6vw, 2.75rem)",
          lineHeight: 0.95,
          margin: 0,
          color: "var(--color-fg)",
        }}
      >
        Admin
      </h1>
      <p
        style={{
          marginTop: "0.75rem",
          fontSize: 11,
          letterSpacing: "var(--tracking-display-eyebrow)",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
        }}
      >
        auth.elijahfrost.com
      </p>

      <AdminClient
        initialProjects={projectsResult.rows}
        projectsError={projectsResult.error}
        initialVercelProjects={vercelProjectsResult.projects}
        initialCodes={codesResult.codes}
      />
    </main>
  );
}
