# Phase 1B PR3 Proof — Forecast Comparison Contract Spike

## Scope exercised

- Validate the existing forecast comparison contract/read-model slice for
  `GET /api/funds/:id/results-comparison`
- Confirm contract shape, no-data/not-found semantics, and provenance-related
  fields
- Check whether the slice remains proof-only / non-production-facing
- Avoid widening `dashboard-summary`

## Files touched

- `.omx/proofs/phase-1b-pr3-forecast-contract.md` (this artifact)

## Relevant implementation evidence

- `shared/contracts/fund-results-comparison-v1.contract.ts`
- `server/services/fund-results-comparison-service.ts`
- `server/routes/fund-config.ts` (route mounted at
  `/api/funds/:id/results-comparison`)
- `tests/integration/fund-results-comparison-route.test.ts`
- `tests/setup/test-infrastructure.ts` was part of the proof plan, but the
  current proof uses the repo's existing integration runtime via
  `vitest.config.int.ts` and `tests/integration/setup.ts`

## Contract shape observed

The existing contract is a narrow summary-level read model:

- top-level:
  - `fundId: number`
  - `comparisonStatus: 'no_published_version' | 'no_previous_version' | 'comparable'`
  - `currentVersion: PublishedVersionSummary | null`
  - `previousVersion: PublishedVersionSummary | null`
  - `metricDeltas: MetricDelta[]`
- `PublishedVersionSummary` includes:
  - `version`
  - `publishedAt`
  - `calcRun` with run/status/dispatch metadata
  - `metrics` with `fundSize`, `reserveRatio`, `avgConfidence`,
    `yearsToFullDeploy`
- `MetricDelta` is limited to:
  - `fundSize`
  - `reserveRatio`
  - `avgConfidence`
  - `yearsToFullDeploy`

This remains narrower than a generic dashboard expansion and is compatible with
proof-first sign-off work.

## Authoritative-source assumptions observed

The service currently composes from persisted sources rather than
`dashboard-summary`:

- `fundConfigs` for published versions
- `calcRuns` filtered by `configVersion`
- `fundSnapshots` filtered by `type` and `configVersion`
- fund size from the published config blob or fund fallback
- snapshot mapping via existing results mappers

Inference: this supports the plan's requirement to avoid silently widening
`dashboard-summary`.

## Commands run

1. Inspect route mount and implementation:
   - `Get-Content server/routes/fund-config.ts | Select-Object -Skip 520 -First 60`
2. Inspect contract/service and route references:
   - `Get-Content shared/contracts/fund-results-comparison-v1.contract.ts`
   - `Get-Content server/services/fund-results-comparison-service.ts`
   - repo search for
     `results-comparison|fundResultsComparisonService|FundResultsComparisonV1Schema`
3. Initial test attempt (failed due wrong config):
   - `npx vitest run tests/integration/fund-results-comparison-route.test.ts`
4. Correct integration test run:
   - `npx vitest run --config vitest.config.int.ts tests/integration/fund-results-comparison-route.test.ts`

## Pass/fail evidence

### Passed

- `npx vitest run --config vitest.config.int.ts tests/integration/fund-results-comparison-route.test.ts`
  - Result: `1 passed` test file, `2 passed` tests
  - Verified behaviors:
    - route is mounted in the runtime
    - response body matches `FundResultsComparisonV1Schema`
    - not-found path returns `404` with `error: 'Fund not found'`

### Failed / adjustment

- `npx vitest run tests/integration/fund-results-comparison-route.test.ts`
  - Failed because the default Vitest config excludes `tests/integration/**`
  - This was a harness-selection issue, not a route failure

## No-data / not-found / provenance semantics

### Verified directly

- Not found: `null` from service becomes `404 Fund not found`
- No published version: test fixture path returns schema-valid response with:
  - `comparisonStatus: 'no_published_version'`
  - `currentVersion: null`
  - `previousVersion: null`
  - `metricDeltas: []`

### Provenance-related fields present

- `currentVersion` / `previousVersion` carry:
  - version number
  - publish timestamp
  - calc-run metadata
  - derived metrics
- `calcRun` includes enough metadata to support provenance-aware UI messaging:
  - run id
  - derived status
  - dispatch state
  - last calculated at
  - correlation id

### Remaining semantic gap

- The route is mounted in the full runtime already, so this is no longer purely
  an unmounted proof spike.
- I did not verify additional response-level capability flags for drift
  visibility here; the current contract is version-comparison oriented and
  narrower than the broader Phase 1B queue aspirations.

## Blockers

1. **Non-production-facing constraint is currently violated**
   - `server/routes/fund-config.ts` already mounts
     `/api/funds/:id/results-comparison` in the runtime.
   - That means the repo reality is ahead of a pure proof-only spike.
   - For sign-off, the queue should be revised to acknowledge this existing
     mounted route instead of describing PR3 purely as a future
     non-production-facing spike.

2. **Plan/reality mismatch on harness wording**
   - The proof plan references `tests/setup/test-infrastructure.ts` /
     `createSandbox()` as the preferred harness shape.
   - The current proof evidence came from the existing integration runtime and
     `vitest.config.int.ts` path instead.
   - This is not a functional blocker, but the queue/plan should reflect the
     actual harness used if that remains the preferred validation path.

## Dependencies

- **No hard dependency on PR1 route/perimeter baseline** for proving the narrow
  backend contract shape itself.
- **Soft dependency on PR1** if the team later wants to decide where/how any UI
  consumer should surface this comparison route. That surfacing decision remains
  out of scope here.
- **No Scenario Builder dependency encountered** in the backend comparison route
  proof. I did not need to resolve Scenario Builder semantics to validate the
  existing route contract.

## Queue revisions required before sign-off

1. Revise `docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md` so PR3
   reflects current repo reality:
   - the comparison contract/service/route already exist
   - the remaining work is to validate/narrow/document them and decide whether
     to keep, gate, or reshape them before broader Phase 1B rollout
2. Update PR3 wording from “create a contract spike” to something closer to:
   - validate existing contract against proof criteria
   - document mounted-vs-proof-only mismatch
   - avoid expanding it into broader live surface commitments before sign-off
3. Keep PR4/PR6 and Scenario Builder decisions explicitly out of scope.

## Verdict for PR3 proof lane

- **Artifact written:** yes
- **Contract proof status:** partially validated
- **Reason not fully clean:** the contract and route already exist in the
  mounted runtime, so the requested “non-production-facing spike” condition is
  not true in the current repo state.
- **Recommended sign-off interpretation:** treat this as evidence that the queue
  needs revision before approval, not as a reason to widen implementation scope.
