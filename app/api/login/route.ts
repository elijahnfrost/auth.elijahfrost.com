import { NextResponse } from "next/server";
import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, cookieValueFor } from "@/lib/cookie";
import { sanitizeNext } from "@/lib/next-url";

export const runtime = "edge";

export async function POST(req: Request) {
  const shared = process.env.SHARED_PASSWORD;
  if (!shared) {
    return new NextResponse("Server misconfigured: SHARED_PASSWORD unset.", { status: 500 });
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const nextParam = String(form.get("next") ?? "");
  const next = sanitizeNext(nextParam);

  if (password !== shared) {
    const back = new URL("/", req.url);
    back.searchParams.set("error", "1");
    if (nextParam) back.searchParams.set("next", next);
    return NextResponse.redirect(back, { status: 303 });
  }

  const value = await cookieValueFor(shared);
  const res = NextResponse.redirect(next, { status: 303 });
  res.cookies.set({
    name: COOKIE_NAME,
    value,
    domain: ".elijahfrost.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
