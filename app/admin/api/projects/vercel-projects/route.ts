import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { listProjects } from "@/lib/vercel";

export const runtime = "edge";

export async function GET() {
  if (!(await isAdmin())) return notAdminResponse();
  const projects = await listProjects();
  return new Response(JSON.stringify({ projects }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
