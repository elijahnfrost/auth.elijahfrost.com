import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { loadCodes, saveCodes } from "@/lib/config";
import { isGrantableScope } from "@/lib/scopes";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: { hash?: unknown; scope?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const { hash, scope, label } = body;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    return new Response(JSON.stringify({ error: "bad_hash" }), { status: 400 });
  }

  const { codes } = await loadCodes();
  const existing = codes[hash];
  if (!existing) {
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }

  if (scope !== undefined) {
    if (!isGrantableScope(scope)) {
      return new Response(JSON.stringify({ error: "bad_scope" }), { status: 400 });
    }
    existing.scope = scope;
  }
  if (label !== undefined) {
    if (typeof label !== "string") {
      return new Response(JSON.stringify({ error: "bad_label" }), { status: 400 });
    }
    existing.label = label.length > 0 ? label : undefined;
  }
  codes[hash] = existing;
  await saveCodes(codes);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
