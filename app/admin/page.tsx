import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/cookie";
import { loadCodes, loadPolicy, scopeForCookieValue } from "@/lib/config";
import { GATED_SUBDOMAINS } from "@/lib/scopes";
import { AdminClient } from "./AdminClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const AUTH_ORIGIN = "https://auth.elijahfrost.com";

export default async function AdminPage() {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  const scope = await scopeForCookieValue(cookie?.value);

  if (scope !== "admin") {
    const next = encodeURIComponent(`${AUTH_ORIGIN}/admin`);
    redirect(`/?next=${next}`);
  }

  const [codesResult, policyEntries] = await Promise.all([
    loadCodes(),
    Promise.all(
      GATED_SUBDOMAINS.map(async (sub) => [sub, await loadPolicy(sub)] as const)
    ),
  ]);

  const policies = Object.fromEntries(policyEntries);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem",
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: "1.25rem",
          color: "var(--color-fg-dim)",
          margin: 0,
          marginBottom: "0.5rem",
        }}
      >
        Behind the curtain
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 300,
          letterSpacing: "var(--tracking-tight)",
          fontSize: "clamp(2rem, 6vw, 2.75rem)",
          lineHeight: 0.95,
          margin: 0,
          color: "var(--color-fg)",
        }}
      >
        Admin
      </h1>
      <p
        style={{
          marginTop: "0.75rem",
          fontSize: 11,
          letterSpacing: "var(--tracking-display-eyebrow)",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
        }}
      >
        auth.elijahfrost.com{codesResult.source === "fallback" ? " · codes from env fallback" : ""}
      </p>

      <AdminClient initialPolicies={policies} initialCodes={codesResult.codes} />
    </main>
  );
}
