import { NextResponse } from "next/server";
import {
  COOKIE_MAX_AGE_SECONDS,
  COOKIE_NAME,
  COOKIE_SCOPE_NAME,
  constantTimeEqualHex,
  sha256Hex,
} from "@/lib/cookie";
import { sanitizeNext } from "@/lib/next-url";
import { loadCodes } from "@/lib/config";
import type { GrantableScope } from "@/lib/scopes";

export const runtime = "edge";

export async function POST(req: Request) {
  const form = await req.formData();
  const submitted = String(form.get("password") ?? "");
  const nextParam = String(form.get("next") ?? "");
  const next = sanitizeNext(nextParam);

  const submittedHash = await sha256Hex(submitted);
  const { codes } = await loadCodes();

  // Walk every entry; do not short-circuit so timing reveals nothing about
  // which slot (if any) matched.
  let matched: GrantableScope | null = null;
  for (const [hash, entry] of Object.entries(codes)) {
    if (constantTimeEqualHex(submittedHash, hash)) matched = entry.scope;
  }

  if (!matched) {
    const back = new URL("/", req.url);
    back.searchParams.set("error", "1");
    if (nextParam) back.searchParams.set("next", next);
    return NextResponse.redirect(back, { status: 303 });
  }

  // Cookie value is the hash of whichever password the visitor used. The
  // Worker looks the cookie up in the codes map to determine effective scope.
  // Bounce through /signing-in so the visitor sees a brief confirmation of
  // which scope they signed in as before being handed off to the destination.
  const handoff = new URL("/signing-in", req.url);
  handoff.searchParams.set("next", next);
  const res = NextResponse.redirect(handoff, { status: 303 });
  res.cookies.set({
    name: COOKIE_NAME,
    value: submittedHash,
    domain: ".elijahfrost.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  // Advisory: lets frontends flip read-only UI without a server round-trip.
  // Real enforcement lives at the edge.
  res.cookies.set({
    name: COOKIE_SCOPE_NAME,
    value: matched,
    domain: ".elijahfrost.com",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
