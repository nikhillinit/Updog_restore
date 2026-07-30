# Task 16.3 GO Readiness Briefs

Date: 2026-07-30 Status: Accepted; scoped production implementation gate GO
Scope: Ratified readiness basis for WP-L2, WP-L3, and WP-L4 implementation in
`2026-07-30-task163-deal-by-deal-scoping-design.md`

## Outcome

Task 16.3 scoped production implementation gate is GO. Waterfall-specialist and
Phoenix precision-guardian independently re-signed the reconciled contracts on
2026-07-30 against exact SHA `d2b39f7db476ca8a7497b21688c79e1178a6a352`.
Completed readiness basis:

1. legacy characterization is merged without changing the legacy engine;
2. production activation cannot bypass schema reconciliation;
3. a directly attested opening accounting state can be pinned into an immutable
   financial-facts snapshot without DDL;
4. V1 fee compatibility is limited to an exact zero-fee, zero-expense proof and
   rejects every nonzero, absent, or ambiguous case;
5. the legal capital envelope, main-fund scope, forecast realization grain, and
   compound-hurdle semantics are frozen;
6. the remaining credit-facility deviation is resolved as a reserved seed-time
   refusal whose source field is structurally unreachable today.

GO authorizes WP-L2 compiler/state-machine, WP-L3 service/persistence, and WP-L4
restricted-route implementation. Migrations may appear only in reviewed owning
implementation PRs. GO does not authorize deployment, activation, production
traffic, or claim feature availability. No production economics engine exists at
ratification. A future float64 path remains at most `indicative`; `available`
stays typed-but-unreachable until the separately certified Decimal-native money
core condition in ADR-065 is met.

## Decision Summary

| Gate            | Ratified decision                                                                                             | Current state                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| WP-CHAR         | Keep `LEGACY-*` fixtures isolated from product truth                                                          | Complete; merged characterization plus corrected same-input `LEGACY-04`/`LEGACY-05` counterparts      |
| #1179           | Set versioned Vercel `github.autoAlias=false`; production traffic moves only through `release-production.yml` | Complete; removed release blocker but did not independently open Task 16.3                            |
| B1              | Pin a directly attested JSON source artifact into financial facts payload v3                                  | Complete; contract, builder, route, and source-reachability proofs exist                              |
| B2              | Support only explicit zero fees and zero expenses                                                             | Complete; all nonzero, absent, or ambiguous fee/expense inputs remain runtime-ineligible              |
| Envelope        | Freeze immutable legal-envelope contract                                                                      | Ratified; persistence and migration only in reviewed owning WP-L3 PR                                  |
| Vehicle scope   | V1 stays single-vehicle                                                                                       | Ratified; SPV/co-invest-bearing funds remain runtime-ineligible; legacy `fund_all` behavior unchanged |
| Realizations    | One labeled synthetic quarterly aggregate per forecast point in no-hurdle V1                                  | Ratified; full-precision aggregation-invariance proof exists                                          |
| Event ordering  | Derive versioned canonical order keys; do not duplicate fields in persisted facts                             | Ratified; readiness contract and permutation proof exist                                              |
| Precision       | Full-precision state and hierarchical presentation-only LRM                                                   | Clean GO                                                                                              |
| Compound hurdle | Corrected unreturned-capital semantics with Decimal math                                                      | Semantics ratified; policy schema V1.1 remains separately gated                                       |
| Credit facility | Reserved seed-time `422 CREDIT_FACILITY_UNSUPPORTED`                                                          | Ratified; structurally unreachable and strict-schema guarded                                          |

## Release-Schema Activation Remediation (#1179)

### Decision

Use governed-only production promotion.

`vercel.json` sets:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "github": {
    "autoAlias": false
  }
}
```

Vercel may build a merge commit, but Git integration must not move production
domains. The only authorized traffic movement is:

```text
exact main SHA
  -> full release proof
  -> clean production schema audit
  -> exact staged deployment identity
  -> authenticated staged smoke
  -> explicit Vercel promotion
  -> authenticated production smoke
```

This keeps production credentials and schema mutation on trusted merged code. No
pull-request-controlled JavaScript, package installation, workflow, or SQL runs
with `PRODUCTION_DATABASE_URL`.

### Manifest completeness

Production reconciliation is complete only when every canonical forward
migration from `0031` onward appears in exactly one production manifest.
Manifests are added for:

- `0031_user_identity_grants_revocation.sql`;
- `0033_company_scenario_create_requests.sql`;
- `0034_business_time_comparison_lineage.sql`.

The existing `0032` and `0035` through `0044` migrations are already
manifest-owned. A unit guard enforces the exact-one rule for this entire forward
range, so the next unmanifested migration fails CI.

`0034` contains an index replacement and therefore is audit-visible but not
eligible for the additive-safe automated apply command. Missing `0034` shape
requires the existing explicit human reconciliation path, followed by a clean
audit. The automated apply allow-list is not weakened.

### Completed runtime proof

The merge containing `github.autoAlias=false` is the canary:

1. Vercel completes the merge deployment.
2. Production domain remains on the prior deployment.
3. GitHub/Vercel metadata identifies whether the unaliased main build is
   `target=production` or `target=preview`.
4. If it is `target=production`, the existing release workflow consumes it.
5. If it is `target=preview`, the trusted release workflow creates a staged
   production deployment with `vercel --prod --skip-domain`; target validation
   remains strict.
6. Release workflow promotes the exact main SHA only after schema audit and
   staged smoke.

Release remediation landed through
[PR #1247](https://github.com/nikhillinit/Updog_restore/pull/1247) and
[PR #1248](https://github.com/nikhillinit/Updog_restore/pull/1248).
[Release Production run 30567774563](https://github.com/nikhillinit/Updog_restore/actions/runs/30567774563)
completed successfully against exact SHA
`068430726a0d1d297d50e93be36a67f90238a26a`. Its production schema audit was
clean and performed no DDL. It created and inspected staged deployment locator
`5fB4SsnPTmF76xw13nRQhwFf55jb`, passed 12/12 authenticated staged smoke tests,
promoted that exact deployment, and passed 12/12 authenticated production smoke
tests. GitHub production deployment `5679938936` recorded success for the same
SHA. Issue [#1179](https://github.com/nikhillinit/Updog_restore/issues/1179)
closed on 2026-07-30.

This completed release proof removed #1179 as a release blocker. It did not
independently open the Task 16.3 production implementation gate; the later
exact-SHA dual-specialist ratification did.

## Brief 1: Authoritative Opening Accounting State

### Authority

V1 accepts one direct observation attested by an admin at financial-facts
snapshot creation. The observation originates in an existing fund-scoped
`source_artifacts` row whose JSON bytes and SHA-256 digest are persisted.
Financial-facts builder parses those exact stored bytes; it never trusts a
second copy of the monetary fields in the snapshot request.

This is payload-only work. No new table or migration is required for this
readiness contract.

### Source artifact contract

Contract ID:

```text
fund-accounting-state-observation/1.0.0
```

Canonical JSON shape:

```text
contractVersion
cutoverInstant
currency = USD
cashBalanceUsd
cumulativeLpPaidInUsd
cumulativeGpPaidInUsd
lpUnreturnedContributedCapitalUsd
gpUnreturnedContributedCapitalUsd
lpDistributionsReturnOfCapitalUsd
lpDistributionsProfitUsd
actualLpDistributionsCumulativeUsd
gpInvestmentDistributionsPaidUsd
gpCarryPaidUsd
accruedPreferredReturnUsd
accruedPreferredReturnThroughInstant
recallableDistributionsCumulativeUsd
recallableDistributionsOutstandingUsd
recycledProceedsCumulativeUsd
realizedProceedsCumulativeUsd
methodologyVersion
```

All money fields are canonical six-decimal nonnegative strings. V1 rejects a
negative cash balance because credit-facility support is absent.

Required identities:

```text
actualLpDistributionsCumulativeUsd
  = lpDistributionsReturnOfCapitalUsd
  + lpDistributionsProfitUsd

recallableDistributionsOutstandingUsd
  <= recallableDistributionsCumulativeUsd

accruedPreferredReturnThroughInstant
  = cutoverInstant
```

For a V1 policy with `hurdleBasis='none'`, `accruedPreferredReturnUsd` must be
`0.000000`. A future `annualized_compound` policy consumes the authoritative
accrued balance rather than silently restarting preferred return at cutover.

### Facts contract

Add:

```text
financial-facts-policy/1.2.0
financial-facts-payload/3
```

Payload v3 extends payload v2 with:

```text
openingAccountingState = null | {
  sourceArtifactId
  sourceArtifactSha256
  sourceArtifactCreatedAt
  attestedByActorId
  observation
}
```

The full object participates in `snapshotInputHash`. Existing persisted
policy/payload versions remain readable through the discriminated union. New
snapshots emit payload v3; missing artifact input emits
`openingAccountingState: null`.

Builder acceptance rules:

- source artifact belongs to the requested fund;
- artifact source type is `manual` or `structured_paste`;
- media type is `application/json`;
- payload exists and is not purged;
- artifact `createdAt <= knowledgeCutoff`;
- `cutoverInstant <= knowledgeCutoff`;
- UTC date of `cutoverInstant` equals snapshot `asOfDate`;
- stored bytes parse under the strict observation schema;
- authenticated admin creating the snapshot becomes `attestedByActorId`.

Typed failures:

```text
OPENING_ACCOUNTING_STATE_ARTIFACT_NOT_FOUND
OPENING_ACCOUNTING_STATE_ARTIFACT_PURGED
OPENING_ACCOUNTING_STATE_ARTIFACT_INVALID
OPENING_ACCOUNTING_STATE_AFTER_CUTOFF
OPENING_ACCOUNTING_STATE_AS_OF_MISMATCH
```

An absent artifact ID is not a builder failure. It produces a valid snapshot
with a genuinely missing opening state; future economics seeding maps that case
to `OPENING_CASH_UNAVAILABLE`.

### Cutover

Opening state is inclusive through `cutoverInstant`.

```text
actual audit rows: effectiveAt <= cutoverInstant
projected rows:    effectiveAt > cutoverInstant
```

Actual rows remain audit/output history and are not replayed into the already
inclusive opening state. Forecast "actual" rows are never consumed.

Canonical ordering is governed by:

```text
internal-economics-event-ordering/1.0.0
order key = (effectiveAt, eventClassPriority, stableSourceId)

1 lp_capital_call
2 portfolio_investment
3 fund_expense
4 realized_proceeds
5 lp_distribution
6 recallable_distribution
```

Persisted facts already carry `eventType`, `effectiveAt`, and `eventId`.
`eventClassPriority` derives from `eventType`; `stableSourceId` derives from the
post-insert `snapshotId` and `eventId`. Neither derived field is persisted
redundantly. Stable source IDs are:

```text
facts:<factsSnapshotId>:cash_flow_event:<eventId>
forecast:<forecastSnapshotId>:quarter:<periodEnd>:forecast_quarterly_distribution
```

Forecast quarterly distributions use canonical event type
`forecast_quarterly_distribution`, class priority `4`, and
`effectiveAt = <periodEnd>T23:59:59.999Z`.

V1 requires opening-state `cutoverInstant` to equal the run cutover. It does not
silently roll a stale observation forward.

## Brief 2: Exact Fee/Expense Vector Bridge

### Supported branch

V1 supports only explicit zero-fee and zero-expense economics.

Compatibility requires all of:

```text
policy management fees = explicit zero
policy fund expenses = explicit empty/zero
source config fee schedule = explicit zero
source config expenses = explicit empty
current plan annualFeeDragPct = 0
current plan deployableCapitalUsd = legal envelope totalCommitmentUsd
forecast committedCapitalUsd = legal envelope totalCommitmentUsd
forecast projectedFeesRemainingUsd = 0
every quarterly fee/expense channel = 0.000000
```

Missing is unknown, never zero. A nonzero schedule that happens to compile to a
zero flat rate is incompatible.

### Three-channel identity

The bridge proves zero at:

1. upstream deployable-capital reduction;
2. forecast NAV-embedded fee drag;
3. economics cash debits for management fees and fund expenses.

For every quarter:

```text
scheduledManagementFeeUsd
= scheduledFundExpenseUsd
= planUpfrontFeeReserveUsd
= forecastNavEmbeddedFeeUsd
= economicsFeeCashDebitUsd
= economicsExpenseCashDebitUsd
= 0.000000
```

Therefore:

```text
deployableCapital = forecastCommittedCapital = totalCommitment
forecastNetNav = forecastGrossNav
```

The canonical vector, horizon, application mode, compiler version, and capital
base form `effectiveFeeExpenseHash`.

Any nonzero, absent, or ambiguous input returns:

```text
FORECAST_FEE_BASIS_INCOMPATIBLE
```

Nonzero fee support remains closed until forecast exposes gross/pre-fee NAV or
an exact quarterly basis-aware vector.

## Brief 3: Immutable Legal Capital Envelope

Contract ID:

```text
capital-envelope/1.0.0
```

Future persistence entity:

```text
internal_capital_envelope_versions
  id
  fundId
  version
  mainFundVehicleId
  lpCommitmentUsd
  gpCommitmentUsd
  totalCommitmentUsd
  currency = USD
  effectiveAt
  sourceArtifactId
  sourceConfigId
  sourceConfigVersion
  sourceConfigHash
  attestedBy
  attestedAt
  envelopeHash
  parentEnvelopeVersionId
  idempotencyKey
  requestHash
  createdAt
```

Invariants:

```text
lpCommitmentUsd >= 0
gpCommitmentUsd >= 0
totalCommitmentUsd > 0
lpCommitmentUsd + gpCommitmentUsd = totalCommitmentUsd exactly
currency = USD
vehicle belongs to fund
vehicle type = main_fund
unique (fundId, version)
unique (fundId, idempotencyKey)
```

Rows are append-only. Corrections insert a child version. Economics policy
references an exact envelope version.

Seed authority is an operator-attested legal source. `funds.size`,
deployable-capital output, and optional GP commitment are modeling inputs and
cannot independently establish legal commitment. LP may be derived as
`total - GP` only after both total and GP sources are authoritative.

Persistence and any migration belong only in the reviewed owning WP-L3
implementation PR; this brief completed the design gate.

## Brief 4: Vehicle Scope and Forecast Realization Grain

V1 remains eligible only when the roster contains exactly one `main_fund`
vehicle. Any SPV or co-invest row yields:

```text
MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE
```

Full SPV-bearing support requires coordinated vNext contracts:

- financial facts with `vehicleScope='main_fund'`, `scopeVehicleId`, scoped NAV,
  fixed perspective roles, and explicit exclusions;
- current plan with scope, vehicle, and capital-envelope version;
- current forecast with the same scope and basis lineage.

Legacy `fund_all` getters must filter by scope so a scoped snapshot can never
become the latest legacy snapshot accidentally.

### V1 realization decision

Each projected forecast point with positive `distributionsUsd` becomes one
event:

```text
eventType = forecast_quarterly_distribution
granularity = quarterly_aggregate
sourceKind = synthetic_forecast_series
eventClassPriority = 4
effectiveAt = <periodEnd>T23:59:59.999Z
stableSourceId = forecast:<forecastSnapshotId>:quarter:<periodEnd>:forecast_quarterly_distribution
amountUsd = forecast point distributionsUsd
sourceRef = {
  forecastSnapshotId,
  forecastResultHash,
  periodStart,
  periodEnd
}
```

No company, security, deal, or cohort identity is invented. The event is never
labeled `forecast_exit`.

This aggregation is authorized only for V1 `hurdleBasis='none'`. At full
precision, split versus aggregate proceeds are partition-invariant only with the
same opening `U`, a constant carry rate, nonnegative proceeds, no preferred
return or catch-up, and no exogenous `U` mutation between compared proceeds. ROC
reductions caused by those proceeds are allowed and required:

```text
roc = min(openingUnreturnedCapital, sum(proceeds))
residual = max(0, sum(proceeds) - openingUnreturnedCapital)
gpCarry = carryPct * residual
lpProfit = residual - gpCarry
```

Per-event cent rounding is not partition-invariant. The fixture therefore proves
the full-precision theorem, includes an intervening-capital-call counterexample,
and pins cent-rounding sensitivity. The quarterly aggregate is the canonical
source grain; it does not claim parity with an unknown event-level decomposition
or row identity.

The decision automatically reopens before `annualized_compound` V1.1 because
within-quarter timing can change preferred return.

## Brief 5: Compound-Hurdle Semantics

Waterfall-specialist and Phoenix precision-guardian ratified these compound
semantics on 2026-07-30. Policy schema V1.1 remains separately gated and may add
`annualized_compound` only in its own reviewed implementation scope.

State at instant `t`:

```text
U = LP unreturned contributed capital
A = unpaid accrued preferred return
r = effective annual hurdle rate
t = accrual-through instant
```

Both `U` and `A` seed from the authoritative opening accounting observation. The
observation's `accruedPreferredReturnThroughInstant` must equal cutover. Missing
or stale preferred-return state yields:

```text
OPENING_PREFERRED_RETURN_STATE_UNAVAILABLE
```

For the next event instant `e`, using exact elapsed UTC seconds:

```text
d = (e - t) / 86,400
F = (1 + r)^(d / 365)
A_after_accrual = A + (U + A) * (F - 1)
t = e
```

This is Actual/365 Fixed with an effective annual rate. Accrual happens once
before processing all events at `e`; intervals are half-open `[t, e)`.
Same-instant events execute without intervening accrual:

```text
1 capital calls, stableSourceId ASC
2 proceeds, stableSourceId ASC
```

A capital call increases `U` after accrual, so it begins earning at its
effective instant. For each proceeds event:

```text
roc = min(proceeds, U)
U -= roc
remaining = proceeds - roc

prefPaid = min(remaining, A)
A -= prefPaid
remaining -= prefPaid

gpCarry = remaining * carryPct
lpResidual = remaining - gpCarry
```

ROC, preferred return, and the residual carry split are priority stages; LP
residual and GP carry are simultaneous shares of the same final residual. If
preferred return remains unpaid, no residual exists and GP carry is zero.
Partial capital returns reduce `U` before the next accrual interval. Unpaid `A`
keeps compounding even when `U` is zero.

V1.1 supports `terminalMode='liquidation'` only. It accrues through the
liquidation instant, then processes exactly one authorized terminal realization
whose proceeds equal `terminalNavBeforeRealizationUsd` under the versioned
`ONE-FOR-ONE NAV REALIZATION` methodology. No amount beyond that pinned NAV is
created. `hold_unrealized` rejects with:

```text
COMPOUND_HURDLE_TERMINAL_MODE_UNSUPPORTED
```

All state, accrual, exponentiation, and entitlement math uses the repository
Decimal configuration: precision 28 and ROUND_HALF_UP. JavaScript `Math.pow` and
`number` conversion are forbidden in money math.

Entitlement, threshold, and accounting-state math remains full precision. Ratio
splits are never rounded to cents, and rounded presentation values never
participate in a threshold comparison or feed accounting state. The ratified E7
contract applies only at the emitted-event presentation boundary:

1. HALF_UP converts each emitted event total to integer cents.
2. A Decimal-native LRM allocates event cents across priority stages in stable
   order: LP ROC, LP preferred return, residual.
3. A second Decimal-native LRM allocates residual-stage cents across LP residual
   then GP carry.

Each Decimal-native LRM computes exact entitlement cents, floors each
entitlement, then distributes the integer shortfall by exact Decimal fractional
remainder DESC and stable index ASC. It follows the ordering precedent of
`allocateLRM` but does not call its 1e7 integer-weight interface or its
`number`-based normalizer. Tie contract:
`LP is canonical first bucket and wins exact-remainder ties. Otherwise largest exact Decimal remainder wins.`
Independently HALF_UP-rounding each party is forbidden.

Required precision fixtures include an exact tie, a larger GP remainder, and
sub-1e-7 entitlement weights whose winner would reverse if weights were
quantized.

Full-precision entitlements must conserve per event and across run totals before
presentation rounding. Integer cents must conserve per event and across run
totals after hierarchical LRM. Failure at either layer fails the run and
persists no result.

Negative source or state money is invalid input. A negative entitlement or
negative conservation residual fails the run; no absolute-value repair or
epsilon clamp is permitted. Only signed zero canonicalizes to zero before
persistence or output. Primary money values persist at six decimals. Rounded
cash presentation never feeds back into full-precision accounting state.

These are corrected capital-account semantics. `LEGACY-*` fixtures remain
labeled characterization and are never the product oracle.

Required version changes when implemented:

```text
policy schema V1.1
engine version bump
methodology version bump
dual-pinned corrected no-hurdle and compound-hurdle truth cases
```

## Readiness-Only Executable Proofs

These proofs freeze contracts without supplying a production economics engine:

- `tests/unit/truth-cases/helpers/task163-presentation-rounding-oracle.ts` and
  `tests/unit/truth-cases/task163-hierarchical-rounding-readiness.test.ts`
  implement a test-only hierarchical exact-Decimal LRM oracle, including exact
  ties, a larger GP remainder, sub-1e-7 remainder ordering, negative rejection,
  signed-zero normalization, and full-precision plus integer-cent conservation.
- `docs/waterfall-corrected-capital-account.truth-cases.json` and
  `tests/unit/truth-cases/waterfall-corrected-capital-account.test.ts` replay
  the exact `LEGACY-04` and `LEGACY-05` inputs under corrected
  unreturned-capital semantics. Legacy fixtures remain characterization;
  corrected counterparts are future-engine product oracles.
- `shared/contracts/internal-economics/event-ordering-v1.contract.ts` and
  `tests/unit/internal-economics/event-ordering-v1.contract.test.ts` freeze
  `internal-economics-event-ordering/1.0.0`, derived facts keys, canonical
  forecast ordering, and permutation invariance.

These artifacts do not write results. Run-level transaction atomicity,
idempotency races, and “failure persists no result” enforcement remain L3
service/persistence acceptance work.

## Credit-Facility Deviation Resolution

Deviation-register entry 4 resolves to seed-time:

```text
422 CREDIT_FACILITY_UNSUPPORTED
```

This code is reserved and structurally unreachable today: the accepted source
contracts expose no credit-facility field or facility cash-flow event. Strict
source schemas continue rejecting such fields. When an authoritative facility
field first lands, the policy seeder must refuse before normalization can drop
it. Run-phase `unavailable` is not used because knowingly unsupported active
policy must not persist as if accepted.

The authoritative #1176 register correction supersedes the initial
five-ratified/one-pending posting and records all six deviations as ratified:
https://github.com/nikhillinit/Updog_restore/issues/1176#issuecomment-5134955218

## Historical NO-GO Findings and Resolution

Former specialist NO-GO findings required these repairs:

- Waterfall review rejected D1/D9's former per-split cent rounding,
  pre-comparison rounding, and unconditional LP assignment. This freeze replaces
  all three with full-precision accounting and hierarchical presentation-only
  LRM.
- Precision review found the flat quarterly aggregation proof insufficient by
  itself and required a hierarchical exact-Decimal oracle, corrected same-input
  `LEGACY-04`/`LEGACY-05` counterparts, and an executable event-order contract.
  Those readiness proofs now exist and received clean specialist GO re-signs.

Architecture review ruled that ordering metadata derives from persisted facts:
priority from `eventType`, stable source ID from post-insert
`snapshotId`/`eventId`. Persisting either derived field redundantly is
forbidden.

## Ratification Record

| Specialist                 | Date       | Exact SHA                                  | Verdict | Evidence                                                                                             |
| -------------------------- | ---------- | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| waterfall-specialist       | 2026-07-30 | `d2b39f7db476ca8a7497b21688c79e1178a6a352` | GO      | 12 focused files, 205/205 tests; Phoenix 328/328; `npm run check` exit 0; lint and guardrails pass   |
| phoenix-precision-guardian | 2026-07-30 | `d2b39f7db476ca8a7497b21688c79e1178a6a352` | GO      | 51/51 focused tests; corrected-account pins, event ordering, Decimal LRM, and conservation all clean |

Ratification covers corrected capital accounts, full-precision threshold/state
math, hierarchical presentation-only LRM, exact Decimal remainder ordering, the
versioned event-order contract, conservation, opening-artifact reachability, and
the zero-fee bridge. Evidence anchors include
`tests/unit/truth-cases/waterfall-corrected-capital-account.test.ts:198` and
`:248`, plus
`shared/contracts/internal-economics/event-ordering-v1.contract.ts:3`, `:145`,
and `:176`; `tests/unit/services/financial-facts-snapshot-service.test.ts:506`
and `:524` pin opening-artifact reachability; and
`tests/unit/internal-economics/effective-fee-expense-bridge-v1.test.ts:301`,
`:361`, `:368`, and `:428` pin absent, ambiguous, and nonzero fee rejection.

Former NO-GO findings remain above only as resolved historical context. ADR-065
is `[ACCEPTED]`; scoped WP-L2/WP-L3/WP-L4 implementation is GO. Run/result
atomicity, idempotency races, and rollback remain mandatory WP-L3 acceptance.
