import { Button, TextInput } from "@elijahfrost/design-system";
import { sanitizeNext } from "@/lib/next-url";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = sanitizeNext(sp.next);
  const error = sp.error === "1";

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
          Welcome back
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
          Sign in
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

        <form
          method="post"
          action="/api/login"
          style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <input type="hidden" name="next" value={next} />

          <div className="ds-field">
            <label className="ds-field__label" htmlFor="password">Password</label>
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
      </div>
    </main>
  );
}
