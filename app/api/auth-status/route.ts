import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/cookie";
import { scopeForCookieValue } from "@/lib/config";

export const runtime = "edge";

const APEX = "elijahfrost.com";

function corsHeadersFor(origin: string | null): Record<string, string> {
  // Only reflect Origin when it's clearly within our domain. Anything else
  // gets no CORS headers, which means a cross-site fetch with credentials
  // fails on the browser side.
  if (!origin) return {};
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return {};
  }
  if (host !== APEX && !host.endsWith("." + APEX)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export async function GET(req: Request) {
  const origin = req.headers.get("Origin");
  const cors = corsHeadersFor(origin);
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  const scope = await scopeForCookieValue(cookie?.value);

  const body = JSON.stringify({ authed: scope !== "none", scope });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("Origin");
  const cors = corsHeadersFor(origin);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      ...cors,
    },
  });
}
