# Client → /api Auth Model — Decision & Scoping Doc

Status: **DRAFT / STEP 0 RESOLVED: CASE B + runtime blocker** (see Step 0)
Date: 2026-07-08
Owner: (GP / solo dev)
Related: route-mount-parity burn-down #1036 (PRs #1038–#1050); memory topic `project_route_mount_parity_guard_1036`

---

## 1. Why this doc exists

The #1036 burn-down mounted 7 previously Docker-only routers onto the prod
`makeApp` surface (timeline, shares, capital-allocation, liquidity, graduation,
portfolio-companies, portfolio-overview). Those mounts close the *silent 404*
class — but they only convert prod `404 → 401`, **not** `404 → 200`, because of a
deeper gap: **there is no working first-party end-to-end auth flow in this repo.**

This doc frames the decision, gates it on the one fact the repo cannot answer,
and lays out the auth-model options so implementation (if needed) can start from a
chosen design rather than a guess.

## 2. Verified current state (traced 2026-07-08)

| Seam | Fact | Source |
|---|---|---|
| Server gate | `requireAuth` accepts **only** `Authorization: Bearer <jwt>`; no token → `401`. Never reads a cookie. | `server/lib/auth/jwt.ts:218-221` |
| Verify side | `verifyAccessTokenAsync` supports HS256 **and** RS256. Works; exercised by tests. | `server/lib/auth/jwt.ts` |
| Token issuance | `signToken` exists but has **zero production callers**. No `/login` route, no `res.cookie`, no session middleware anywhere in `server/` or `api/`. | repo-wide grep |
| Client | `queryClient.ts` sends `credentials:'include'` (cookies) and stores **no** token (all `localStorage` is non-auth caches). | `client/src/lib/queryClient.ts:71,102` |
| Edge | `api/[...slug].ts` just calls `makeApp()`; no edge auth injection/verification. | `api/[...slug].ts:20-26` |
| External IdP | None (no Clerk/Auth0/Supabase/NextAuth/etc. in `package.json`). | `package.json` |
| Config | `REQUIRE_AUTH` defaults `true`. Only user-injection path is `assignDevelopmentUser`, gated to `NODE_ENV=development && !REQUIRE_AUTH` (the local-dev bypass). | `server/config/index.ts:207`, `jwt.ts:223` |
| Fund scope | Downstream authz (`enforceProvidedFundScope`, `requireAnyRole`) is already built and correct — it just sits *behind* the missing front door. | burn-down PRs |

**Net:** the app can *verify* a JWT (and tests mint them via `scopedAuthorizationHeader`), but nothing *issues* one to a real browser, and the browser holds none. The "front door" (login → credential → attach on every request) does not exist.

## 3. Step 0 — production auth setting

The repo cannot tell us how prod actually behaves. Get **one fact** before anything else:

```
vercel env ls           # or the Vercel dashboard → Project → Settings → Environment Variables
```

Look for `REQUIRE_AUTH` (and any auth/deployment-protection proxy in front of the app).

### Result captured 2026-07-09

Command:

```
vercel env ls production --no-color
```

Result: production env listed `ALLOWED_ORIGINS`, `ENABLE_QUEUES`, `CLIENT_URL`,
`CORS_ORIGIN`, `METRICS_KEY`, `HEALTH_KEY`, `JWT_SECRET`, `SESSION_SECRET`,
`REDIS_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_URL`, and `VITE_API_BASE_URL`;
it did **not** list `REQUIRE_AUTH`.

Code consequence: `server/config/index.ts` defaults `REQUIRE_AUTH` to `true`, so
prod is **not** Case A. Treat the auth-model decision as **Case B** unless a
separate perimeter/proxy is proven to inject a browser credential.

Runtime wrinkle: unauthenticated probes to `/api/flags`, `/api/version`,
`/api/timeline/1?limit=1`, and `/api/public/shares/not-a-real-share/verify`
returned `500`, not the expected guarded-route `401`/public-route response.
Vercel runtime logs for `/api/flags` showed:

```
Failed to initialize Express app: Error [ERR_REQUIRE_ESM]: require() of ES Module
/var/task/node_modules/jose/dist/webapi/index.js from
/var/task/node_modules/jwks-rsa/src/utils.js not supported.
```

Action before auth-feature work: fix the serverless import crash, redeploy, then
re-probe a guarded route such as `/api/timeline/1` without a token. Expected
post-fix behavior is `401` for guarded `/api` routes, confirming the browser
still has no credential path. Do not use `/api/flags` as the auth probe; it is
intentionally public via `isPublicApiPath`.

- **Case A — `REQUIRE_AUTH=0` (or unset→but default is true, so must be explicitly 0):**
  The burn-down mounts are **already reachable** in prod (`404 → 200`). There is **no `401` gap to fix**. Action: close this item; write a 3-line REFL/ADR recording "prod runs REQUIRE_AUTH=0; the `/api` Bearer gate is inert in prod" so no future session re-chases it. **Stop here.**
- **Case B — `REQUIRE_AUTH=1`:**
  The browser genuinely cannot reach guarded `/api` routes and never could. This is a **net-new auth feature**, not a wiring fix. Proceed to §4.

> Do **not** write code before this fact is known. Building either direction against an unknown prod config is the anti-pattern this doc exists to prevent.

## 4. Case B — auth-model options

Downstream authz already exists; the decision is only **how a browser proves identity on every `/api` call.** Three coherent models:

### Option 1 — First-party cookie session (server-issued, httpOnly)
- Add a `/api/auth/login` (+ `/logout`, `/me`) that verifies credentials and sets an **httpOnly, Secure, SameSite** session cookie (a JWT or an opaque session id).
- Teach `requireAuth` to accept the cookie **in addition to** `Bearer` (keep Bearer for tests/service-to-service).
- The client already sends `credentials:'include'` → **zero client fetch changes**.
- Cost: build login/logout/me + credential store (who are the users? password? magic link? invite?), **CSRF protection** (cookies are auto-sent → need same-site + CSRF token or double-submit), cookie rotation/expiry.
- Best when: the app owns its users and you want minimal client churn.

### Option 2 — Bearer + client token store
- `/api/auth/login` returns a JWT; client stores it (in-memory + refresh, or `localStorage`) and attaches `Authorization: Bearer` on every request (via `apiRequest` + `getQueryFn`).
- `requireAuth` stays exactly as-is (already Bearer-only) → **zero server gate changes**.
- Cost: build login + **refresh-token rotation**, touch **every** client fetch path to attach the header (raw-fetch hooks + shared `apiRequest`), XSS-exposure of a readable token (mitigate with short-lived access + httpOnly refresh cookie — which reintroduces Option 1's cookie work).
- Best when: you also need non-browser API clients (mobile, CLI, partners).

### Option 3 — External IdP (Auth0 / Clerk / Vercel deployment protection)
- Delegate identity to a provider; the app verifies provider-issued tokens (RS256 path already supported by `verifyAccessTokenAsync`).
- Cost: vendor + config + mapping provider claims → `req.user` (role/fund scope); least *code*, most *integration/ops*.
- Best when: you want SSO/enterprise login and don't want to own credential storage.

### Non-negotiable constraints (all options)
1. **Do NOT** route a hook through `apiRequest` and call it fixed — cookies ≠ Bearer; documented non-fix (memory `project_secondary_surface_lp_paused` / systemic client-auth finding).
2. **Do NOT** ship half a session system (cookie without CSRF, or token without rotation) — worse than none.
3. Reuse `verifyAccessTokenAsync` (HS256/RS256) and `enforceProvidedFundScope`/`requireAnyRole` — do not fork the authz side.
4. Mind `isPublicApiPath` (`public-api-boundary.ts`) — the shares `/api/public/*` anonymous bypass must stay intact and not become an auth hole (REFL-013 substring-matching risk).
5. Vercel: set `trust proxy` correctly if any auth/rate-limit reads client IP (REFL-010).
6. `REQUIRE_AUTH` default stays `true`; the dev bypass (`assignDevelopmentUser`) must remain dev-only.

## 5. Recommendation

- **Step 0 result is Case B.** Production does not define `REQUIRE_AUTH`, and
  the repo default is `true`; do not pursue Case A unless a future env check
  shows production explicitly set to `REQUIRE_AUTH=0`.
- For the auth-feature design, default to **Option 1 (cookie session)** —
  smallest client blast radius (the client is already cookie-ready), and this
  is an internal tool that owns its (small) user set, so full IdP is overkill.
  Escalate to Option 3 only if SSO/enterprise login is a real requirement.
- Treat Option 2 as a fallback only if a non-browser API client appears.

## 6. Rough scope (Case B / Option 1)

Milestone-sized, sequence:
1. Credential model decision (password vs magic-link vs invite-only) + user store.
2. `/api/auth/{login,logout,me}` + httpOnly cookie issuance/rotation + CSRF.
3. `requireAuth` accepts cookie ∨ Bearer (add cookie branch, keep Bearer).
4. Client `/login` UI + `useAuth`/session bootstrap + 401 → redirect.
5. E2E: unauthenticated → login → the 7 burn-down routes now `200`.
6. ADR in `DECISIONS.md`; REFL for the auth boundary.

**Not** a one-PR fix. Warrants `superpowers:brainstorm` on the credential model before coding.

## 7. Open questions (for the human)
- **Prod `REQUIRE_AUTH` value?** Resolved 2026-07-09: not present in production
  `vercel env ls`; repo default is `true`. Reconfirm only after deployment/env
  changes.
- Who are the users, and how do they authenticate today (if at all)? Is there an existing SSO/IdP expectation for Press On Ventures?
- Is any non-browser client (mobile/CLI/partner) in scope? (Bearer vs cookie.)
- Is login even desired in-app, or is access controlled entirely by Vercel deployment protection / network perimeter?
