// Vercel API client. Used by the Projects admin tab to list available
// projects and to attach/detach <subdomain>.elijahfrost.com to a project.
//
// Env vars:
//   VERCEL_API_TOKEN  encrypted; account-level personal token scoped to the team
//   VERCEL_TEAM_ID    plain; visible in the team settings URL

const API_BASE = "https://api.vercel.com";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function teamParam(): string {
  return `teamId=${encodeURIComponent(envOrThrow("VERCEL_TEAM_ID"))}`;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${envOrThrow("VERCEL_API_TOKEN")}` };
}

export interface VercelProject {
  id: string;
  name: string;
}

export interface VercelDomain {
  name: string;
  projectId: string;
}

/**
 * List the team's projects. Returns the full set; the UI shows them in a
 * dropdown so we don't bother paginating — the count is small.
 */
export async function listProjects(): Promise<VercelProject[]> {
  const projects: VercelProject[] = [];
  let next: string | null = null;
  for (;;) {
    const url =
      `${API_BASE}/v9/projects?limit=100&${teamParam()}` +
      (next ? `&until=${encodeURIComponent(next)}` : "");
    const res = await fetch(url, { headers: authHeader(), cache: "no-store" });
    if (!res.ok) throw new Error(`vercel projects list failed: ${res.status}`);
    const json = (await res.json()) as {
      projects: Array<{ id: string; name: string }>;
      pagination?: { next: string | null };
    };
    for (const p of json.projects) projects.push({ id: p.id, name: p.name });
    next = json.pagination?.next ?? null;
    if (!next) break;
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

async function listDomainsForProject(projectId: string): Promise<string[]> {
  const url =
    `${API_BASE}/v9/projects/${encodeURIComponent(projectId)}/domains?${teamParam()}` +
    `&limit=100`;
  const res = await fetch(url, { headers: authHeader(), cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { domains: Array<{ name: string }> };
  return json.domains?.map((d) => d.name) ?? [];
}

/**
 * Build a domain → projectId map by walking each project's domain list in
 * parallel. Called once by the admin loader so per-row lookups are O(1).
 *
 * Vercel's v10 /domains/<name> endpoint returns parent-domain info (the
 * apex), not the per-subdomain binding, which is why we materialize the
 * full map here rather than per-row.
 */
export async function buildDomainToProjectMap(): Promise<Map<string, string>> {
  const projects = await listProjects();
  const entries = await Promise.all(
    projects.map(async (p): Promise<Array<[string, string]>> => {
      const names = await listDomainsForProject(p.id);
      return names.map((name) => [name, p.id]);
    }),
  );
  return new Map(entries.flat());
}

/**
 * Find which Vercel project currently owns <domain>. Returns null if the
 * domain isn't attached to any project on this team. One-off helper used
 * by the project-remove endpoint; callers issuing many lookups should
 * build the full map via buildDomainToProjectMap() instead.
 */
export async function findProjectIdForDomain(domain: string): Promise<string | null> {
  const map = await buildDomainToProjectMap();
  return map.get(domain) ?? null;
}

export async function attachDomainToProject(projectId: string, name: string): Promise<void> {
  const url = `${API_BASE}/v10/projects/${encodeURIComponent(projectId)}/domains?${teamParam()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vercel attach failed: ${res.status} ${text}`);
  }
}

export async function detachDomainFromProject(projectId: string, name: string): Promise<void> {
  const url = `${API_BASE}/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(name)}?${teamParam()}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeader(),
    cache: "no-store",
  });
  // 404 means the binding is already gone — treat as success for idempotency.
  if (res.status === 404) return;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vercel detach failed: ${res.status} ${text}`);
  }
}
