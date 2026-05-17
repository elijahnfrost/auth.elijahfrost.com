// POST /api/logout-soft — clears the auth cookies but preserves ?next= on
// the redirect, so the visitor lands back on / with the same destination
// to satisfy after re-authenticating. Used by the "Sign in with a <higher>
// code" CTA when a signed-in user lacks scope for the destination.

import { NextResponse } from "next/server";
import { COOKIE_NAME, COOKIE_SCOPE_NAME } from "@/lib/cookie";
import { sanitizeNext } from "@/lib/next-url";

export const runtime = "edge";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const nextRaw = url.searchParams.get("next");

  const target = new URL("/", req.url);
  if (nextRaw) {
    // sanitizeNext rejects off-site URLs; if it returns the fallback we
    // simply don't preserve next at all.
    const sanitized = sanitizeNext(nextRaw);
    if (sanitized !== "https://elijahfrost.com") {
      target.searchParams.set("next", sanitized);
    }
  }

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
