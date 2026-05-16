import { cookies } from "next/headers";
import { Button, TextInput } from "@elijahfrost/design-system";
import { COOKIE_NAME } from "@/lib/cookie";
import { scopeForCookieValue } from "@/lib/config";
import { sanitizeNext } from "@/lib/next-url";

type SearchParams = Promise<{ next?: string; error?: string }>;

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function RootPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = sanitizeNext(sp.next);
  const error = sp.error === "1";

  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  const scope = await scopeForCookieValue(cookie?.value);
  const isAuthed = scope !== "none";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
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
          {isAuthed ? "You're in" : "Welcome back"}
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
          {isAuthed ? "Signed in" : "Sign in"}
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
          elijahfrost.com
        </p>

        {isAuthed ? (
          <SignedInPanel scope={scope} />
        ) : (
          <SignedOutPanel next={next} error={error} />
        )}
      </div>
    </main>
  );
}

function SignedOutPanel({ next, error }: { next: string; error: boolean }) {
  return (
    <>
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
    </>
  );
}

function SignedInPanel({ scope }: { scope: string }) {
  return (
    <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p
        style={{
          fontSize: "0.95rem",
          color: "var(--color-fg)",
          margin: 0,
        }}
      >
        Signed in as <strong>{scope}</strong>.
      </p>

      <a
        href="/admin"
        style={{
          display: "block",
          textDecoration: "none",
          textAlign: "center",
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          background: "var(--color-fg)",
          color: "var(--color-bg-page)",
          borderRadius: 0,
        }}
      >
        Open admin panel
      </a>

      <form method="post" action="/api/logout" style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            display: "block",
            width: "100%",
            textDecoration: "none",
            textAlign: "center",
            padding: "0.625rem 1rem",
            fontSize: "0.875rem",
            fontFamily: "inherit",
            letterSpacing: "var(--tracking-display-eyebrow)",
            textTransform: "uppercase",
            color: "var(--color-fg-muted)",
            border: "1px solid var(--color-border)",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 0,
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
