// Vercel webhook endpoint. Vercel emits events when domains are attached to
// projects in the team; we use those to auto-enroll <sub>.elijahfrost.com
// into the auth gate (DNS create + KV policy = "gated") without the admin
// having to open /admin manually.
//
// Verification: Vercel signs the raw request body with HMAC-SHA1 using the
// per-webhook secret and sends the hex digest in `x-vercel-signature`. We
// compute the same digest with VERCEL_WEBHOOK_SECRET and constant-time
// compare before parsing JSON.
//
// Event filtering: Vercel emits many event types; rather than hard-coding
// against schema drift, we recursively walk the parsed body looking for any
// string that matches `<label>.elijahfrost.com`, then enroll those.
//
// Idempotency: enrollSubdomain handles all three cases (DNS present,
// vercel-pointing, missing) without overwriting an existing KV policy.
// Always returns 200 OK so Vercel doesn't retry partials.

import { enrollSubdomain } from "@/lib/enroll";
import { APEX } from "@/lib/cloudflare-admin";
import { readTombstone } from "@/lib/config";

export const runtime = "edge";

const SIGNATURE_HEADER = "x-vercel-signature";
const ELIJAHFROST_DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.elijahfrost\.com$/;
// Domains we never auto-enroll. apex + the two reserved subdomains.
const RESERVED = new Set<string>([APEX, "www." + APEX, "auth." + APEX]);

async function hmacSha1Hex(secret: string, body: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, body);
  const bytes = new Uint8Array(sig);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function collectDomains(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (ELIJAHFROST_DOMAIN_RE.test(v)) out.add(v);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDomains(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectDomains(v, out);
    }
  }
}

function collectEventTypes(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const types = new Set<string>();
  if (typeof obj.type === "string") types.add(obj.type);
  if (Array.isArray(obj.events)) {
    for (const e of obj.events) {
      if (e && typeof e === "object" && typeof (e as { type?: unknown }).type === "string") {
        types.add((e as { type: string }).type);
      }
    }
  }
  return Array.from(types);
}

interface EnrolledLog {
  subdomain: string;
  dns: string;
  vercel: string;
  kv: string;
  previous?: string;
}

interface TombstonedLog {
  subdomain: string;
  status: "tombstoned";
  reason: string;
}

type SkippedLog = EnrolledLog | TombstonedLog;

export async function POST(req: Request) {
  // Fail closed on any unauthenticated request. Missing secret on the server
  // is also treated as "cannot verify" -> 401 so external callers can't
  // distinguish that case from a normal signature mismatch.
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  const sigHeader = req.headers.get(SIGNATURE_HEADER);
  if (!secret || !sigHeader) {
    if (!secret) console.warn("[webhooks/vercel] missing VERCEL_WEBHOOK_SECRET");
    if (!sigHeader) console.warn("[webhooks/vercel] missing signature header");
    return new Response("invalid signature", { status: 401 });
  }

  const raw = await req.arrayBuffer();
  const expected = await hmacSha1Hex(secret, raw);
  if (!constantTimeEqual(sigHeader.trim().toLowerCase(), expected)) {
    console.warn("[webhooks/vercel] signature mismatch");
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    console.warn("[webhooks/vercel] bad json:", (e as Error).message);
    return new Response(JSON.stringify({ ok: true, enrolled: [], skipped: [], errors: ["bad_json"] }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const eventTypes = collectEventTypes(payload);
  const all = new Set<string>();
  collectDomains(payload, all);

  // Strip reserved domains and reduce to the bare subdomain label list.
  const candidates: string[] = [];
  for (const fullName of all) {
    if (RESERVED.has(fullName)) continue;
    const sub = fullName.slice(0, -("." + APEX).length);
    if (!sub) continue;
    candidates.push(sub);
  }

  const enrolled: EnrolledLog[] = [];
  const skipped: SkippedLog[] = [];
  const errors: Array<{ subdomain: string; error: string; step?: string }> = [];

  for (const sub of candidates) {
    try {
      // Tombstone check: if admin Remove recently deleted this subdomain we
      // refuse to re-enroll it for the TTL window, so a late-arriving
      // `project.domain.deleted` (or a Vercel retry) can't resurrect it.
      const tomb = await readTombstone(sub);
      if (tomb) {
        skipped.push({
          subdomain: sub,
          status: "tombstoned",
          reason: "recently removed",
        });
        continue;
      }

      const result = await enrollSubdomain({
        subdomain: sub,
        intent: { kind: "webhook" },
        policy: "gated",
        policyOverwrite: false,
      });
      const entry: EnrolledLog = {
        subdomain: sub,
        dns: result.steps.dns.status,
        vercel: result.steps.vercel.status,
        kv: result.steps.kv.status,
        previous: result.steps.kv.previous,
      };
      if (!result.ok && result.conflict) {
        errors.push({
          subdomain: sub,
          step: result.conflict.step,
          error: result.conflict.error,
        });
      } else if (
        result.steps.dns.status === "created" ||
        result.steps.kv.status === "created"
      ) {
        enrolled.push(entry);
      } else {
        skipped.push(entry);
      }
    } catch (e) {
      errors.push({ subdomain: sub, error: (e as Error).message });
    }
  }

  console.log(
    "[webhooks/vercel]",
    JSON.stringify({
      eventTypes,
      candidates,
      enrolled,
      skipped,
      errors,
    }),
  );

  return new Response(
    JSON.stringify({ ok: true, enrolled, skipped, errors }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
