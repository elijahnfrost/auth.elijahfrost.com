import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { loadCodes, saveCodes } from "@/lib/config";
import { sha256Hex } from "@/lib/cookie";
import { isGrantableScope } from "@/lib/scopes";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: { password?: unknown; scope?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const { password, scope, label } = body;
  if (typeof password !== "string" || password.length === 0) {
    return new Response(JSON.stringify({ error: "bad_password" }), { status: 400 });
  }
  if (!isGrantableScope(scope)) {
    return new Response(JSON.stringify({ error: "bad_scope" }), { status: 400 });
  }

  const hash = await sha256Hex(password);
  const { codes } = await loadCodes();
  codes[hash] = {
    scope,
    label: typeof label === "string" && label.length > 0 ? label : undefined,
    password,
  };
  await saveCodes(codes);

  return new Response(JSON.stringify({ ok: true, hash }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
