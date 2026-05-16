# auth.elijahfrost.com

Centralized password gate for personal projects under `elijahfrost.com`.

## Architecture

- This Vercel-hosted Next.js app serves the password form and issues the shared cookie.
- Protected subdomains (`slides`, `ankislides`, `projects`, `careertracker`, `musclelabeler`, `pulsetimer`) sit behind a Cloudflare Worker that checks the cookie and redirects here when missing. `www` (which serves the public CV) and the apex stay public.
- One shared password (`SHARED_PASSWORD`) lives encrypted in both Vercel and Cloudflare Workers. The cookie value is `SHA-256(SHARED_PASSWORD)` — deterministic and verifiable from the secret in either environment.

## Cookie

| Field | Value |
|---|---|
| Name | `ef_auth` |
| Value | `sha256(SHARED_PASSWORD)` (hex) |
| Domain | `.elijahfrost.com` |
| Path | `/` |
| HttpOnly | true |
| Secure | true |
| SameSite | `Lax` |
| Max-Age | 30 days |

## Routing flow

1. Visitor hits `slides.elijahfrost.com/foo`.
2. Worker sees no valid `ef_auth` cookie → 302 to `https://auth.elijahfrost.com/?next=<encoded URL>`.
3. This app validates the `next` hostname (must be `elijahfrost.com` or `*.elijahfrost.com`), renders the form.
4. On POST, password is checked; cookie is set on `.elijahfrost.com`; 302 to `next`.
5. Worker re-runs on the second hit, cookie matches, request passes through to origin.

## Local dev

```bash
npm install
SHARED_PASSWORD=local-dev npm run dev
```
