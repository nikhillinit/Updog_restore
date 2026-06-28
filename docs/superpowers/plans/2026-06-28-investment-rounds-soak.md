---
status: ACTIVE
audience: both
last_updated: 2026-06-28
owner: 'gp-team'
categories:
  - testing
keywords:
  - investment rounds
  - soak
  - idempotency
  - feature flag
  - enable_investment_rounds
related_code:
  - 'server/routes/investments.ts'
  - 'server/services/investments/investment-round-service.ts'
  - 'tests/integration/investment-scenario-capability.test.ts'
  - 'docs/runbooks/investment-rounds-enablement.md'
---

# Investment Rounds Controlled Soak Proof — Plan

## Problem

The investment-round persistence contracts (idempotent create/replay, reused-key
conflict, `Idempotency-Key` precondition, cross-fund denial, append-only
supersede) are already landed and gated behind the `enable_investment_rounds`
flag (default **OFF**, OFF in production). The existing integration suite proves
each contract **once** (one happy-path call per behavior). What is missing is a
**controlled soak** that proves the same contracts hold under _sustained,
repeated_ traffic — no duplicate persistence on replay, no row leakage from
rejected writes, deterministic conflict detection, and supersede-chain integrity
across many corrections.

This is **proof + tests + docs only**. No new schema, no new feature, no new
route, and the flag stays default-OFF / prod-OFF.

## Scope (exact files)

- **Add** `tests/integration/investment-scenario-capability.test.ts` →
  `describe('controlled soak proof', ...)` appended to the existing module so it
  **reuses** the proven testcontainer + fixtures + router import + `supertest`
  harness. (`vitest.config.int.ts` already collects this file, so the soak runs
  on a full `ci-unified` `test-full` integration run.)
- **Add** `docs/runbooks/investment-rounds-enablement.md` documenting the
  prod-OFF invariant and the local/staging enable levers.
- **Add** this plan,
  `docs/superpowers/plans/2026-06-28-investment-rounds-soak.md`.
- **Regenerate** `docs/_generated/router-index.json` (+ fast/staleness) via
  `npm run docs:routing:generate` (required for new `docs/**/*.md`).
- **No change** to flag defaults. The prod-leak tripwire already lives in
  `tests/unit/flags/enable-investment-rounds.test.tsx` and stays green.

## Test list (controlled soak)

Each case seeds its own dedicated investment (order-independent, clean ledger).
Iteration count: `INVESTMENT_ROUNDS_SOAK_ITERATIONS` env (default 50, clamped
1..500).

1. **Sustained idempotent create + replay, no duplicate persistence** — N unique
   keys each create exactly one round (201); replaying every key 3× returns 200
   with the same row id; the active list length equals N and its id set equals
   the created id set.
2. **Deterministic reused-key conflict under load** — for every iteration, a
   reused key with a mutated body returns 409 `idempotency_key_reused`; the
   ledger holds exactly the N originally created rows.
3. **Precondition + cross-fund guards under sustained traffic** — every
   iteration: a key-less write returns 428, a cross-fund write returns 403, and
   neither leaks a row (final list length 0).
4. **Append-only supersede chain integrity** — a base round corrected K times in
   a chain keeps exactly one active head; every superseded round drops out of
   the active list; superseding an already-superseded round always returns 409
   `round_already_superseded`.

## Verification

- Local (cloud session, no Docker/DB): `npm run check`, `npm run lint`, and the
  flag + client rounds unit tests
  (`tests/unit/flags/enable-investment-rounds.test.tsx`,
  `tests/unit/pages/portfolio-company-summary.rounds.test.tsx`,
  `tests/unit/components/investments/investment-rounds-section.test.tsx`).
- CI proof: trigger `ci-unified` with `run_full_suite=true` on the branch; the
  `test-full` integration group runs the soak against a real Postgres. A
  ~1-minute docs-only run is vacuous — wait for the full (~7m) run.

## Definition of done

A branch off latest `main` that (a) keeps the flag default-OFF / prod-OFF, (b)
adds the controlled-soak proof reusing `investment-scenario-capability.test.ts`,
(c) documents the enable levers, (d) is green on a full `ci-unified` run.
