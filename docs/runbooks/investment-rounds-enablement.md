---
status: ACTIVE
audience: both
last_updated: 2026-06-28
owner: 'gp-team'
review_cadence: P180D
categories:
  - development
  - testing
keywords:
  - investment rounds
  - enable_investment_rounds
  - feature flag
  - VITE_ENABLE_INVESTMENT_ROUNDS
  - idempotency
  - soak
related_code:
  - 'flags/registry.yaml'
  - 'client/src/shared/useFlags.ts'
  - 'shared/feature-flags/flag-definitions.ts'
  - 'server/routes/investments.ts'
  - 'tests/integration/investment-scenario-capability.test.ts'
---

# Investment Rounds — Enablement Runbook

How to turn investment-round persistence on for local development and staging,
and the invariants that keep it **off in production**.

## TL;DR

- Flag: **`enable_investment_rounds`** — global default **OFF**, **OFF in
  production**, ON in development.
- Local/staging enable levers (in priority order): runtime override (`?ff_`
  query param or `localStorage`) → build-time `VITE_ENABLE_INVESTMENT_ROUNDS`.
- **Never** flip the global default (`flags/registry.yaml` `default:` or
  `ALL_FLAGS.enabled`) — that leaks the feature into prod and trips the
  regression guard in `tests/unit/flags/enable-investment-rounds.test.tsx`.

## What the flag gates

The flag gates the **client UI** that surfaces rounds (the rounds section on the
portfolio company summary page; see
`client/src/pages/portfolio-company-summary.tsx` and
`client/src/components/investments/investment-rounds-section.tsx`).

The **server** investment-round endpoints in `server/routes/investments.ts` have
**no flag gate** — they are always mounted and are unconditionally guarded by:

- `Idempotency-Key` precondition (missing key → `428`),
- per-request fund scope (`enforceProvidedFundScope`; cross-fund write → `403`),
- idempotent create/replay/conflict (`200` replay,
  `409 idempotency_key_reused`),
- append-only supersede (`409 round_already_superseded` on double supersede).

Leaving the endpoints mounted in production is safe because there is no UI entry
point when the flag is off and every write is auth- and scope-guarded.
Valuation, performance-case, and bulk round paths remain **UNSUPPORTED**
(`/cases` → `501`).

## Flag resolution order

From `client/src/shared/useFlags.ts`, the live value resolves as:

```
runtime (?ff_enable_investment_rounds / localStorage 'ff_enable_investment_rounds')
  ?? VITE_ENABLE_INVESTMENT_ROUNDS (build-time env)
  ?? ALL_FLAGS.enable_investment_rounds.enabled (global default = false)
  ?? false
```

The per-environment lever is the **`VITE_*` build env**, not a per-environment
branch in `flag-definitions.ts` (there is none) and not the global default bit.

## Enable levers (local / staging ONLY)

1. **Build-time env** (already wired):
   - `.env.development` → `VITE_ENABLE_INVESTMENT_ROUNDS=true` (dev is ON)
   - `.env.production` → `VITE_ENABLE_INVESTMENT_ROUNDS=false` (prod is OFF — do
     not change)
   - Type: `client/src/vite-env.d.ts` (`VITE_ENABLE_INVESTMENT_ROUNDS?: string`)
2. **Runtime query param** (no rebuild): append `?ff_enable_investment_rounds=1`
   to the URL. Use `=0` to force off.
3. **Runtime localStorage** (no rebuild):
   `localStorage.setItem('ff_enable_investment_rounds', '1')` (`'0'` to force
   off, `removeItem` to clear).

Seed base fund/company/investment rows with `npx tsx scripts/seed-db.ts`, then
create rounds through the UI or the API. `seed-db.ts` seeds the base
`investments` rows that rounds attach to; it does not pre-populate the
`investment_rounds` ledger.

## Production-off invariants (do not break)

- Keep `flags/registry.yaml` → `enable_investment_rounds.default: false` and
  `environments.production: false`.
- Keep `.env.production` → `VITE_ENABLE_INVESTMENT_ROUNDS=false`.
- The flag carries `expiresAt: 2026-12-31`, but this is metadata only honored by
  the shared `isFlagEnabled(flagKey, flagStates)` helper in
  `flag-definitions.ts`. The investment-rounds UI gate --
  `useFlag('enable_investment_rounds')` in `client/src/shared/useFlags.ts`, plus
  the `isUnifiedFlagEnabled` runtime -- does NOT evaluate `expiresAt`, so the
  feature will NOT auto-disable on that date; `VITE_ENABLE_INVESTMENT_ROUNDS`
  and runtime overrides stay authoritative. Re-home the feature (or route the UI
  through `isFlagEnabled`) before then if expiry must actually gate it.
- Guard test: `tests/unit/flags/enable-investment-rounds.test.tsx` asserts the
  global default stays OFF (prod-leak tripwire) and that the `VITE_*` lever
  works both ways. Keep it green.

## Running the controlled soak proof

The contract + controlled-soak proofs live in
`tests/integration/investment-scenario-capability.test.ts` (the
`controlled soak proof` block). They are DB-backed and Docker-backed
(testcontainers), so they run in CI, not in a Docker-less cloud session.

- CI: trigger `ci-unified` with `run_full_suite=true`; the `test-full`
  integration group runs them against a real Postgres. A ~1-minute docs-only run
  is vacuous — wait for the full (~7m) run.
- Local (needs Docker):
  `npx vitest run -c vitest.config.testcontainers.ts tests/integration/investment-scenario-capability.test.ts`.
- Soak depth is tunable via `INVESTMENT_ROUNDS_SOAK_ITERATIONS` (default 50,
  clamped 1..500).
