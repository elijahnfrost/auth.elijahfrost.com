import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { loadCodes, saveCodes } from "@/lib/config";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAdminResponse();

  let body: { hash?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const { hash } = body;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    return new Response(JSON.stringify({ error: "bad_hash" }), { status: 400 });
  }

  const { codes } = await loadCodes();
  if (!codes[hash]) {
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }
  delete codes[hash];
  await saveCodes(codes);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
