// Debug endpoint: list active `removed:<sub>` tombstones with remaining TTLs.
// Useful for diagnosing why a webhook auto-enrollment got skipped.

import { isAdmin, notAdminResponse } from "@/lib/admin-auth";
import { listTombstones } from "@/lib/config";

export const runtime = "edge";

export async function GET() {
  if (!(await isAdmin())) return notAdminResponse();
  try {
    const tombstones = await listTombstones();
    return new Response(JSON.stringify({ tombstones }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "list_failed", detail: (e as Error).message }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
}
