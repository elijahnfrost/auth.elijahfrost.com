import { cookies } from "next/headers";
import { COOKIE_NAME } from "./cookie";
import { scopeForCookieValue } from "./config";

/**
 * Returns true iff the current request carries a cookie that resolves to
 * "admin" scope under the live codes map. Used by admin API routes to gate
 * mutations. The Worker enforces this at the edge for /admin page traffic;
 * this is the same check for direct API hits.
 */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  return (await scopeForCookieValue(cookie?.value)) === "admin";
}

export function notAdminResponse(): Response {
  return new Response(JSON.stringify({ error: "admin_required" }), {
    status: 403,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
