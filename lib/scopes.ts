// Shared types for the auth system. Same shape on Vercel and in the Worker;
// kept in sync by hand since the two are separate repos.

export type Scope = "none" | "read" | "write" | "admin";
export type GrantableScope = Exclude<Scope, "none">;
export type Policy = "public" | "public-read" | "gated" | "gated-write" | "locked";

export const SCOPES: GrantableScope[] = ["read", "write", "admin"];
export const POLICIES: Policy[] = ["public", "public-read", "gated", "gated-write", "locked"];

export const SCOPE_RANK: Record<Scope, number> = { none: 0, read: 1, write: 2, admin: 3 };

export function isGrantableScope(v: unknown): v is GrantableScope {
  return v === "read" || v === "write" || v === "admin";
}

export function isPolicy(v: unknown): v is Policy {
  return typeof v === "string" && (POLICIES as string[]).includes(v);
}

// One-line UI descriptions surfaced next to dropdowns. Authoritative copy
// for both the Codes scope picker and the Projects/Policies policy picker.
export const SCOPE_DESCRIPTIONS: Record<GrantableScope, string> = {
  read: "View-only access to gated subdomains.",
  write: "View plus interact, including create/edit/delete actions.",
  admin: "Full access plus this admin panel.",
};

export const POLICY_DESCRIPTIONS: Record<Policy, string> = {
  public: "Anyone can view and interact, no code required.",
  "public-read": "Anyone can view, but interacting requires a write or admin code.",
  gated: "Any valid code is required to view or interact.",
  "gated-write": "A write or admin code is required to view or interact.",
  locked: "Only the admin code grants access.",
};

// Public subdomains we never gate. The Projects tab filters these out of the
// editable policy list since flipping them to gated would lock out everyone,
// including the admin sign-in path.
export const PUBLIC_SUBDOMAINS = ["www", "auth"] as const;
export type PublicSubdomain = (typeof PUBLIC_SUBDOMAINS)[number];

export interface CodeEntry {
  scope: GrantableScope;
  label?: string;
  // Plaintext password. Stored alongside the hashed key so the admin panel
  // can reveal/copy the code on demand. Optional for backward compatibility
  // with Phase-2 codes that pre-date the field; the Phase 3 migration
  // backfills the three pre-existing codes.
  password?: string;
}
export type CodesMap = Record<string, CodeEntry>;
