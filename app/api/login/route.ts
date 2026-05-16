import { NextResponse } from "next/server";
import {
  COOKIE_MAX_AGE_SECONDS,
  COOKIE_NAME,
  constantTimeEqualHex,
  sha256Hex,
} from "@/lib/cookie";
import { sanitizeNext } from "@/lib/next-url";

export const runtime = "edge";

const PASSWORD_ENV_KEYS = [
  "SHARED_PASSWORD_EASY",
  "SHARED_PASSWORD_STRONG_1",
  "SHARED_PASSWORD_STRONG_2",
] as const;

function configuredPasswords(): string[] {
  return PASSWORD_ENV_KEYS.map((k) => process.env[k]).filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
}

export async function POST(req: Request) {
  const candidates = configuredPasswords();
  if (candidates.length === 0) {
    return new NextResponse(
      "Server misconfigured: no SHARED_PASSWORD_* env vars set.",
      { status: 500 }
    );
  }

  const form = await req.formData();
  const submitted = String(form.get("password") ?? "");
  const nextParam = String(form.get("next") ?? "");
  const next = sanitizeNext(nextParam);

  const submittedHash = await sha256Hex(submitted);
  const candidateHashes = await Promise.all(candidates.map(sha256Hex));
  // Walk every candidate; do not short-circuit so timing reveals nothing
  // about which slot (if any) matched.
  let matched = false;
  for (const h of candidateHashes) {
    if (constantTimeEqualHex(submittedHash, h)) matched = true;
  }

  if (!matched) {
    const back = new URL("/", req.url);
    back.searchParams.set("error", "1");
    if (nextParam) back.searchParams.set("next", next);
    return NextResponse.redirect(back, { status: 303 });
  }

  // Cookie value is the hash of whichever password the visitor actually used.
  // The Worker accepts the cookie if it matches any of the three configured
  // password hashes, so all three remain interchangeable.
  const res = NextResponse.redirect(next, { status: 303 });
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
  return res;
}
