import { cookies } from "next/headers";
import { Button, TextInput } from "@elijahfrost/design-system";
import { COOKIE_NAME } from "@/lib/cookie";
import { loadPolicy, scopeForCookieValue } from "@/lib/config";
import { sanitizeNext } from "@/lib/next-url";
import {
  GrantableScope,
  MinScope,
  SCOPE_DESCRIPTIONS,
  minScopeForPolicy,
  scopeSatisfies,
} from "@/lib/scopes";
import { CancelLink } from "@/components/CancelLink";

type SearchParams = Promise<{ next?: string; error?: string }>;

export const runtime = "edge";
export const dynamic = "force-dynamic";

const APEX = "elijahfrost.com";
const FALLBACK_URL = "https://elijahfrost.com";

function subdomainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === APEX) return null;
    if (host.endsWith("." + APEX)) {
      return host.slice(0, -("." + APEX).length);
    }
  } catch {
    // fall through
  }
  return null;
}

export default async function RootPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rawNext = sp.next;
  const next = sanitizeNext(rawNext);
  const hasNext = !!rawNext && next !== FALLBACK_URL;
  const error = sp.error === "1";

  const destSub = hasNext ? subdomainFromUrl(next) : null;

  let requiredScope: MinScope = "read";
  if (destSub) {
    const policy = await loadPolicy(destSub);
    requiredScope = minScopeForPolicy(policy);
  }

  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  const scope = await scopeForCookieValue(cookie?.value);
  const isAuthed = scope !== "none";
  const satisfies = isAuthed && scopeSatisfies(scope, requiredScope);

  let eyebrow: string;
  let headline: string;
  if (isAuthed && hasNext && !satisfies) {
    eyebrow = "Not quite";
    headline = "Higher access required";
  } else if (isAuthed) {
    eyebrow = "You're in";
    headline = "Signed in";
  } else {
    eyebrow = "Welcome back";
    headline = "Sign in";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.5rem",
      }}
    >
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
          {eyebrow}
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
          {headline}
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

        {!isAuthed ? (
          <SignedOutPanel
            next={next}
            rawNext={hasNext ? next : ""}
            error={error}
            destSub={destSub}
            requiredScope={requiredScope}
          />
        ) : !satisfies && hasNext && destSub ? (
          <ScopeMismatchPanel
            scope={scope as GrantableScope}
            destSub={destSub}
            requiredScope={requiredScope}
            next={next}
          />
        ) : (
          <SignedInPanel
            scope={scope as GrantableScope}
            next={hasNext ? next : null}
            destSub={destSub}
          />
        )}
      </div>
    </main>
  );
}

const requirementHeadlineStyle = {
  marginTop: "1.5rem",
  fontSize: "0.95rem",
  color: "var(--color-fg)",
  margin: 0,
} as const;

const requirementSubtextStyle = {
  marginTop: "0.35rem",
  fontSize: 12,
  color: "var(--color-fg-muted)",
  lineHeight: 1.4,
} as const;

const primaryActionStyle = {
  display: "block",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "0.75rem 1rem",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  background: "var(--color-fg)",
  color: "var(--color-bg-page)",
  borderRadius: 0,
  border: "none",
  cursor: "pointer",
  width: "100%",
};

const secondaryActionStyle = {
  display: "block",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "0.625rem 1rem",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  letterSpacing: "var(--tracking-display-eyebrow)",
  textTransform: "uppercase" as const,
  color: "var(--color-fg-muted)",
  border: "1px solid var(--color-border)",
  borderRadius: 0,
  background: "transparent",
  cursor: "pointer",
  width: "100%",
};

const tertiaryLinkStyle = {
  display: "block",
  marginTop: "0.25rem",
  textAlign: "center" as const,
  fontSize: 12,
  color: "var(--color-fg-muted)",
  textDecoration: "underline",
  cursor: "pointer",
};

function SignedOutPanel({
  next,
  rawNext,
  error,
  destSub,
  requiredScope,
}: {
  next: string;
  rawNext: string;
  error: boolean;
  destSub: string | null;
  requiredScope: MinScope;
}) {
  return (
    <>
      {destSub ? (
        <p style={requirementHeadlineStyle}>
          <strong>{destSub}.elijahfrost.com</strong> requires a{" "}
          <strong>{requiredScope}</strong> code.
        </p>
      ) : null}
      <form
        method="post"
        action="/api/login"
        style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <input type="hidden" name="next" value={next} />

        <div className="ds-field">
          <label className="ds-field__label" htmlFor="password">
            Password
          </label>
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            invalid={error}
          />
          {error ? (
            <p className="ds-field__error" role="alert">
              Incorrect password. Try again.
            </p>
          ) : null}
        </div>

        <Button type="submit" align="start" block>
          Sign in
        </Button>
      </form>

      <a
        href="/admin"
        style={{
          display: "block",
          marginTop: "1rem",
          textDecoration: "none",
          textAlign: "center",
          padding: "0.625rem 1rem",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          letterSpacing: "var(--tracking-display-eyebrow)",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
          border: "1px solid var(--color-border)",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        Administrator sign in
      </a>

      {rawNext ? <CancelLink style={{ ...tertiaryLinkStyle, marginTop: "1rem" }} /> : null}
    </>
  );
}

function SignedInPanel({
  scope,
  next,
  destSub,
}: {
  scope: GrantableScope;
  next: string | null;
  destSub: string | null;
}) {
  const isAdmin = scope === "admin";
  return (
    <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <p
          style={{
            fontSize: "0.95rem",
            color: "var(--color-fg)",
            margin: 0,
          }}
        >
          Signed in as <strong>{scope}</strong>.
        </p>
        <p style={requirementSubtextStyle}>{SCOPE_DESCRIPTIONS[scope]}</p>
      </div>

      {next && destSub ? (
        <a href={next} style={primaryActionStyle}>
          Continue to {destSub}.elijahfrost.com
        </a>
      ) : null}

      {isAdmin ? (
        <a
          href="/admin"
          style={next ? secondaryActionStyle : primaryActionStyle}
        >
          Open admin panel
        </a>
      ) : null}

      <form method="post" action="/api/logout" style={{ margin: 0 }}>
        <button type="submit" style={secondaryActionStyle}>
          Sign out
        </button>
      </form>

      {next ? <CancelLink style={{ ...tertiaryLinkStyle, marginTop: "0.25rem" }} /> : null}
    </div>
  );
}

function ScopeMismatchPanel({
  scope,
  destSub,
  requiredScope,
  next,
}: {
  scope: GrantableScope;
  destSub: string;
  requiredScope: MinScope;
  next: string;
}) {
  const logoutSoftAction = `/api/logout-soft?next=${encodeURIComponent(next)}`;
  return (
    <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <p
          style={{
            fontSize: "0.95rem",
            color: "var(--color-fg)",
            margin: 0,
          }}
        >
          You are signed in as <strong>{scope}</strong>.{" "}
          <strong>{destSub}.elijahfrost.com</strong> requires a{" "}
          <strong>{requiredScope}</strong> code.
        </p>
      </div>

      <form method="post" action={logoutSoftAction} style={{ margin: 0 }}>
        <button type="submit" style={primaryActionStyle}>
          Sign in with a {requiredScope} code
        </button>
      </form>

      <CancelLink style={{ ...tertiaryLinkStyle, marginTop: 0 }} />

      <form method="post" action="/api/logout" style={{ margin: 0, marginTop: "0.5rem" }}>
        <button
          type="submit"
          style={{
            ...tertiaryLinkStyle,
            background: "transparent",
            border: "none",
            font: "inherit",
            fontSize: 12,
            color: "var(--color-fg-muted)",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            width: "100%",
          }}
        >
          Or sign out completely
        </button>
      </form>
    </div>
  );
}
