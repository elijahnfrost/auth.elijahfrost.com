import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/cookie";
import { scopeForCookieValue } from "@/lib/config";
import { sanitizeNext } from "@/lib/next-url";

type SearchParams = Promise<{ next?: string }>;

export const runtime = "edge";
export const dynamic = "force-dynamic";

const APEX = "elijahfrost.com";
const FALLBACK_URL = "https://elijahfrost.com";
const REDIRECT_DELAY_MS = 1200;

function destinationLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host;
  } catch {
    return APEX;
  }
}

export default async function SigningInPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rawNext = sp.next;
  const next = sanitizeNext(rawNext);
  const hasNext = !!rawNext && next !== FALLBACK_URL;

  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  const scope = await scopeForCookieValue(cookie?.value);

  // Direct hits without a valid cookie: bounce back to the form.
  if (scope === "none") {
    const back = hasNext ? `/?next=${encodeURIComponent(next)}` : "/";
    redirect(back);
  }

  const destination = hasNext ? destinationLabel(next) : APEX;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.5rem",
      }}
    >
      {/* No-JS fallback; meta-refresh seconds must be whole. */}
      <meta
        httpEquiv="refresh"
        content={`${Math.ceil(REDIRECT_DELAY_MS / 1000)};url=${next}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){window.location.replace(${JSON.stringify(next)});}, ${REDIRECT_DELAY_MS});`,
        }}
      />
      <div style={{ width: "100%", maxWidth: 380 }}>
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
          One moment
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
          Signing in
        </h1>
        <p
          style={{
            marginTop: "1rem",
            fontSize: 11,
            letterSpacing: "var(--tracking-display-eyebrow)",
            textTransform: "uppercase",
            color: "var(--color-fg-muted)",
          }}
        >
          {APEX}
        </p>

        <p
          aria-live="polite"
          style={{
            marginTop: "2rem",
            fontSize: "0.95rem",
            color: "var(--color-fg)",
          }}
        >
          Signed in as <strong>{scope}</strong>. Redirecting to{" "}
          <strong>{destination}</strong> now…
        </p>

        <noscript>
          <p style={{ marginTop: "1rem", fontSize: 12, color: "var(--color-fg-muted)" }}>
            If you are not redirected,{" "}
            <a href={next} style={{ color: "var(--color-fg)" }}>
              click here to continue
            </a>
            .
          </p>
        </noscript>
      </div>
    </main>
  );
}
