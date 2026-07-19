# TODOS

Deferred work with durable context. Reviewed items carry the reasoning so a
future session (or teammate) can pick them up without re-deriving the decision.

---

## Cookie-session browser auth transport + CSRF (design decision D4)

- **What:** Replace the Bearer-JWT-in-localStorage browser auth transport with
  server-side, revocable, HttpOnly cookie sessions plus CSRF protection for
  mutations. Service/automation continues on short-lived bearer JWTs through the
  same principal builder.
- **Why:** Removes the browser token from `localStorage` (closes the XSS ->
  token-theft window), gives per-session revocation without relying on
  `JWT_SECRET` rotation, and aligns browser/session semantics across the Vercel
  and Docker runtime surfaces.
- **Pros:** Stronger browser auth posture; individual session revocation;
  immediate user deactivation; no 7-day compromise window from a stolen
  localStorage token.
- **Cons:** Reverses ADR-034 (Bearer HS256 / 7-day / localStorage, ratified
  2026-07-11); ~8 tasks of new infra (session store, CSRF token machinery,
  cookie handling, session cleanup, migration for `auth_sessions`); benefits are
  lower-stakes at ~5 internal users.
- **Context:** Deferred 2026-07-11 during CEO + Eng review of the
  stabilization/trust-spine plan portfolio
  (`~/Downloads/updog_restore_review_only_implementation_plans_2026-07-11.md`,
  "Plan 2 / D4"). Decision was to KEEP Bearer/ADR-034, finish the #1072 client
  wiring, and land Plan 2's identity **correctness** (named per-person
  identities D3, explicit fund grants D5, remove committed dev passwords,
  empty-grants-deny) plus a lightweight **jti denylist** for revocation ON the
  existing Bearer transport. The jti denylist delivers the one high-value
  benefit (immediate deactivation) cheaply, which is why the full cookie swap
  could be deferred. This is **superseded-not-cancelled**: because Plan 2's
  roles/grants land on Bearer now, the cookie-session swap stays cleanly
  available later with no data-model rework.
- **Revisit when:** the app gains external / LP-facing access, the user
  population grows beyond the internal team, or the threat model changes (e.g.
  untrusted client environments).
- **Depends on / blocked by:** Plan 2 (identity/roles/grants) landing first; ADR
  to formally supersede ADR-034 before implementation.
- **Effort:** L (human: ~1-2 wks / CC: ~1-2 days).

---

## Consolidate trust/evidence UI into FinancialEvidenceDrawer

- **What:** Refactor existing trust-display call sites
  (`dual-forecast-dashboard`, `overview`, and other consumers of
  `TrustStateCounts` / `NavAttributionTable` / `DataQualityCard` /
  `context-rail-view-model`) to route evidence display through the single
  `FinancialEvidenceDrawer` primitive introduced in Plan 9.
- **Why:** Plan 9's evidence drawer (design decision D-B) is built additively —
  it _reuses_ the existing components internally but does NOT touch current call
  sites, to keep the diff minimal and avoid regression on already-shipped trust
  UI. That leaves temporary duplication: the same evidence semantics rendered
  two ways.
- **Pros:** One trust-display pattern across the whole app; kills the
  duplication DESIGN.md warns against; consistent evidence UX on every financial
  surface.
- **Cons:** Touches already-shipped dashboards -> regression surface; needs
  visual QA (`/design-review`) on each migrated surface.
- **Context:** Deferred 2026-07-11 during `/plan-design-review` of the plan
  portfolio. Decision D-B chose additive-reuse over full-consolidation-now
  specifically to protect shipped trust UI. Revisit after Plan 9 lands and the
  drawer has proven itself on the new disclosure surfaces.
- **Depends on / blocked by:** Plan 9 `FinancialEvidenceDrawer` landing first.
- **Effort:** M (human: ~3-5 days / CC: ~half day).

---

## Rotate the prod smoke password (`plan3-smoke` / `PROD_SMOKE_PASSWORD`)

- **What:** Replace the current `plan3-smoke` password (in prod DB + the
  `PROD_SMOKE_PASSWORD` Production secret) with a fresh value, and update the
  external identity file so it stays the source of truth.
- **Why:** The current password was pasted into a Claude Code chat transcript on
  2026-07-16 while verifying a credential reset. If that transcript is ever
  shared/stored, the smoke user is exposed — and it currently has
  `role = admin`. Low stakes (dedicated test user on an internal tool), but
  cheap hygiene.
- **Runbook (one-shot, ~15 min):**
  1. Pick a new strong password `P2`.
  2. Update `plan3-smoke`'s entry in the external `IDENTITY_FILE` with `P2`
     (keeps it the source of truth; otherwise the next provisioning run reverts
     the password).
  3. Re-provision prod DB (dry-run first to inspect):
     `NODE_ENV=production DATABASE_URL="<prod-neon from .env.local>" PROVISION_PROD=1 IDENTITY_FILE="<abs path>" npx tsx scripts/provision-prod-users.ts --dry-run`
     then drop `--dry-run` to apply.
  4. Set the secret newline-safe:
     `printf '%s' 'P2' | gh secret set PROD_SMOKE_PASSWORD --env Production --repo nikhillinit/Updog_restore`
  5. Verify:
     `TZ=UTC PRODUCTION_URL=https://updog-restore.vercel.app PROD_SMOKE_USERNAME=plan3-smoke PROD_SMOKE_PASSWORD='P2' npx playwright test tests/smoke/production-boundaries.spec.ts --project=production`
     (login test must pass), then confirm on the next `release-production` gate.
- **Bundle opportunity:** while re-provisioning, consider scoping `plan3-smoke`
  to a non-admin role (fixes part of the Plan 9F all-users-admin violation, and
  restores genuine cross-fund-403 fidelity to the smoke canary).
- **Context:** Deferred 2026-07-16 right after confirming the reset was
  consistent (DB hash matched, secret re-set newline-safe, local boundary smoke
  green). See memory `project_prod_smoke_creds_verify`.
- **Revisit when:** next time touching prod creds, or before sharing any session
  transcript. Low urgency.
- **Effort:** S (human: ~15 min / CC: ~10 min once the identity file path is
  provided).

---

## Substrate T14: organic constrained-reserve shadow traffic (ADR-055)

- **What:** Wire a production-routed, user-invoked reserve action to feed the
  constrained-reserve substrate shadow with real inputs via
  `POST /api/v1/reserves/calculate?fundId=`.
- **Why deferred:** No clean organic source exists today — `ReserveStep` is
  unrouted, the only client-to-`ReserveInput` mapper
  (`wizard-reserve-bridge.ts:287`) hardcodes `reserveMultiple: 2.0` and other
  synthetic policy, and the retrying API client can append duplicate ledger rows
  under transient failure. Collecting through those paths would label synthetic
  data as organic evidence — worse than the honest scheduled battery.
- **Revisit when (all three):** (1) the T13 promote/extend/stand-down decision
  is recorded; (2) a supported production-routed, user-invoked reserve action
  exists; (3) every `ReserveInputSchema` field, including stage policies, has an
  authoritative non-defaulted source.
- **A future design must additionally add:** same-origin auth/CSRF, no-retry or
  idempotent delivery, stable-input deduplication, a ledger write budget, and a
  central kill switch.
- **Context:** Deferred 2026-07-19 after a code review of the T14 organic-wiring
  proposal verified all three blockers against `main`. See memory
  `project_substrate_tranche_arc` and ADR-055.
- **Effort:** M (blocked on a production reserve-input boundary landing first).
