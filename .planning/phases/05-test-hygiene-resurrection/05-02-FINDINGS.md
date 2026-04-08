# Plan 05-02 Findings — Fund Idempotency Stale Contract

**Date:** 2026-04-08 **Plan:** 05-02 — Test Hygiene Resurrection
(`tests/integration/fund-idempotency.spec.ts`) **Requirement:** REQ-TEST-01

## Outcome: STALE CONTRACT — re-quarantined with accurate comment

The original 2026-02-20 quarantine comment ("6/6 tests timeout at 30s each,
causing cascade resource exhaustion") is obsolete. The cascade failure mode is
structurally impossible under the current integration setup. After removing the
stale exclude entry and running the test in isolation, the failure signature is
NOT a timeout/cascade — it is `HTTP 400 Bad Request` on the initial
`POST /api/funds` call, because the test asserts against an obsolete
pre-Phase-2A `FundCreateV1` contract.

The product code is healthy. The schema tightening that drifted the test was
intentional (docstring `@provisional size=0 ... Phase 2A reconciles` at
`shared/contracts/fund-create-v1.contract.ts:23`). The test itself has rotted.

## Cascade Fix Verification — Original Quarantine Reason Is Obsolete

The 2026-02-20 quarantine (commit `2a18a571`) cited REFL-024 cascade exhaustion
from per-file `setupFiles` server spawning. That root cause is gone:

- **`50ae84ca`** (March 2026) — Migrated integration tests from per-file
  `setupFiles` server spawn to a single shared `globalSetup`, eliminating the
  spawn/kill cycle cascade.
- **`a2482e51`** — Stabilized integration lifecycle.
  `tests/integration/global-setup.ts` now spawns one ephemeral-port Express
  server for the entire integration run, waits on `/healthz`, and gracefully
  tears down via `killProcessTree`. Line 276 sets `process.env.BASE_URL` so all
  test files inherit the correct URL.

**Isolated-run evidence**
(`TZ=UTC npx vitest run -c vitest.config.int.ts tests/integration/fund-idempotency.spec.ts`):

- Duration: **10.62s total** (not 180s+ as the cascade comment implied)
- Port: ephemeral `51278` (single-server-spawn working as designed)
- `[globalSetup] Starting integration test server (ephemeral port)...`
- `[globalSetup] Server ready on port 51278`
- `[globalSetup] Shutting down test server...` (clean teardown)
- No cascade. No hang. No 30s timeouts.

The file times out NEVER. It fails FAST with assertion errors on response codes.

## Failure Signature

All 6 tests fail with `HTTP 400 Bad Request` on the initial `POST /api/funds`
call. The fast-failure pattern (individual tests finishing in 16–137ms) confirms
the server is responding, just not with the codes the test expects.

| #   | Test                                                                       | Assertion Failed                  | Time  |
| --- | -------------------------------------------------------------------------- | --------------------------------- | ----- |
| 1   | Double-submit prevention > should handle concurrent identical requests     | `[400, 400]` ≠ `[201, 409]`       | 137ms |
| 2   | Double-submit prevention > should return 409 for duplicate idempotency key | `400` ≠ `201`                     | 21ms  |
| 3   | Inflight map cleanup > should clean up inflight map on AbortError          | got Response instead of rejection | 43ms  |
| 4   | Inflight map cleanup > should handle network errors gracefully             | `400` ≠ `201`                     | 38ms  |
| 5   | Edge cases > should handle rapid sequential requests                       | `400` ≠ `201`                     | 77ms  |
| 6   | Edge cases > should differentiate between different fund data              | `400` ≠ `201`                     | 16ms  |

Every test asserts `expect(response.status).toBe(201)` (or `201/409` sorted
pair) on the FIRST `POST /api/funds` — and every first POST is rejected as 400
validation failure at `server/routes/funds.ts:126-133` by
`FundCreateV1Schema.safeParse()`.

## Three Drift Categories

### 1. Unit drift — decimal-ratio vs whole-number-percent

The test (`tests/integration/fund-idempotency.spec.ts` `testFundData` block)
sends:

```typescript
{
  managementFee: 2.0,      // intended 2%
  carryPercentage: 20,      // intended 20%
  // ...
}
```

The current schema requires decimal ratios:

- `shared/contracts/fund-create-v1.contract.ts:32` —
  `managementFee: z.number().min(0).max(0.1).default(0.02)` — ceiling 0.10 (10%)
- `shared/contracts/fund-create-v1.contract.ts:38` —
  `carryPercentage: z.number().min(0).max(0.5).default(0.2)` — ceiling 0.50
  (50%)

Test sends `2.0` (2000% under the decimal-ratio interpretation) and `20` (2000%
under the decimal-ratio interpretation). Both exceed the `max()` bound.
Validation hard-fails.

The unit convention is explicitly documented in the contract docstring:

```typescript
 * @unit managementFee: decimal ratio 0-0.10 (e.g. 0.02 = 2%)
 * @unit carryPercentage: decimal ratio 0-0.50 (e.g. 0.20 = 20%)
```

(`shared/contracts/fund-create-v1.contract.ts:8-9`)

This is not an ambiguous drift — it is a documented unit-system migration the
test was never updated for.

### 2. Strict-mode rejection — extra keys

`FundCreateV1Schema` is declared `.strict()` at
`shared/contracts/fund-create-v1.contract.ts:54`. Unknown keys are rejected.

The test's `testFundData` sends these EXTRA keys that are NOT in the current
schema:

- `deployedCapital`
- `status`
- `termYears`

Valid keys on `FundCreateV1Schema`:

- `name` (required)
- `size` (required)
- `managementFee` (optional, defaulted)
- `carryPercentage` (optional, defaulted)
- `vintageYear` (optional, defaulted)
- `modelVersion` (optional)
- `engineResults` (optional nullable)

Even if the unit drift were fixed, the strict-mode rejection would still return
400 on the extra keys.

### 3. Response envelope change — flat vs wrapped

Current `POST /api/funds` wraps success responses in
`{ success: true, data: { id, ... }, message }` (see
`server/routes/funds.ts:125-148`). The test assumes a flat response:

```typescript
const fund = await response1.json();
createdFundIds.add(Number(fund.id));
```

Even if validation passed, `fund.id` would be `undefined` and
`Number(undefined) = NaN`. The `afterEach` cleanup via `DELETE /api/funds/{id}`
would then fire against `/api/funds/NaN`, leaving all created fixtures orphaned
on the test database. All 6 tests would misbehave at cleanup even if POST
validation passed — this is a second independent drift.

## Why Branch D (Stale Contract), Not Branch C (Production Bug)

The schema tightening is **intentional Phase 2A evolution**, not a regression.
The contract file itself documents the provisional nature of the shape and the
unit convention:

- `shared/contracts/fund-create-v1.contract.ts:8-9` — explicit `@unit`
  annotations
- `shared/contracts/fund-create-v1.contract.ts:23` —
  `@provisional size=0 means user did not enter a value; Phase 2A reconciles`
- `shared/contracts/fund-create-v1.contract.ts:54` — `.strict()` — unknown keys
  rejected by design

The server route (`server/routes/funds.ts:125-148`) is behaving correctly per
the current contract: validate with `safeParse`, 400 on failure with structured
issues, transactional create on success, wrapped envelope response. This is the
Phase 2A reconciliation landing exactly as designed.

Product code is healthy. The test has rotted past it.

## Why Not Branch B (Trivial Fix In-Phase)

Fixing this in Phase 5 would require:

1. **Unit conversion** on 6 test fixtures (whole-number → decimal ratio) across
   the `testFundData` factories and inline usages.
2. **Strict-mode cleanup** removing `deployedCapital`, `status`, `termYears`
   from every test fixture.
3. **Response envelope refactor** — every `response.json()` destructure path
   needs to read `.data.id` instead of `.id`, which affects:
   - `createdFundIds.add(...)` calls in all 6 tests
   - `afterEach` cleanup
   - possibly the `DELETE /api/funds/{id}` shape if that also wraps
4. **Re-validation** against the **current** idempotency middleware contract
   (`server/middleware/idempotency.ts`) — the test assumes server-side dedupe by
   `name` returns 409, but the current middleware might dedupe by
   `Idempotency-Key` header only. If the name-dedupe was removed during Phase
   2A, the `[201, 409]` expectation on concurrent identical posts is wrong per
   the new behavior — the test logic (not just the fixtures) needs to be
   re-derived.

This is 6-test rewrite across three independent contract-drift axes, plus a
re-derivation of the idempotency semantic from current middleware source.
Estimated effort >30 minutes. Out of scope for Phase 5 hygiene.

## Follow-up Reservation

- **REFL filename reserved:**
  `docs/skills/REFL-038-fund-idempotency-pre-phase-2a-contract.md` (NOT written
  in this phase — only reserved. The follow-up work is test-rewrite, not
  product-fix, so the REFL will capture the "test rotted past intentional
  contract evolution" pattern when the rewrite lands.)
- **Recommended phase:** v1.1 spillover OR v1.2 kickoff (user decision).
- **Nature of follow-up:** Test-rewrite against the current `FundCreateV1Schema`
  plus current `idempotency` middleware behavior. Not a product fix.
- **Estimated effort:** 1–2 hours (6 tests × 3 drift axes + contract
  re-derivation + local integration re-run verification).

## Recommendation

Defer. The cascade-fix verification work already landed in this plan is the
valuable output — confirming that the REFL-024 cascade comment is dead and can
never again be the correct reason to quarantine an integration test file. The
test-rewrite itself is a separate product-scope decision that does not belong in
a test-hygiene phase.

## Invariants Captured

- The REFL-024 cascade fix is real and durable (`50ae84ca`, `a2482e51`). Any
  future quarantine comment on integration test files MUST cite the actual
  observed failure, not the old cascade.
- `globalSetup` at `tests/integration/global-setup.ts` inherits `BASE_URL`
  correctly via `process.env.BASE_URL` — verified during isolated test run
  (ephemeral port 51278, clean startup and teardown).
- `FundCreateV1Schema` unit convention (decimal ratios for
  `managementFee`/`carryPercentage`) and strict-mode key rejection are
  intentional Phase 2A design, documented in-file. Future tests against
  `/api/funds` must use decimal ratios and only the 7 valid keys.

## Collateral Observation (Out of Scope for Phase 5)

During the full integration project run, two pre-existing flakes surfaced that
are unrelated to fund-idempotency:

- `tests/integration/variance-planner-leader-election.test.ts` — pre-existing
  flake from M8 (commit `aca1abdb`)
- `tests/integration/portfolio-activity-routes.test.ts` — pre-existing flake
  from M5 (commit `4d42e00a`)

Neither touches the fund-idempotency code path. Consistent with the "pre-push
warmer than cold full-suite" memory note — cold full-suite runs surface tail-end
flakes that the pre-push hook's warmer environment does not. Flagged as
out-of-scope for Phase 5 but worth a future triage pass in a dedicated
integration-flake sweep.
