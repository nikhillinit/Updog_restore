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

- **What:** Feed the constrained-reserve substrate shadow with real fund inputs
  so the T13 pilot accrues organic (not synthetic) evidence.
- **Why deferred (architectural, not a data gap):** T14 targeted
  `POST /api/v1/reserves/calculate` (Path B), which computes from a
  caller-supplied JSON body — `fundId` selects only the operator mode and never
  loads fund state — and its only browser mapper
  (`wizard-reserve-bridge.ts:287`) fabricates a synthetic construction portfolio
  with hardcoded policy. A provenance-gated, server-side actuals seam (Path A,
  `facts-reserve-input-adapter.ts`) already exists and is the correct
  foundation. See ADR-055.
- **Revisit when (all):** (1) T13 promote/extend/stand-down recorded; (2) a
  fund-scoped user action invokes a server-side assembler reusing the facts
  adapter; (3) no client synthetic portfolio / default ownership / default stage
  / undisclosed constant, and derived params disclose provenance; (4) the
  constrained engine is assessed against the marginal next-dollar reserve MOIC
  (Tactyc-aligned) methodology first.
- **Convergence decision:** superseded framing recorded in ADR-056 — the
  authoritative reserve workflow (not the caller-JSON `/calculate` route) is the
  convergence target; see the canonical-assembler entry below (rescoped).
- **Depends on:** the canonical reserve-input assembler below (rescoped by
  ADR-056).
- **Effort:** M (blocked on the assembler).

---

## Canonical server-side reserve-input assembler (unblocks T14)

- **What (rescoped by ADR-056 — compose, do not greenfield):** Compose the
  AUTHORITATIVE reserve workflow at the `runReserveCalculation` seam
  (`server/services/reserve-calculation-service.ts`) from parts that already
  exist plus one net-new input: (1) REUSE `buildMarginalReserveMoicInputs` for
  provenance-controlled deal-level ranking inputs; (2) REUSE
  `calculateMarginalReserveMoic` to rank follow-on priority; (3) NET-NEW a
  server-side fee/expense/deployment/recycling-aware reserve ENVELOPE service
  (replacing the naive `fundSize * reserveRatio`), with disclosed provenance —
  **[LANDED, UNWIRED]** `server/services/reserves/reserve-envelope-service.ts`
  - `shared/contracts/reserve-envelope-v1.contract.ts` (cents-exact,
    per-component provenance status observed/derived/defaulted/unavailable,
    `trustedForActivation`, `canonicalSha256` inputHash; consumed by no live
    path yet); (4) REUSE `ConstrainedReserveEngine.calculate` to allocate the
    envelope in the ranked order, replacing `generateReserveSummary`'s hardcoded
    multipliers behind a new calc-mode/flag, shadow-first. Records input
    provenance; no client-manufactured synthetic portfolio.
- **Progress (2026-07-19):** NET-NEW #1 (envelope) landed standalone/unwired.
  Envelope source map — committed=`funds.size` (observed);
  deployed=Σ`investments.amount` else `funds.deployed_capital`
  (observed/derived) else 0 (defaulted); mgmt fees= `funds.management_fee` x
  committed x `config.fundLife` (derived; flat committed basis,
  step-downs/called-basis deferred) else 10y default (defaulted); expenses=
  `config.expenses[]` (derived) else `unavailable`; exit
  recycling=`config.recyclingCap` upper bound (derived) else `unavailable`.
  Remaining: NET-NEW #2 (ranked-allocation orchestrator wiring the envelope into
  `runReserveCalculation` behind a calc-mode/flag) and NET-NEW #3 (mode-aware
  fund-moic route + un-gate `ENABLE_MARGINAL_RESERVE_MOIC`, H9-governed).
- **Why:** Today the browser would have to manufacture the entire `ReserveInput`
  (Path B). The actuals seam exists but only yields company candidates, not the
  fund envelope, forecast assumptions, or constraints. Unifying these behind one
  server-side workflow is the prerequisite for any genuine, provenance-traceable
  reserve calculation — and for T14 organic shadow traffic.
- **Decided (ADR-056):** rank by the deal-level marginal next-dollar MOIC (B),
  not A's per-stage `reserveMultiple`; the authoritative engine
  (`generateReserveSummary` hardcoded multipliers) is the real thing being
  replaced. See DECISIONS.md ADR-056.
- **Context:** Scoped 2026-07-19 from the code-review reconsideration of T14
  (ADR-055). See memory `project_substrate_tranche_arc`. Convergence target and
  reuse map fixed by ADR-056.
- **Effort:** L (spans facts adapter reuse, fund cash-flow/envelope sourcing,
  forecast assumptions, and an engine-methodology decision).
