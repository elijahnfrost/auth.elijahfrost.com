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

// Subdomains we expose in the admin policy table. Matches the Worker routes.
export const GATED_SUBDOMAINS = [
  "slides",
  "ankislides",
  "projects",
  "careertracker",
  "musclelabeler",
  "pulsetimer",
] as const;
export type GatedSubdomain = (typeof GATED_SUBDOMAINS)[number];

export interface CodeEntry {
  scope: GrantableScope;
  label?: string;
}
export type CodesMap = Record<string, CodeEntry>;
