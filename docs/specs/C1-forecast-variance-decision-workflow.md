---
status: DRAFT
audience: agents
last_updated: 2026-09-09
owner: Repository Owner
scope: forecast-variance-decision-workflow-v1
source_sha: 8eac03568cd40bc4a00c21648a873badfc582b45
body_sha256: 77bdfbf12158e05bbb85458b3a580bea72423a4902ce02b5baba6add6dc8653e
approval_sha256: null
reviewed_by: null
reviewed_at: null
approved_by: null
approved_at: null
approval:
  state: unapproved
source_paths:
  - client/src/app/app-routes.tsx
  - client/src/components/dashboard/dual-forecast-dashboard.tsx
  - client/src/hooks/useDecisions.ts
  - client/src/pages/forecasting.tsx
  - migrations/meta/_journal.json
  - server/lib/database-backed-idempotency-routes.ts
  - server/route-policy/api-route-policy-registry.ts
  - server/routes/dual-forecast.ts
  - server/routes/internal-analysis.ts
  - server/routes/mount-common-routes.ts
  - server/routes/operating-object-decisions.ts
  - server/services/construction-forecast-calculator.ts
  - server/services/current-forecast-fund-lock.ts
  - server/services/current-forecast-reference-service.ts
  - server/services/current-forecast-serving-seam.ts
  - server/services/current-forecast-v2-service.ts
  - server/services/current-plan-version-service.ts
  - server/services/internal-analysis/analysis-checkpoint-service.ts
  - server/services/metrics-aggregator.ts
  - server/services/operating-objects/decision-evidence-link-service.ts
  - server/services/operating-objects/decision-service.ts
  - shared/contracts/current-forecast-v2.contract.ts
  - shared/contracts/current-plan-version-v1.contract.ts
  - shared/contracts/dual-forecast/dual-forecast-response.contract.ts
  - shared/contracts/financial-facts-snapshot-v1.contract.ts
  - shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts
  - shared/core/cohorts/CohortProjectionV2.ts
  - shared/routes/api-route-manifest.ts
  - shared/schema/current-forecast-references.ts
  - shared/schema/current-plans.ts
  - shared/schema/fund.ts
  - shared/schema/internal-analysis.ts
---

# C1 Forecast Variance Decision Workflow

## Goal

Define a server-authored forecast variance explanation that can be saved as an
immutable analysis reference and used to create one decision plus its evidence
link atomically.

## Non-Goals

- No client-side financial calculation.
- No new forecast-reference table.
- No decision task creation in the same command.
- No serving-mode activation, production action, or specification approval.

## Existing Surfaces and Actual Consumers

`DualForecastCurrentForecastV2Schema` already exposes `status: live | held`,
engine status `available | indicative | unavailable | failed | held`, snapshot
identity, hashes, and held metadata.
`AnalysisBasisSchema.forecastFundSnapshotId` already pins
`fund_snapshots.type = CURRENT_FORECAST_V2`. Analysis checkpoint save already
owns immutable-reference creation. Decisions and decision evidence links already
have fund-scoped persistence and idempotent link creation; C1 adds one shared
transaction around both existing operations.

## Normative Product Decisions

1. Missing `currentForecastV2` means no variance object. It is not an `off`
   state.
2. Preserve serving status and engine status independently.
3. `mixedBasisAtSave` maps to `basisStatus: mixed_basis`; stale source or hash
   maps to `stale`; otherwise `current`.

### Owner-selected source direction (September 7, 2026)

The owner selected `After-assumption`: first admit a distinct persisted
comparable after-assumption source. The empty-driver/twelve-omission contract
below records the inspected baseline. It is not the selected shipping contract
or an approval-ready definition of the after-source feature.

### Proposed pinned-pair contract (inactive pending exact-body review)

Reuse `current_plan_versions`, `current_forecast_references`, and typed
`fund_snapshots`; no new source table is proposed. The request pins
`beforeReferenceId`, `beforePlanVersionId`, `afterPlanVersionId`,
`afterForecastFundSnapshotId`, and `expectedServedReferenceId`. Persist those
identities with both plans' source-config ID/version, assumptions hashes, both
forecast input/result hashes, and the normalized eight-field facts basis. The
before forecast snapshot comes only from `beforeReferenceId.fundSnapshotId`; the
after snapshot must already exist as `CURRENT_FORECAST_V2` and name the
requested after plan. The request never supplies financial output values.

The after plan must directly supersede the before plan: both reciprocal links
must agree, and the after plan must remain the unique current plan head. The
before reference is loaded by ID even after supersession. The served pointer
must equal `expectedServedReferenceId`: either the before reference, or its
explicit direct successor whose snapshot is the pinned after snapshot. This
permits the intended predecessor transition, but refuses an intervening plan,
facts, or served-reference change. A held pointer is resolved by its held ID; no
latest-snapshot substitution or promotion is part of source resolution.

Both snapshots must be completed, hash-valid and comparable: same fund, full
facts basis (including policy, input/source hashes, as-of date and knowledge
cutoff), engine/methodology and plan-transformation versions, USD measure and
units, forecast as-of date, ordered quarter boundaries, and actual/projected
classification. Source config versions and assumptions hashes may differ only as
recorded assumptions changes. An unavailable/indicative leg, missing field,
different horizon or mixed legacy-null/qualified basis refuses an actionable
comparison; do not trim horizons, convert ratios into dollars, or fill zeros.

The permitted producer in this proposal is an already persisted matching after
row from existing plan/forecast services, with its completed run identity. C1
never calls mint/recompute during comparison or save. `mintCurrentPlanVersion`
currently selects latest config/facts; its existing idempotency does not make
that a pinned mint contract. If the pair is absent, return source-unavailable. A
future pinned producer needs separate review of expected config/facts/plan
heads, canonical replay, completion identity and rollback before it is allowed.

For a new save, acquire the shared fund transaction lock, re-read facts/plan/
served heads and immutable rows, validate the whole pair, then save reference
and evidence material atomically with the existing draft version check. Plan,
facts and served-head writers must share that serialization boundary or provide
an equivalent database fence proven by a two-client race. A reader-only lock is
insufficient. Decision/link creation rechecks the saved pair and absence of an
analysis-reference successor under the same lock. Any losing head/version check
or insert failure leaves zero reference/decision/link rows. After current
authorization and same-fund checks, same-key/same-material replay returns the
committed response even if heads later advance; changed material conflicts. A
new key must pass current-head checks. Uncertain commit recovery reads the
existing command outcome; it never silently rebases or remints.

### Proposed attribution and reconciliation

Input changes and forecast effects are separate fields. A driver effect requires
persisted output evidence under a reviewed method: baseline one-factor changes
with an explicit residual. For each admitted driver group, hold the pinned
before input fixed except that group's after values; persist the completed
counterfactual identity/hash under the same comparable basis. Its effect is
counterfactual output minus before output for the named measure/period. The
residual is paired total change minus the sum of admitted driver effects; it
contains interactions and any unattributed change, never an invented driver.
Display it even when zero, with its measure/unit and method version. A missing
counterfactual produces a typed omission, not a zero effect. No counterfactual
producer or category-to-engine mapping is admitted by this draft.

Synthetic acceptance arithmetic: before output USD 100, after USD 125, two
independently specified counterfactual outputs USD 110 and USD 112 give effects
10 and 12, residual 3, total 25. This checks reconciliation, not an economic
mapping. Store Decimal strings, compute before rounding and reconcile emitted
units; do not hide rounding in a driver. The twelve baseline omissions and four
observed input categories below establish neither shipping scope nor completed
attribution. Exact-body review must approve each delivered mapping and its
independent economic example before that driver is implemented.

The supplied F1 transaction ledger is actuals context, not persisted forecast
assumptions. Do not fill its unknowns or derive after assumptions from it.
Refresh the body hash after revision. This spec remains `DRAFT` with all review
and approval metadata unset pending exact-body approval. The inactive sequencing
exception in the reconciled program plan could permit only source-contract work
and isolated synthetic tests after its own named owner approval. All other
Program A and runtime gates remain in force.

## Request and Response Contracts

The wire sketches below characterize the earlier same-plan baseline. They must
be replaced with the reviewed pinned-pair and attribution contract above before
Task 1; they are not an alternative shipping contract.

```ts
type ForecastVarianceState = {
  servingStatus: 'live' | 'held';
  engineStatus: 'available' | 'indicative' | 'unavailable' | 'failed' | 'held';
  basisStatus: 'current' | 'stale' | 'mixed_basis';
};

type ForecastVarianceDriver = {
  driver:
    | 'check_size'
    | 'entry_valuation'
    | 'ownership'
    | 'pace'
    | 'allocation_mix'
    | 'graduation_exit'
    | 'follow_on_participation'
    | 'deployed_reserves'
    | 'remaining_reserves'
    | 'fees_expenses'
    | 'recycling'
    | 'blockers';
  beforeSource: ForecastVarianceSourceReference;
  afterSource: ForecastVarianceSourceReference;
  before: string;
  after: string;
  delta: string;
  unit: string;
  explanation: string;
};
```

Decision creation uses `POST /api/funds/:fundId/evidence-linked-decisions` with
required `Idempotency-Key`, existing decision fields, and target
`{ kind: 'analysis_reference', id }`.

### Historical comparison sources and baseline omissions

`beforeSource` is the pinned `CurrentPlanVersionV1` ID and `assumptionsHash`.
`afterSource` is the accepted or held current-forecast reference plus its
same-fund persisted `CURRENT_FORECAST_V2` `fundSnapshotId` and `resultHash`. The
server must read the after payload from that snapshot row. Reloading the plan as
an after value is forbidden.

The persisted V2 payload contains `currentPlanVersionId`, `assumptionsHash`,
forecast `series`, `remainingDeployableCapitalUsd`, `projectedFeesRemainingUsd`,
and availability state. It does not persist a second check-size,
entry-valuation, ownership, allocation, graduation, follow-on, or recycling
assumption snapshot. Its `currentPlanVersionId` is the same plan used for
`beforeSource`; those plan fields cannot produce a variance.

The dual-forecast construction series is generated on request from fund/config
by `metrics-aggregator.ts` and `construction-forecast-calculator.ts`; it is not
stored in the accepted current-forecast reference or V2 snapshot. The V2 cohort
engine persists cumulative `deployedUsd`, point-in-time contributions,
distributions, NAV, and ratios, but no immutable construction-side series with
the same horizon. Therefore current `source_sha` supports no numeric or
categorical driver. `drivers` must be empty and all twelve taxonomy entries must
appear as omissions in this exact order:

| Driver                  | Persisted-source finding                                                                                         | Exact omission reason                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| check size              | plan has `averageInitialCheckUsd`; V2 has only same-plan identity/hash, not a distinct value                     | `after_assumption_snapshot_unavailable` |
| entry valuation         | `CurrentPlanVersionV1` and V2 have no entry-valuation field                                                      | `before_assumption_field_unavailable`   |
| ownership               | `CurrentPlanVersionV1` and V2 have no target-ownership field                                                     | `before_assumption_field_unavailable`   |
| pace                    | plan has quarterly deployment percentages; V2 series is a same-plan cohort output with a different as-of horizon | `after_comparable_series_unavailable`   |
| allocation mix          | plan has allocation capital; V2 has no allocation-keyed after breakdown                                          | `after_assumption_snapshot_unavailable` |
| graduation/exit         | plan has graduation/exit assumptions; V2 has only same-plan identity/hash                                        | `after_assumption_snapshot_unavailable` |
| follow-on participation | plan has `followOnParticipationPct`; V2 has only same-plan identity/hash                                         | `after_assumption_snapshot_unavailable` |
| deployed reserves       | V2 has cumulative `deployedUsd`; no persisted immutable construction-side deployed series exists                 | `before_comparable_series_unavailable`  |
| remaining reserves      | plan deployable capital is an initial pool; V2 remaining deployable capital is an as-of residual                 | `comparable_horizon_unavailable`        |
| fees/expenses           | plan annual fee-drag ratio and V2 projected-fees-remaining dollars are different measures/units                  | `comparable_measure_unavailable`        |
| recycling               | plan exposes only `reservePolicyVersion`; neither source persists comparable recycling settings                  | `before_assumption_field_unavailable`   |
| blockers                | V2 has `unavailableReasons`; no persisted construction-side blocker state exists                                 | `before_comparable_state_unavailable`   |

Structural refusal precedence remains `mixed_basis`, `stale_reference`,
`source_missing`, `source_ambiguous`, then `snapshot_identity_mismatch`. After
structural verification, omissions use the taxonomy order above, independent of
object iteration order. Each omission carries both pinned source identities and
its exact reason. No literal available-driver example is valid at this source
baseline.

The twelve-omission behavior above is inspected baseline characterization only.
It is not the selected shipping contract or approval-ready after-source
admission. Revise and regenerate this interface after the source-contract
revision/review gate before selected delivery.

### Served-reference resolution

- For `status: live`, load
  `getAcceptedCurrentForecastReferenceHead({ fundId })`. It must be the unique
  `candidate = false`, non-superseded accepted head.
- For `status: held`, require `held.referenceId` and load exactly
  `getCurrentForecastReferenceById({ fundId, referenceId })`. This is the
  cutover pointer head; never substitute latest accepted or latest snapshot.
- The reference supplies `fundSnapshotId`; the wire block supplies no such ID.
- Require equality across wire block and reference for fund,
  `financialFactsSnapshotId`, `inputHash`, `resultHash`, `assumptionsHash`,
  `engineVersion`, and `methodologyVersion`. Then load the same-fund
  `fund_snapshots` row `(fundSnapshotId, CURRENT_FORECAST_V2)` and verify its
  persisted payload and hashes against the reference.

### Complete strict wire object

```ts
type ForecastVarianceOmissionReason =
  | 'after_assumption_snapshot_unavailable'
  | 'before_assumption_field_unavailable'
  | 'after_comparable_series_unavailable'
  | 'before_comparable_series_unavailable'
  | 'comparable_horizon_unavailable'
  | 'comparable_measure_unavailable'
  | 'before_comparable_state_unavailable';

type ForecastVarianceOmission = {
  driver: ForecastVarianceDriver['driver'];
  reason: ForecastVarianceOmissionReason;
  beforeSource: ForecastVarianceSourceReference;
  afterSource: ForecastVarianceSourceReference;
  detail: string;
};

type ForecastVarianceV1 = {
  contractVersion: 'forecast-variance-v1';
  fundId: number;
  currentForecastReferenceId: number;
  forecastFundSnapshotId: number;
  state: ForecastVarianceState;
  basis: {
    financialFactsSnapshotId: number;
    inputHash: string;
    resultHash: string;
    assumptionsHash: string;
    engineVersion: string;
    methodologyVersion: string;
  };
  drivers: ForecastVarianceDriver[];
  omissions: ForecastVarianceOmission[];
  evidenceHash: string;
};
```

Schema is strict. At this `source_sha`, `drivers` is exactly `[]`; omissions
contain all twelve taxonomy entries in normative order with both pinned source
identities and exact reasons. `evidenceHash` is `sha256CanonicalJson` of every
field except `evidenceHash` itself.

## Authoritative Inputs and Source Versions

The server reads the served dual-forecast block and pinned `CURRENT_FORECAST_V2`
snapshot. It verifies fund ownership plus persisted `inputHash`, `resultHash`,
and `assumptionsHash`. Drivers must cite pinned source IDs and versions. No
browser-derived value is authoritative.

## Persistence and Hash Semantics

Reuse `forecastFundSnapshotId`. Saved analysis-reference material includes the
full state, ordered driver list, ordered omission list, and verified source
hashes. The evidence-linked decision request hash covers decision material and
exact evidence target. Decision and evidence-link rows commit in one
transaction.

Persist nullable `forecast_variance` JSONB and `forecast_variance_hash char(64)`
on drafts and references, with a check that both are null or both non-null.
Strict-parse the stored object and require the stored hash equals `evidenceHash`
before save and on load.

## Idempotency, Concurrency, and Recovery

Same key and same canonical material returns the stored response. Same key with
different material returns conflict. Any validation, decision insert, or link
insert failure rolls back both rows. Later decision transitions keep existing
`If-Match`/`xmin` behavior.

## Refusal Matrix

| Condition                        | Result                          | Durable writes  |
| -------------------------------- | ------------------------------- | --------------- |
| V2 block absent                  | variance omitted                | 0               |
| Mixed basis or stale source/hash | typed non-actionable state      | 0 decision/link |
| Wrong snapshot type or fund      | `EVIDENCE_TARGET_NOT_FOUND`     | 0               |
| Snapshot hash mismatch           | typed stale refusal             | 0               |
| Evidence inaccessible            | authorization/not-found refusal | 0               |
| Same key, different material     | idempotency conflict            | 0               |
| Decision or link insert fails    | transactional failure           | 0               |

The refusal matrix also treats missing accepted/held reference, missing
`fundSnapshotId`, and any wire/reference/snapshot equality failure as typed
stale evidence with zero analysis-reference, decision, or evidence-link writes.

## Authorization and Fund Ownership

Existing authenticated fund scope and write-role rules apply. Snapshot, analysis
reference, decision, and evidence link must share `fundId`; inaccessible targets
are not disclosed.

## UI States and Accessibility

Render state, omissions, driver source/version, and action eligibility as text.
Status cannot rely on color. Decision action is absent or disabled with an
associated explanation. Keyboard order reaches explanation before action; live
changes announce through an existing polite status region.

## Exact File Manifest

Only paths present at `source_sha` appear below. Files marked `Create` or
otherwise absent at that baseline in the companion implementation plan are
prospective and intentionally have no baseline hash.

| Source path                                                                     | SHA-256 at `source_sha`                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `client/src/app/app-routes.tsx`                                                 | `c074b27e602b21908e63ecf41df5aadb6615beb65df529d3c8ee79d4cc94612c` |
| `client/src/components/dashboard/dual-forecast-dashboard.tsx`                   | `9243e503d9784df8ca4d7c94ff8099396e8322b05ef55ca10f31335c1b1567ce` |
| `client/src/hooks/useDecisions.ts`                                              | `1ede4ffc07a385d0653c64f01a60d7f76bb44dcfb6e62c943cc25328ec4514dc` |
| `client/src/pages/forecasting.tsx`                                              | `f51c4964a7faf197a1da57d5861aa430e8aaa401ee55a2398940d445ae702b95` |
| `migrations/meta/_journal.json`                                                 | `5df1a9a2bb3eeb29f4c815df0f93b826c61b917fd9a6a9e66e75f336914a41d7` |
| `server/lib/database-backed-idempotency-routes.ts`                              | `68291c7e21953f01c345d43594d28aa4394fe43c7129a231d48a037ba3743346` |
| `server/route-policy/api-route-policy-registry.ts`                              | `c66584f968ad08652fb0a9a9de02547d0aebe43e9f5162bcfff7b3fcb2bb80dd` |
| `server/routes/dual-forecast.ts`                                                | `a70c7af05aa2bb9aff5c04ff589124d7b198216302c1e11d0fb95c9f26982289` |
| `server/routes/internal-analysis.ts`                                            | `884e6642e89bcaed6a1cfc86dd4e4ac8611c8a5f4b495ee337424954dc25e6d9` |
| `server/routes/mount-common-routes.ts`                                          | `ef578b006cfb7e8819d92a1d86948c5568f4a893236f46d926f7a2cb6ca67feb` |
| `server/routes/operating-object-decisions.ts`                                   | `b3e08e9e169cd9d40c055f518f83f7ebd96c52c3a8669c1d088e257fb964da6c` |
| `server/services/construction-forecast-calculator.ts`                           | `70c09e63729d4eb3c634e2075b7e6fc1c6fb1341803786e8de529ff8be0219c2` |
| `server/services/current-forecast-reference-service.ts`                         | `46f047d740834e9338bf65226470c203117394136cd98b99cb15bdf0e8cb5211` |
| `server/services/current-forecast-serving-seam.ts`                              | `40cdfe4c0c19afcb4e81249f230448ca7dced6e8afa1296be7c19c838a394e0b` |
| `server/services/current-forecast-v2-service.ts`                                | `b30e600d84194e20beaa455b1c5f7baadc559855c2e8abdc58bd57abedca3845` |
| `server/services/current-plan-version-service.ts`                               | `9c34411eb59afe150131cf84bdd996f9c95b00ac26371d450ac1edbcca0556f9` |
| `server/services/internal-analysis/analysis-checkpoint-service.ts`              | `ead85eec1340799ab9811b0279fbbb5aa8ec494e823299d8e6ec0d70de874a1d` |
| `server/services/metrics-aggregator.ts`                                         | `5e0bb33bae27ce90f6f4b1f8b4fdfb9668bf35a3d57971039052b6687a4d9273` |
| `server/services/operating-objects/decision-evidence-link-service.ts`           | `a3e0c8407ed074bcac79e1bedd484454541f3a5528a8c4e6c72fac93bf775d1d` |
| `server/services/operating-objects/decision-service.ts`                         | `75cbe9387a3545a2b4cf14fd3a966413704c31d066e6b72e17ae7b087791ed4c` |
| `shared/contracts/current-forecast-v2.contract.ts`                              | `31cdc70c80ae2bc44dc14bafb22cb63d1c105636a54dc74fc27cfe43c71d079a` |
| `shared/contracts/current-plan-version-v1.contract.ts`                          | `6285a60f235f8746e0d033ca831284a0f9c5dd2c968e55537683bd5f40430783` |
| `shared/contracts/dual-forecast/dual-forecast-response.contract.ts`             | `3be6f63fbb01d16c67e17c3b6fb2c55f88d62c8d1b78f66f2e31539a5dbc165b` |
| `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts` | `172784d4420a642ea7fd1598f3bc94b94290ce078913fcfdf6f1957cbafb5c8a` |
| `shared/core/cohorts/CohortProjectionV2.ts`                                     | `f26413186d775215c4898173284e628db3d102fb2f468d2623103c211ab4ee7a` |
| `shared/routes/api-route-manifest.ts`                                           | `c960d2ec93fba084097a25323bb1ac42aa6c521769adc026a8ab950f9d7ad2f0` |
| `shared/schema/current-forecast-references.ts`                                  | `5b99f2d81c0e296e011f10389dc086dcfff4e734848db1dcbf56e415c8c1811e` |
| `shared/schema/fund.ts`                                                         | `d7be982c71e9b5155877599fc91d00f9a550f256d11082c31b76cfea88ffb42e` |
| `shared/schema/internal-analysis.ts`                                            | `cec76ded14bacadaed806859ebfc890902462e95dabb50c74b08ef900dd40b01` |
| `server/services/current-forecast-fund-lock.ts`                                 | `d1173cc630a88b50a4512d8a76ec3c77820fb50f10d49eb0bc2b97212f9e60a3` |
| `shared/contracts/financial-facts-snapshot-v1.contract.ts`                      | `eb8280651669b9cc63b53a44d8cd01068f522a0f695405a80313c41a4bf52e1e` |
| `shared/schema/current-plans.ts`                                                | `bfb75d0bf6e7eaaec5b3bfeefbcdbdb019334faedc6801cd32a554a6ac3cb37b` |

## Exact Test Manifest

- `tests/unit/contracts/forecast-variance-v1.contract.test.ts`: pinned pairs,
  every comparability mismatch, driver omissions and 10 + 12 + 3 = 25 residual;
  all serving/engine/basis mappings and omitted V2 block.
- `tests/unit/client/forecast-variance-display.test.tsx`: display only, no
  derived delta, keyboard and screen-reader states.
- `tests/integration/internal-analysis/forecast-variance-reference.pg.test.ts`:
  snapshot type/fund/hash verification, reciprocal successor links, all eight
  facts fields, plan/facts/served-head races, stale draft version, replay after
  head advance, uncertain commit recovery and zero-write rollback.
- `tests/integration/operating-decisions/evidence-linked-decision.pg.test.ts`:
  replay, conflict, cross-fund, inaccessible evidence, rollback.
- `tests/e2e/forecast-variance-decision.spec.ts`: actionable and non-actionable
  workflows.

## Admission and Rollout Gates

Draft completion is not approval. The proposed narrow Task 1 exception remains
inactive until exact-body specification review and explicit named repository
owner approval of that exception. Without both, Program A A4 GO, verified
activation/containment and final bound runtime identity still gate all product
implementation. The exception would cover only source-contract implementation
and isolated synthetic tests; persistence/decision/UI Tasks 2-3 remain gated.
Source admission, deployment, serving and production action remain separate
gates.
