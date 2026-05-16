import { NextResponse } from "next/server";
import { COOKIE_NAME, COOKIE_SCOPE_NAME } from "@/lib/cookie";

export const runtime = "edge";

// POST /api/logout — clear ef_auth (HttpOnly) and ef_scope (advisory). Same
// Domain/Path/Secure attributes as set on login so the Set-Cookie targets
// the same exact cookie. 303 to / so the browser arrives at the now-signed-
// out root page.
export async function POST(req: Request) {
  const target = new URL("/", req.url);
  const res = NextResponse.redirect(target, { status: 303 });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    domain: ".elijahfrost.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });
  res.cookies.set({
    name: COOKIE_SCOPE_NAME,
    value: "",
    domain: ".elijahfrost.com",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
