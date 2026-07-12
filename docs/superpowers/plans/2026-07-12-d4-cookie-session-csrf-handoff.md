# HANDOFF PROMPT — Plan 2 Residual D4: Cookie-Session + CSRF Transport

You are picking up the LAST deferred residual of the Updog_restore trust-spine
Plan 2 work: **decision D4 — the HttpOnly cookie-session + CSRF transport** that
ADR-034 (Bearer) and ADR-036 (identity/grants/jti) explicitly DEFERRED.
Everything else in Plan 2 is merged. Execute the way the rest of Plan 2 was
executed: Hermes/Codex dispatch, verify-before-commit, full pre-push suite, one
PR per coherent slice.

## GO / NO-GO decision — GO recorded for this execution

D4 was deferred ON PURPOSE, twice, for scale/YAGNI reasons — not forgotten:

- Audience = internal Press On Ventures tool, team of ~5, in TESTING, no real or
  LP-visible data. ADR-034 chose Bearer precisely because cookie+CSRF "adds
  server surface (CSRF tokens, SameSite policy) the server does not currently
  carry, for a threat this audience does not face."
- ADR-034's explicit UPGRADE TRIGGER: revisit storage posture (HttpOnly
  cookie) + CSRF **"the moment prod carries real or LP-visible data."**

The implementation still must not claim that production carries real/LP data
without separate evidence. For this Ralph run, the user explicitly requested
implementation, which satisfies the documented explicit-user GO branch. Record
that basis in the PRD/ADR; do not invent a data-state claim.

## Mission (IF go)

Move the browser auth transport from a localStorage Bearer JWT to an **HttpOnly
cookie session with CSRF protection**, WITHOUT losing the identity model already
built (roles, explicit fund grants, jti revocation, fail-closed fund scope).
This closes the XSS-token-exfiltration risk ADR-034 knowingly accepted at small
scale.

## Current state (all MERGED — verify with `git log`/`gh` before trusting)

Bearer + identity model is fully landed on `main`:

- **ADR-034** (DECISIONS.md ~5648): browser auth = 7-day HS256 Bearer JWT,
  issued by `POST /api/auth/login`, stored in `localStorage`
  (`updog.authToken`), attached as `Authorization: Bearer` by a GLOBAL client
  fetch interceptor (`client/src/lib/install-auth-fetch.ts`, wired in
  `client/src/main.tsx`; PR #1073).
- **#1077** Plan 2: migration 0031 (`users.role`/`is_active`,
  `user_fund_grants`, `revoked_tokens` jti denylist); jti minting (`signToken`
  jwtid); fail-closed revocation in `verifyAccessTokenAsync`
  (`server/lib/auth/revocation.ts::assertTokenUsable`); `req.principal` on both
  surfaces; `POST /api/auth/logout`; `enforceProvidedFundScope` role-aware.
- **#1078** login mints each user's real role + `user_fund_grants`
  (admin/service unrestricted).
- **#1079** residual guards `requireFundAccess` + `getVerifiedFundScope` now
  role-aware / fail-closed. Fund-scope fail-closed migration is fully complete.
- Server is Bearer-native: the global `/api` boundary = `requireAuth()`
  (`server/lib/auth/jwt.ts`) reads `Authorization: Bearer` only;
  `isPublicApiPath` (`server/lib/public-api-boundary.ts`) lets `/api/auth/login`
  through.
- VESTIGIAL COOKIE USAGE (reconcile during D4): a few client hooks still send
  `credentials: 'include'` (lp-reporting hooks, `useReserveIcPacketEvidence`)
  and server CORS sets `credentials: true` (`server/server.ts`) — legacy, since
  the global interceptor now attaches Bearer.

## IF go — design decisions to LOCK before coding (do not just start)

1. **Browser vs machine transport.** Browser user auth is cookie-only. Retain
   Bearer JWT support for machine/service clients. Reject any request presenting
   both, even when values match. Operational metrics-key Bearer auth is a
   separate contract and must remain unchanged.
2. **Keep the identity model intact.** The cookie resolves to the same claims
   (`sub`, `role`, `fundIds`, `jti`) so revocation (`revoked_tokens`), roles,
   and fund grants keep working unchanged. Do NOT rebuild those. Use one
   canonical tagged credential extractor/verifier for `requireAuth`, secure
   context, provided-fund-scope, logout, and optional flag targeting.
3. **Cookie contract.** `updog.session`, HttpOnly, host-only, Path=/,
   SameSite=Lax, Secure outside local development/test, Max-Age=24h. Browser
   login uses a dedicated 24-hour JWT while the generic machine/test signer
   remains seven days. Clear with identical attributes.
4. **CSRF strategy.** Use `updog.csrf` plus `X-CSRF-Token`: a signed
   double-submit token bound to the verified JWT `jti`, HMAC-SHA256 signed with
   domain-separated `SESSION_SECRET`. Protect cookie-authenticated
   POST/PUT/PATCH/DELETE and login; reject cross-site Fetch Metadata or a
   present foreign Origin. Bearer clients are exempt.
5. **Client migration.** Purge and stop reading `updog.authToken`. Replace the
   global Bearer fetch interceptor with a same-origin CSRF/credentials
   interceptor so raw mutations stay protected. Replace token-presence routing
   with async `/api/auth/session` bootstrap. Login returns no JWT; logout calls
   the server and clears query/session state.
6. **Logout / revocation.** Logout clears both cookies AND revokes the jti
   (`revoked_tokens`) — keep the existing revocation path; deactivation must
   stay effective.
7. **CORS / cache / domain.** Keep the cookie host-only and require exact
   origins. Add the CSRF header to both CORS surfaces. Preserve the existing
   `ALLOWED_ORIGINS`/`CORS_ORIGIN` runtime contracts unless live evidence
   supports consolidation; normalize CRLF. Vary targeted user responses on
   Cookie and Authorization while both transports exist.
8. **ADRs.** ADR-037 supersedes ADR-034's browser transport and records the
   explicit 24-hour no-refresh decision; mark ADR-036's D4 deferral resolved.

## Execution recipe (reuse Plan 2's proven flow)

- **Branch off latest `origin/main`** in the linked worktree (it may sit
  detached at main — create a fresh `feat/...` branch).
- **Hermes dispatch:** write a precise brief to a scratch `.md`, then
  `node orchestrate.js --phase production --task "<short, KEYWORD-NEUTRAL> per the brief at <ABS path>" --skip-preflight-gate --skip-reason "linked worktree lane; junctioned deps"`
  with `dangerouslyDisableSandbox: true`. Keep `--task` free of financial
  keywords (moic/reserve/ allocation/fee/xirr/carry). Postflight is ONLY
  `npm run check` — run tests yourself.
- **Verify before every commit:** review the FULL diff for scope + collateral;
  `npm run check` and focused tests. Before push run `npm test` because
  auth/test infrastructure is shared. Use the repo's `cross-env TZ=UTC` scripts
  on Windows rather than Unix environment-prefix syntax.
- **Auth test policy:** retain existing Bearer fixtures as machine-client
  compatibility proof. Add a shared cookie+CSRF helper and transport-specific
  parity tests; do not mechanically convert every Bearer test. Co-located
  `server/**/__tests__` tests DON'T run in CI.
- **CI baseline:** integration teardown flaked earlier (pg-pool) and was fixed
  on `main`; branch off `main` so CI starts from the fixed baseline. Push runs a
  pre-push FULL suite (5-10 min) — background it and verify `git ls-remote` ==
  HEAD (exit 0 from `push; echo` masks a failed push).
- **Worktree collision:** if the user works the same branch from another
  checkout, reconcile by stashing onto a NEW branch off merged main — never
  rebase onto a squash merge.
- **Merge:** `main` requires the `CI Gate Status` aggregator; open a PR (direct
  push rejected); arm `gh pr merge <n> --squash --auto` to merge on green if the
  user authorizes it.

## Anchors (grep/read before editing — plans drift within hours)

- `DECISIONS.md`: ADR-034 (~5648, Bearer contract + upgrade trigger), ADR-036
  (~5760, D4 deferral), ADR-022 (~4980, SSE cookie/CSRF deferral rationale).
- Server auth: `server/lib/auth/jwt.ts` (`requireAuth`, `signToken`,
  `verifyAccessTokenAsync`), `server/lib/auth/revocation.ts`,
  `server/lib/auth/provided-fund-scope.ts`, `server/lib/secure-context.ts`,
  `server/routes/auth.ts` (csrf/login/session/logout), `server/routes/flags.ts`,
  `server/lib/public-api-boundary.ts` (`isPublicApiPath`), `server/app.ts`
  (global `/api` boundary + CORS), `server/server.ts` (Docker surface + CORS
  `credentials`).
- Client auth: `client/src/lib/install-auth-fetch.ts` (replace with CSRF fetch
  protection), `client/src/main.tsx`, `client/src/app/app-router.tsx`,
  `client/src/app/app-layout.tsx`, `client/src/App.tsx`,
  `apiRequest`/`getQueryFn`, the `/login` page, and the vestigial
  `credentials: 'include'` hooks (lp-reporting, `useReserveIcPacketEvidence`).

## Definition of done (IF go)

- Browser auth uses a 24-hour HttpOnly host-only cookie; login returns no JWT;
  the legacy localStorage key is purged and never used as auth truth.
- Signed jti-bound CSRF protection covers cookie-authenticated unsafe requests
  and login.
- Machine Bearer compatibility remains, but mixed cookie+Bearer requests fail
  closed.
- Identity model intact: roles, explicit fund grants, jti revocation,
  fail-closed fund scope all still enforced (existing tests green, adapted to
  the cookie helper).
- Logout clears the cookie AND revokes the jti; user deactivation still
  effective on next request.
- Both real surfaces (`makeApp` + `createServer`/`registerRoutes`) are
  consistent; targeted security tests, `npm test`, integration proof, typecheck,
  lint, build, and `npm run release:check` are green or environment gaps are
  explicitly separated.
- ADR-037 supersedes ADR-034's browser transport; ADR-036's D4 deferral is
  resolved.

## Definition of done (IF no-go — equally valid)

- A short ADR (or ADR-036 amendment) recording that D4 stays deferred as YAGNI
  at current scale, with the explicit re-trigger (prod carries real/LP data, or
  a public/LP-facing surface ships). No code changes.
