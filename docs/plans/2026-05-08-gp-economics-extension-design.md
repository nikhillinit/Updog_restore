# GP Economics Extension for the Existing Fund Lifecycle

- **Version:** 4.0 — Ralph-Gated, Repo-Aligned
- **Date:** 2026-05-08
- **Author:** Product / Architecture
- **Status:** Revised Engineering Handoff Draft — Design-Doc Revision Artifact
- **Target Repo:** `nikhillinit/Updog_restore`

---

## 0. Revision Notes From v2 Scrutiny

This revision preserves the v2 direction while correcting the remaining
implementation errors and adding overlooked opportunities.

### Corrections made

1. **Removed the proposed cents-wide money migration.** The current repo stores
   and contracts monetary fields as decimal-dollar values in several places. P0
   must normalize units at engine boundaries instead of forcing a repo-wide
   cents migration.
2. **Corrected current persistence facts.** The active schema uses `funds`,
   `fundconfigs`, `calc_runs`, and `fund_snapshots`; `calc_runs` is
   engine/dispatch-state based, not a generic `type/status/started_at` table.
3. **Added the required engine-catalog change.** Economics cannot become
   authoritative merely by writing a snapshot. It must be added to the
   calculation engine catalog and lifecycle/read-model logic behind a feature
   flag.
4. **Corrected results status examples.** `/api/funds/:id/results` uses
   `pending | calculating | ready | failed`, not `published`.
5. **Avoided breaking existing drafts.** New economics assumptions are grouped
   under `economicsAssumptions` instead of adding many required top-level
   fields.
6. **Fixed catch-up math.** The v2 catch-up formula divided by
   `(1 - catchUpRate)`, which fails for 100% catch-up and is economically wrong.
   Catch-up gross should be solved from the GP allocation rate, with
   `catchUpRate === 1` handled directly.
7. **Separated GP roles.** GP commitment returns are investor economics and must
   be separate from management fee income and carried interest.
8. **Corrected capital-conservation invariants.** Recycling is retained cash or
   reinvested capital, not a separate distribution use. Period cash
   reconciliation is now explicit.
9. **Corrected Time-Travel architecture.** Assumption rollback should use
   `fundconfigs` version history plus audit events; `fund_snapshots` are
   calculation outputs and should not be overloaded as assumption snapshots.
10. **Clarified P1/P2/P3 activation.** Reserve planning, KPI, Portal, Shared
    Link, and Compass are kept consistent with existing route-governance
    decisions.
11. **Split economics engine rollout from authoritative readiness.** Economics
    starts as experimental in P0. It must not join `AUTHORITATIVE_ENGINE_KEYS`,
    `AUTHORITATIVE_SNAPSHOT_TYPES`, or fund-state expected snapshot types until
    P1 graduation includes migration/backfill proof.
12. **Separated European waterfall from P0.** ADR-004 removed European
    waterfall. Reintroducing it requires an explicit ADR/truth-case gate and is
    not part of default P0.
13. **Canonicalized fee basis names.** P0 uses the shared/ADR-006 fee-basis
    vocabulary. Legacy UI labels must be mapped only through an explicit
    normalizer with tests.
14. **Made dry-run parity mandatory.** ReviewStep preview and persisted worker
    output must use one formula owner: shared pure engine code or a no-write
    server dry-run endpoint.
15. **Added explicit economics result states.** Results must represent disabled,
    not-configured, pending, invalid-input, failed, invariant-failed, and
    stale-config states without breaking reserve/pacing results.
16. **Separated design-doc revision from implementation.** This artifact is the
    revised design handoff. Source implementation begins only after this design
    doc is approved.

---

## 1. Executive Summary

The Updog POVC Fund-Modeling Platform already has a canonical routed wizard and
publish lifecycle:

```txt
/fund-setup?step=N → ReviewStep → POST /api/funds/finalize → publish/recalculate → /fund-model-results/:fundId
```

The current results surface can show reserve, pacing, scorecard, scenarios
status, and a waterfall setup summary. The core GP gap is narrower and more
important: the product does not yet calculate or display complete GP economics,
including management-fee drag, recycling impact, LP net distributions, GP carry,
GP fee income, GP investment returns, clawback exposure, DPI/TVPI trajectory,
and LP/GP net IRR.

This design extends the existing lifecycle rather than adding parallel write
endpoints, parallel persistence tables, or new wizard routes. Default P0
delivers calculated GP economics by:

1. Adding backward-compatible economics assumptions to the existing
   draft/finalize contracts.
2. Building a deterministic pure TypeScript economics engine.
3. Registering an economics calculation engine in the existing
   calculation-engine catalog as experimental.
4. Persisting outputs as attributed `fund_snapshots` with type `ECONOMICS` when
   `enable_gp_economics_engine` is enabled.
5. Extending `/api/funds/:id/results` with `sections.economics`.
6. Refactoring current Step 5 and Step 6 UI to collect assumptions that the
   engine actually consumes.
7. Rendering calculated economics on `/fund-model-results/:fundId`.

P0 is complete when a GP can create a fund, publish it, and see defensible net
LP economics, GP economics, total carry, management fees, DPI/TVPI, and clawback
risk from the existing results page without making economics part of global fund
readiness. Existing reserve/pacing readiness must remain valid when economics is
disabled, not configured, pending, or failed.

European whole-fund waterfall and authoritative economics readiness are separate
decisions. European support is P1b only unless ADR-004 is deliberately
superseded with truth cases. Authoritative economics readiness is P1 only after
migration/backfill proves existing funds do not regress to calculating.

---

## 2. Current Repo Truth

### 2.1 Authoritative user flow

The active product flow is:

```txt
/fund-setup → review/finalize → publish calculations → /fund-model-results/:fundId
```

Do not create standalone wizard routes such as `/fund-setup/step-4-fees`. The
app uses `/fund-setup?step=N` and internal step resolution.

### 2.2 Current wizard steps

| Step | Active route         | Component                    | Current intent                                           | P0 action                                                                |
| ---: | -------------------- | ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
|    1 | `/fund-setup?step=1` | `FundBasicsStep`             | Fund identity, size, vintage, top-level economics        | Preserve                                                                 |
|    2 | `/fund-setup?step=2` | `InvestmentRoundsStepV2`     | Round construction and check-size assumptions            | Feed exit/cost model                                                     |
|    3 | `/fund-setup?step=3` | `CapitalStructureStep`       | Capital allocation                                       | Feed investment/deployment model                                         |
|    4 | `/fund-setup?step=4` | `InvestmentStrategyStep`     | Strategy parameters                                      | Preserve                                                                 |
|    5 | `/fund-setup?step=5` | `DistributionsStep.tsx`      | Waterfall structure, fees/expenses, recycling provisions | Refactor into the primary GP-economics assumption step                   |
|    6 | `/fund-setup?step=6` | `CashflowManagementStep.tsx` | Cashflow, capital calls, expenses, liquidity             | Refactor to show capital-call/liquidity preview using Step 5 assumptions |
|    7 | `/fund-setup?step=7` | `ReviewStep`                 | Final review and create/publish                          | Add economics dry-run and economics summary                              |

### 2.3 Current API lifecycle

P0 must use the existing fund lifecycle.

```txt
PUT    /api/funds/:id/draft
GET    /api/funds/:id/draft
POST   /api/funds/finalize
POST   /api/funds/:id/publish
POST   /api/funds/:id/recalculate
GET    /api/funds/:id/results
GET    /api/funds/:id/state
GET    /api/funds/:id/lifecycle-history
GET    /api/funds/:id/results-comparison
```

P0 must not add standalone write endpoints such as:

```txt
POST /api/v1/funds/:fundId/fees
POST /api/v1/funds/:fundId/exits
POST /api/v1/funds/:fundId/waterfall
```

Those would bypass the draft/finalize/publish model and create two sources of
truth.

### 2.4 Current persistence model

The active persistence model is hybrid JSONB config plus attributed calculation
snapshots.

| Table            | Current role                                                                                                             | P0 usage                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `funds`          | Fund identity and top-level fields such as name, size, management fee, carry percentage, vintage, status, engine results | Preserve                                                                      |
| `fundconfigs`    | Versioned config JSONB with draft/published flags                                                                        | Store new `economicsAssumptions` in `config`                                  |
| `calc_runs`      | Tracks calculation dispatch lifecycle by `engines`, `dispatchState`, `configVersion`, timestamps, errors                 | Add economics engine to run lifecycle when enabled                            |
| `fund_snapshots` | Attributed calculation outputs with `type`, `payload`, `runId`, `configId`, `configVersion`, `snapshotTime`              | Write `type = 'ECONOMICS'` payload                                            |
| `fund_events`    | Audit events such as draft saved, published, calculation triggered                                                       | Add audit metadata for economics calculation failures and assumption restores |

Do not add normalized `fee_configs`, `exit_configs`, or `waterfall_configs`
tables in P0. Those can be considered after the economics model has stabilized
and query/reporting needs justify normalization.

### 2.5 Current calculation-engine catalog

The engine catalog currently makes reserve and pacing authoritative and cohort
experimental. P0 must add economics through this catalog instead of manually
special-casing it, but economics starts experimental.

Target P0 catalog extension:

```ts
{
  engine: 'economics',
  snapshotType: 'ECONOMICS',
  queueKey: 'economics-calc',
  readiness: 'experimental',
  syncCapable: true,
}
```

Rollout rule:

```txt
P0: economics engine behind generated feature flag enable_gp_economics_engine.
P0: economics is not added to AUTHORITATIVE_ENGINE_KEYS.
P0: economics is not added to AUTHORITATIVE_SNAPSHOT_TYPES.
P0: economics is not added to fund-state expected snapshot types.
P1: economics may graduate only with migration/backfill/readiness proof.
```

This avoids changing global lifecycle readiness before the engine is tested and
before existing funds can be safely backfilled.

### 2.6 Current validation path

Every P0 sprint must keep the current core validation path green:

```bash
npm run validate:core
```

Targeted economics tests are added on top of this path, not instead of it.

### 2.7 Required repo touchpoints

Implementation tasks must name and update the current repo surfaces directly. Do
not replace these with parallel endpoints, parallel tables, or ad hoc JSONB
writes.

| Area                         | Required touchpoints                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Draft contract               | `shared/contracts/fund-draft-write-v1.contract.ts`                                                |
| Finalize contract            | `shared/contracts/fund-finalize-v1.contract.ts`                                                   |
| Store adapters               | `client/src/adapters/fund-store-adapters.ts`                                                      |
| Authoritative engine catalog | `shared/contracts/fund-authoritative-calculations.contract.ts`                                    |
| Queue registry               | `server/queues/registry.ts`                                                                       |
| Persistence service          | `server/services/fund-persistence-service.ts`                                                     |
| Results contract             | `shared/contracts/fund-results-v1.contract.ts`                                                    |
| Results read service         | `server/services/fund-results-read-service.ts`                                                    |
| Fund state readiness         | `shared/contracts/fund-state-read-v1.contract.ts`                                                 |
| Wizard Step 5                | `client/src/pages/DistributionsStep.tsx`                                                          |
| Wizard Step 6                | `client/src/pages/CashflowManagementStep.tsx`                                                     |
| Wizard Step 7                | `client/src/pages/ReviewStep.tsx`                                                                 |
| Wizard route shell           | `client/src/pages/fund-setup.tsx`, `client/src/pages/fund-setup-utils.ts`                         |
| Results route                | `client/src/pages/fund-model-results.tsx`                                                         |
| Waterfall governance         | `docs/adr/ADR-004-waterfall-names.md`                                                             |
| Fee-basis governance         | `docs/adr/ADR-006-fee-calculation-standards.md`, `shared/schemas/fee-profile.ts`                  |
| Snapshot governance          | `docs/adr/ADR-014-snapshot-governance.md` or the current snapshot-governance successor if renamed |

---

## 3. Unit Conventions

### 3.1 No repo-wide cents migration in P0

Do not change all monetary storage to cents in P0. The current repo already
mixes:

- Decimal-dollar values in persisted tables.
- Decimal ratios for top-level finalized `managementFee` and `carryPercentage`.
- Percent-number values in wizard/store fields such as `managementFeeRate`,
  `carriedInterest`, `FeeTier.percentage`, and legacy waterfall tier fields.
- Some older client helpers that operate in millions.

A cents migration would be larger than the economics feature and would risk
breaking existing contracts.

### 3.2 P0 normalization boundary

P0 uses a normalization layer:

```txt
UI/store/draft payload → normalizeEconomicsConfig() → pure Decimal-based engine → JSON result DTO
```

| Context                     | Money convention                                | Percent convention                                             | Rule                                              |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Existing `funds` row        | Dollars as decimal-compatible values            | Decimal ratio for top-level `managementFee`, `carryPercentage` | Preserve                                          |
| Existing draft/store fields | Existing repo conventions                       | Existing mixed percent conventions                             | Normalize before engine                           |
| New `economicsAssumptions`  | Dollars, not cents                              | Decimal ratio                                                  | Preferred new contract convention                 |
| Engine internals            | Decimal-safe dollars                            | Decimal ratio                                                  | No formatting, no float-only arithmetic for money |
| Result DTO                  | Dollars as numbers rounded to cents at boundary | Decimal ratio                                                  | Presentation layer formats                        |
| UI display                  | `$`, `%`, `x`, `bps`                            | User-facing                                                    | No engine logic                                   |

### 3.3 Required unit tests

Add unit tests that prove conversions for:

- top-level finalized `managementFee` ratio → engine ratio
- store `managementFeeRate` percent number → engine ratio
- `FeeTier.percentage` percent number → engine ratio
- legacy `waterfallTiers.gpSplit/lpSplit` percent numbers → engine ratio
- new `economicsAssumptions` ratios are passed through unchanged
- money remains dollars at wire boundaries

---

## 4. P0 Scope and Architecture

### 4.1 P0 design principle

P0 is contract-first, engine-second, UI-third.

```txt
contracts → normalizer → engine → snapshot → results API → UI
```

This prevents a UI refactor from inventing assumptions the engine cannot use.

### 4.2 Backward-compatible contract strategy

Do not add many new required top-level fields to `FundDraftWriteV1`. Add one
optional nested object:

```ts
interface FundDraftWriteV1 {
  // existing fields remain untouched
  economicsAssumptions?: EconomicsAssumptionsV1;
}
```

The same object is carried through `FundFinalizeV1` because `FundFinalizeV1`
reuses draft config fields.

Benefits:

- Existing drafts remain valid.
- Strict unknown-key validation is preserved.
- Contract versioning is explicit.
- Legacy fields can still power the current setup-summary waterfall section.
- New economics logic can evolve without polluting the top-level draft schema.

### 4.3 EconomicsAssumptionsV1

```ts
interface EconomicsAssumptionsV1 {
  version: 'v1';

  timeline?: TimelineAssumptionsV1;
  feeModel?: FeeModelAssumptionsV1;
  expenseModel?: ExpenseModelAssumptionsV1;
  exitModel?: ExitModelAssumptionsV1;
  recyclingModel?: RecyclingAssumptionsV1;
  waterfallModel?: WaterfallAssumptionsV1;
  gpCommitmentModel?: GPCommitmentAssumptionsV1;
}

interface TimelineAssumptionsV1 {
  fundLifeYears: number;
  period: 'annual';
  vintageYear?: number;
}
```

Annual periods are sufficient for P0. Quarterly/monthly support is a later
precision upgrade.

### 4.4 Fee model

Use existing fee tiers where possible. Do not invent incompatible fee basis
strings.

Existing-compatible basis values:

```ts
type EconomicsFeeBasis =
  | 'committed_capital'
  | 'called_capital_cumulative'
  | 'called_capital_net_of_returns'
  | 'invested_capital'
  | 'fair_market_value'
  | 'unrealized_cost';
```

These names are canonical for P0 because they match the shared fee-profile
schema and ADR-006 vocabulary. If existing UI helpers still emit aliases such as
`gross_cumulative_called`, `net_cumulative_called`, `cumulative_invested`, or
`unrealized_investments`, those aliases must be accepted only at
`normalizeEconomicsConfig()` and covered by alias-deprecation tests. Unknown
values must produce validation errors rather than silent fallback.

```ts
interface FeeModelAssumptionsV1 {
  source: 'legacy_fee_profiles' | 'economics_override';
  tiers?: EconomicsFeeTierV1[];
  defaultRate?: number; // ratio; used only if no feeProfiles exist
  defaultBasis?: EconomicsFeeBasis;
}

interface EconomicsFeeTierV1 {
  id: string;
  name: string;
  rate: number; // ratio, e.g. 0.025
  basis: EconomicsFeeBasis;
  startYear: number; // inclusive, 1-indexed
  endYear?: number; // inclusive
  recyclingEligiblePct?: number; // ratio, e.g. 1.0
}
```

P0 must implement real fee-basis behavior for at least:

1. `committed_capital`
2. `called_capital_cumulative`
3. `called_capital_net_of_returns`
4. `invested_capital`
5. `fair_market_value`
6. `unrealized_cost`

Other basis types can be accepted but must either map explicitly or return a
validation error. Silent fallback to committed capital is not acceptable for
calculated GP economics.

### 4.5 Expense model

```ts
interface ExpenseModelAssumptionsV1 {
  source: 'legacy_fund_expenses' | 'economics_override';
  annualExpenses?: EconomicsExpenseV1[];
  orgExpenseCap?: number; // dollars
  orgExpenseCapType?: 'absolute' | 'pct_of_commitments';
}

interface EconomicsExpenseV1 {
  id: string;
  category: string;
  amount: number; // dollars per year
  startYear: number;
  endYear?: number;
  growthRate?: number; // ratio
}
```

### 4.6 Exit model

Deal-level exits are useful for American waterfalls, but requiring deal-level
exits would break setup flows that only model cohorts. P0 must support both
cohort and deal modes.

```ts
type ExitModelMode = 'cohort' | 'deal';

interface ExitModelAssumptionsV1 {
  mode: ExitModelMode;

  cohort?: CohortExitModelV1;
  deals?: DealExitV1[];
}

interface CohortExitModelV1 {
  exitDistributionByYear: number[]; // ratios, sum approximately 1.0
  grossMultiple: number;
  lossRatio: number; // ratio
  lossDistributionByYear?: number[];
}

interface DealExitV1 {
  dealId: string;
  investmentYear: number;
  exitYear: number;
  costBasis: number; // dollars
  exitProceeds: number; // dollars
  writeOff?: boolean;
}
```

Cohort mode can synthesize deal-like lots for the waterfall reducer. Deal mode
uses explicit deal exits.

### 4.7 Recycling model

```ts
interface RecyclingAssumptionsV1 {
  enabled: boolean;
  sources: Array<'management_fees' | 'exit_proceeds'>;
  capPctOfCommitments: number; // ratio
  eligibleThroughYear?: number;
  exitProceedsRecyclePct?: number; // ratio
  timing: 'before_waterfall' | 'after_waterfall';
}
```

Default P0 behavior:

```txt
recycling.timing = 'before_waterfall'
```

This means recycled proceeds are retained in the fund and are not distributed
through the waterfall in that period. If a fund’s LPA applies recycling after
waterfall allocations, the config must explicitly set `after_waterfall` and
golden tests must cover it.

### 4.8 Waterfall model

```ts
interface WaterfallAssumptionsV1 {
  type: 'american' | 'hybrid';

  carryPct: number; // ratio, e.g. 0.20
  hurdleRate: number; // ratio, e.g. 0.08
  prefType: 'compounded' | 'simple' | 'none';
  prefCompounding: 'annual';

  prefCatchUp: boolean;
  catchUpRate: number; // ratio, e.g. 1.0 for 100% GP catch-up
  catchUpTargetCarryPct: number; // ratio, usually same as carryPct

  clawbackEnabled: boolean;
  clawbackTrigger: 'final_liquidation' | 'annual_true_up' | 'both';
  escrowPct: number; // ratio of distributed carry held back

  feeOffsetTreatment:
    | 'none'
    | 'reduce_carry'
    | 'reduce_management_fees'
    | 'separate';

  hybridPolicy?: HybridWaterfallPolicyV1;
}

interface HybridWaterfallPolicyV1 {
  returnCapitalScope: 'deal' | 'whole_fund';
  prefScope: 'deal' | 'whole_fund';
  catchUpScope: 'deal' | 'whole_fund';
  carryScope: 'deal' | 'whole_fund';
}
```

Default P0 intentionally excludes `european` because ADR-004 removed European
waterfall and the current draft/results contracts only support American/hybrid
semantics. If business scope requires European in the same milestone, it must be
added through a separate P1b gate with an ADR update, contract enum changes,
migration behavior, and whole-fund golden fixtures.

Legacy mapping rule:

```txt
economicsAssumptions.waterfallModel.type is the source of truth for calculated economics.
legacy waterfallType/waterfallTiers remain the source of truth for the existing setup-summary display until migrated.
```

The results mapper should prefer `economicsAssumptions.waterfallModel.type` when
present so calculated economics display consistently. It must not display
European unless the P1b European gate has been approved and implemented.

### 4.9 GP commitment model

The GP has multiple roles:

1. Fund investor through GP commitment.
2. Management company receiving management fees.
3. Carry recipient receiving carried interest.

These must be modeled separately.

```ts
interface GPCommitmentAssumptionsV1 {
  commitmentPct?: number; // ratio of total commitments
  commitmentAmount?: number; // dollars; if both are present, amount wins
  participatesInInvestmentReturns: boolean; // default true
  callSchedule?: number[]; // ratios by year, sum approximately 1.0
}
```

GP commitment is a funding source and GP cashflow. It is not a deduction from
fund-level investable capital.

---

## 5. EconomicsResult Contract

Use row-based annual output to reduce index drift and make chart/table rendering
easier.

```ts
interface EconomicsResultV1 {
  version: 'v1';
  annual: EconomicsAnnualRowV1[];
  summary: EconomicsSummaryV1;
  checks: EconomicsInvariantReportV1;
}

interface EconomicsAnnualRowV1 {
  year: number;

  // Funding sources
  lpCapitalCalls: number; // dollars
  gpCommitmentCalls: number; // dollars
  grossExitProceeds: number; // dollars
  beginningCash: number; // dollars

  // Uses / retained cash
  investments: number; // dollars
  feesPaidToManager: number; // dollars
  expensesPaid: number; // dollars
  recycledProceeds: number; // dollars retained from exits
  endingCash: number; // dollars

  // Distribution allocations
  lpDistributions: number; // dollars
  gpInvestmentDistributions: number; // dollars; GP as fund investor
  gpCarryDistributed: number; // dollars
  gpCarryEscrowed: number; // dollars
  gpCarryReleasedFromEscrow: number; // dollars
  clawbackPaid: number; // dollars

  // NAV and metrics
  grossNav: number; // dollars
  lpNetNav: number; // dollars, net of accrued carry if modeled
  dpi: number;
  rvpi: number;
  tvpi: number;

  // Diagnostics
  conservationDelta: number; // dollars; should be near zero
}

interface EconomicsSummaryV1 {
  grossIrr: number | null;
  lpNetIrr: number | null;
  gpNetIrr: number | null;

  totalLpPaidIn: number;
  totalGpCommitmentCalled: number;
  totalManagementFees: number;
  totalExpenses: number;
  totalRecycled: number;

  totalLpDistributions: number;
  totalGpInvestmentDistributions: number;
  totalGpCarryDistributed: number;
  totalGpFeeIncome: number;

  finalDpi: number;
  finalRvpi: number;
  finalTvpi: number;

  finalClawbackDue: number;
  maxEscrowAvailable: number;
  netGpCarryAfterClawback: number;
}

interface EconomicsInvariantReportV1 {
  passed: boolean;
  tolerance: number;
  errors: Array<{
    year?: number;
    code:
      | 'PERIOD_CASH_RECONCILIATION_FAILED'
      | 'DISTRIBUTION_RECONCILIATION_FAILED'
      | 'NEGATIVE_REMAINING_PROCEEDS'
      | 'INVALID_INPUT';
    message: string;
    delta?: number;
  }>;
}
```

---

## 6. Economics Engine Design

### 6.1 Engine shape

```ts
export function runEconomicsModel(
  input: PublishedFundConfig
): EconomicsResultV1 {
  const normalized = normalizeEconomicsConfig(input);
  validateEconomicsInputs(normalized);

  const timeline = buildAnnualTimeline(normalized);
  const fees = calculateManagementFees(timeline, normalized);
  const expenses = calculateExpenses(timeline, normalized);
  const exits = calculateExitProceeds(timeline, normalized);
  const recycling = calculateRecycling(timeline, normalized, fees, exits);
  const waterfall = runWaterfallReducer(timeline, normalized, exits, recycling);
  const nav = calculateNav(timeline, normalized, waterfall, recycling);
  const metrics = calculateEconomicsMetrics(
    timeline,
    normalized,
    waterfall,
    fees,
    expenses,
    nav
  );
  const checks = validateEconomicsInvariants(
    timeline,
    normalized,
    waterfall,
    fees,
    expenses,
    recycling,
    nav
  );

  if (!checks.passed) {
    throw new EconomicsInvariantError(checks);
  }

  return assembleEconomicsResult(
    timeline,
    fees,
    expenses,
    exits,
    recycling,
    waterfall,
    nav,
    metrics,
    checks
  );
}
```

The core engine must be pure. Server-only code handles persistence, logging,
queue dispatch, and snapshot writes.

### 6.2 Management-fee formulas

```txt
Fee_t = FeeBasis_t × Rate_t
```

Supported P0 bases:

```txt
committed_capital        → total commitments
called_capital_cumulative       → cumulative capital called through t
called_capital_net_of_returns   → cumulative called less returned capital through t
invested_capital                → cumulative investments through t
fair_market_value               → period NAV / FMV
unrealized_cost                 → unrealized investment cost basis
```

Step-downs are represented as multiple fee tiers with year ranges.

### 6.3 Recycling formulas

If recycling happens before waterfall:

```txt
GrossExitProceeds_t = exits realized in period t
EligibleFeePool_t = cumulative eligible management fees - prior fee recycling
EligibleExitPool_t = GrossExitProceeds_t × exitProceedsRecyclePct
RemainingCap_t = RecyclingCap - cumulative recycled before t

Recycled_t = min(
  GrossExitProceeds_t,
  EligibleFeePool_t + EligibleExitPool_t,
  RemainingCap_t
)

DistributableProceeds_t = GrossExitProceeds_t - Recycled_t
```

If recycling happens after waterfall, the waterfall first allocates proceeds and
then the recycled amount reduces distributions according to the configured
source and legal policy. This must have separate golden tests before being
enabled.

### 6.4 Preferred return

Preferred return should be time-weighted on unreturned contributed capital, not
simply cost basis multiplied by hurdle over fund life.

P0 annual approximation:

```txt
PrefAccrual_t = UnreturnedCapital_{t-1} × HurdleRate
```

For compounded pref:

```txt
PrefBalance_t = (PrefBalance_{t-1} + PrefAccrual_t) - PrefPaid_t
```

For simple pref:

```txt
PrefBalance_t = CumulativeSimplePrefAccrued_t - CumulativePrefPaid_t
```

For `prefType = none`, pref due is zero.

### 6.5 Catch-up calculation

Avoid a brittle closed form. Use an allocation reducer that applies a catch-up
tier until the GP reaches the target carry share.

For each catch-up allocation step:

```txt
catchUpNeededForGP = targetGPCarry - actualGPCarrySoFar
catchUpGrossNeeded = catchUpNeededForGP / catchUpRate
catchUpGross = min(remainingProceeds, catchUpGrossNeeded)

gpGets += catchUpGross × catchUpRate
lpGets += catchUpGross × (1 - catchUpRate)
remainingProceeds -= catchUpGross
```

Guardrails:

```txt
if catchUpRate <= 0 → no catch-up tier
if catchUpRate > 1 → validation error
if catchUpRate = 1 → GP receives 100% of catch-up gross until target reached
```

### 6.6 American waterfall

American waterfalls allocate carry deal-by-deal or cohort-lot-by-cohort-lot.

```txt
For each realized lot:
  1. Determine distributable proceeds after recycling policy.
  2. Return capital for that lot.
  3. Pay preferred return for that lot, if configured.
  4. Apply catch-up for that lot, if configured.
  5. Split residual by carry percentage.
  6. Track cumulative GP carry for clawback exposure.
```

American golden fixture requirement:

```txt
Deal A: early winner
Deal B: later loser
Expected: GP receives carry earlier than European and may show clawback exposure after Deal B.
```

Do not assert “American vs European differs by >10%” as a generic rule. That is
scenario-dependent.

### 6.7 European waterfall — P1b gated

European waterfalls allocate at whole-fund level, but they are not part of
default P0. ADR-004 removed European waterfall from the active product
vocabulary, and reintroducing it as an enum-only change would create a false
UI/contract signal.

P1b approval requirements:

- ADR-004 update or replacement.
- Draft, finalize, results, and waterfall-policy enum changes.
- Golden truth cases for whole-fund return of capital, preferred return,
  catch-up, carry, and clawback.
- Migration behavior for existing funds with American/hybrid assumptions only.
- Explicit UI copy and tests confirming European is not shown until enabled.

When approved, the European reducer should allocate at whole-fund level:

```txt
At each distribution period:
  1. Return all contributed capital at fund level.
  2. Pay accrued preferred return at fund level.
  3. Apply GP catch-up at fund level.
  4. Split residual by carry percentage.
```

European golden fixture requirement after P1b approval:

```txt
Using the same early-winner/later-loser fixture as American:
Expected: GP carry is deferred until whole-fund return-of-capital and pref conditions are satisfied.
```

### 6.8 Hybrid waterfall

Hybrid is not one universal model. P0 supports explicit stage scopes:

```txt
return capital: deal or whole_fund
pref: deal or whole_fund
catch-up: deal or whole_fund
carry: deal or whole_fund
```

If `type = hybrid` and `hybridPolicy` is missing, validation fails. Do not infer
silently.

### 6.9 Clawback

Clawback compares actual distributed carry to target carry after full-fund
economics are known.

```txt
EligibleProfit = max(0, TotalDistributableProceeds - ReturnedCapital - RequiredPref)
TargetGPCarry = EligibleProfit × CarryPct
ActualGPCarry = cumulative GP carry distributed + carry escrowed - clawback already paid
ClawbackDue = max(0, ActualGPCarry - TargetGPCarry)
EscrowAvailable = current carry escrow balance
ActualClawbackPaid = min(ClawbackDue, EscrowAvailable) unless model explicitly supports uncapped GP repayment
```

If the product wants to show legal exposure beyond escrow, report both:

```txt
clawbackDue
escrowAvailable
unfundedClawbackExposure = max(0, clawbackDue - escrowAvailable)
```

### 6.10 GP net IRR

GP net IRR must include all GP cashflow roles:

```txt
GPNetCashFlow_t =
  - GPCommitmentCalls_t
  + GPInvestmentDistributions_t
  + GPFeeIncome_t
  + GPCarryDistributed_t
  + GPCarryEscrowReleased_t
  - ClawbackPaid_t
```

Do not calculate GP net IRR from carry and fees alone.

### 6.11 LP net IRR

LP net IRR uses LP paid-in capital and LP net distributions:

```txt
LPNetCashFlow_t = -LPCapitalCalls_t + LPDistributions_t + LPNetNAVAtTerminalIfUnrealized
```

For interim IRR, include current LP net NAV as terminal value only when the UI
explicitly labels the metric as “interim net IRR including NAV.”

### 6.12 DPI / RVPI / TVPI

```txt
DPI_t  = cumulative LP distributions / cumulative LP paid-in capital
RVPI_t = LP net NAV / cumulative LP paid-in capital
TVPI_t = DPI_t + RVPI_t
```

DPI should not include GP carry or GP investment distributions in the numerator.

### 6.13 Capital conservation invariants

Use period-level cash reconciliation.

For each period:

```txt
BeginningCash
+ LPCapitalCalls
+ GPCommitmentCalls
+ GrossExitProceeds
=
Investments
+ FeesPaidToManager
+ ExpensesPaid
+ LPDistributions
+ GPInvestmentDistributions
+ GPCarryDistributed
+ GPCarryEscrowed
- GPCarryReleasedFromEscrow
+ EndingCash
```

Distribution allocation reconciliation:

```txt
DistributableProceeds = GrossExitProceeds - RecycledProceeds
DistributableProceeds = LPDistributions + GPInvestmentDistributions + GPCarryDistributed + GPCarryEscrowed - GPCarryReleasedFromEscrow
```

Recycled proceeds are not a distribution. They remain in ending cash or are
later used for investments.

Tolerance:

```txt
abs(delta) <= max(0.01 dollars, totalPeriodSources × 1e-9)
```

---

## 7. Publish and Results Integration

### 7.1 Engine registration

Add economics to the calculation engine catalog behind a generated feature flag.
In P0 it is experimental and cannot affect global fund readiness.

```ts
export const FUND_CALCULATION_ENGINE_CATALOG = [
  // existing reserve/pacing/cohort descriptors
  {
    engine: 'economics',
    snapshotType: 'ECONOMICS',
    queueKey: 'economics-calc',
    readiness: 'experimental',
    featureFlag: 'enable_gp_economics_engine',
    syncCapable: true,
  },
] as const;
```

Do not change authoritative arrays in P0:

```ts
export const AUTHORITATIVE_ENGINE_KEYS = ['reserve', 'pacing'] as const;
export const AUTHORITATIVE_SNAPSHOT_TYPES = ['RESERVE', 'PACING'] as const;
```

After P1 graduation, economics may become authoritative only in a
migration-aware PR that also updates expected snapshot types, readiness tests,
and existing fund backfill behavior.

### 7.2 Server execution path

Queue-backed and queue-less execution must share the same service:

```ts
runEconomicsCalculation({
  fundId,
  runId,
  configId,
  configVersion,
  correlationId,
});
```

Responsibilities:

1. Load the published `fundconfigs.config`.
2. Parse with `FundDraftWriteV1Schema`.
3. Normalize economics inputs.
4. Run `runEconomicsModel`.
5. Write `fund_snapshots` row:

```txt
type = 'ECONOMICS'
calcVersion = 'economics-v1'
payload = EconomicsResultV1
runId = calcRun.id
configId = fundConfig.id
configVersion = fundConfig.version
correlationId = calcRun.correlationId
snapshotTime = now()
```

### 7.3 Failure behavior

Client-side dry-run failure in ReviewStep:

```txt
Block finalize and show actionable validation/invariant error.
```

Server-side economics calculation failure after publish:

```txt
P0 experimental behavior: sections.economics.status = failed/unavailable; overall results can still be ready.
P0 must not let economics failures block reserve/pacing readiness.
P1 authoritative behavior: only after graduation, calc run and lifecycle may reflect economics failure.
```

Do not silently drop the economics section if the engine fails.

### 7.4 Results contract extension

Add `economics` under `sections`.

```ts
type EconomicsResultsSectionV1 =
  | {
      status: 'available';
      source: 'fund_snapshots';
      configVersion: number;
      calculatedAt: string | null;
      payload: EconomicsResultV1;
    }
  | {
      status: 'pending' | 'unavailable' | 'failed';
      reason: string;
      reasonCode?:
        | 'ECONOMICS_DISABLED'
        | 'ECONOMICS_NOT_CONFIGURED'
        | 'ECONOMICS_SNAPSHOT_PENDING'
        | 'ECONOMICS_INPUT_INVALID'
        | 'ECONOMICS_ENGINE_FAILED'
        | 'ECONOMICS_INVARIANT_FAILED'
        | 'ECONOMICS_STALE_CONFIG_VERSION';
    };
```

`GET /api/funds/:id/results` example:

```json
{
  "status": "ready",
  "fundId": 42,
  "sections": {
    "reserve": { "status": "available", "payload": {} },
    "pacing": { "status": "available", "payload": {} },
    "scorecard": { "status": "available", "payload": {} },
    "scenarios": {
      "status": "unavailable",
      "reason": "No authoritative source",
      "reasonCode": "NO_AUTHORITATIVE_SOURCE"
    },
    "waterfall": {
      "status": "available",
      "source": "fund_config",
      "payload": {}
    },
    "economics": {
      "status": "available",
      "source": "fund_snapshots",
      "configVersion": 1,
      "calculatedAt": "2026-05-08T00:00:00.000Z",
      "payload": {
        "version": "v1",
        "annual": [],
        "summary": {
          "grossIrr": 0.22,
          "lpNetIrr": 0.18,
          "gpNetIrr": 0.35,
          "totalManagementFees": 15000000,
          "totalGpCarryDistributed": 42000000,
          "finalDpi": 1.8,
          "finalTvpi": 2.5,
          "finalClawbackDue": 0
        },
        "checks": { "passed": true, "tolerance": 0.01, "errors": [] }
      }
    }
  }
}
```

---

## 8. UI Refactor

### 8.1 Rule: no new wizard routes

Keep `/fund-setup?step=N`. Refactor existing components.

### 8.2 Step 5 — `DistributionsStep.tsx`

Refactor tabs to match the engine.

#### Tab 1: Exit & Recycling

Inputs:

- Exit mode: cohort or deal-level.
- Cohort exit curve by year.
- Gross multiple.
- Loss ratio and optional loss timing.
- Recycling enabled/disabled.
- Recycling sources.
- Recycling cap.
- Recycling timing: before waterfall or after waterfall.

Preview:

- Gross exit proceeds by year.
- Recycled proceeds by year.
- Distributable proceeds by year.

#### Tab 2: Fees & Expenses

Inputs:

- Fee tier schedule.
- Fee basis using repo-compatible enum values.
- Step-down schedule.
- Recycling-eligible percentage by tier.
- Organizational expense cap.
- Annual expenses.

Preview:

- Annual management fees.
- Cumulative fees.
- Net capital available for investment.

#### Tab 3: Waterfall & Carry

Inputs:

- P0 selector options: American, Hybrid.
- European appears only after the P1b ADR/truth-case gate is approved.
- Carry percentage.
- Hurdle rate.
- Preferred return type.
- Catch-up enabled/rate/target.
- Clawback enabled/trigger.
- Escrow percentage.
- Fee offset treatment.
- Hybrid stage scopes if type is hybrid.

Preview:

- Sample waterfall stack.
- Estimated carry by year from a dry-run.
- Clawback exposure indicator.

### 8.3 Step 6 — `CashflowManagementStep.tsx`

Keep the current cashflow/liquidity intent, but connect it to economics
assumptions.

Add:

- Capital-call schedule preview.
- GP commitment call schedule.
- Liquidity/ending-cash preview.
- Warning if fee basis depends on NAV/FMV but NAV assumptions are unavailable.
- Warning if recycling creates negative distributable proceeds.

### 8.4 Step 7 — `ReviewStep`

Add an Economics Summary card before the finalize button.

Fields:

- Net LP IRR.
- Net GP IRR.
- Total management fees.
- Total GP carry.
- Final DPI.
- Final TVPI.
- Clawback exposure.
- Engine invariant status.

Behavior:

```txt
If client dry-run succeeds → show summary and allow finalize.
If dry-run fails due to input validation → block finalize with field-level links.
If dry-run fails due to unexpected engine error → block finalize and show retry/report action.
```

### 8.5 Results page

Add `sections.economics` rendering to `/fund-model-results/:fundId`.

Required surfaces:

1. KPI cards:
   - Gross IRR.
   - Net LP IRR.
   - Net GP IRR.
   - Total GP carry.
   - Management fees.
   - DPI.
   - TVPI.
   - Clawback exposure.
2. Cashflow chart:
   - LP calls.
   - GP commitment calls.
   - LP distributions.
   - GP investment distributions.
   - GP carry.
   - Fees.
   - Expenses.
3. Waterfall/carry table:
   - Year.
   - LP distributions.
   - GP investment distributions.
   - GP carry distributed.
   - GP carry escrowed/released.
   - Clawback balance.
   - DPI/TVPI.
4. J-curve chart:
   - DPI, RVPI, TVPI.
5. Assumption summary:
   - Read-only merged config with legacy fields and `economicsAssumptions`.

---

## 9. P1 — Operational Surfaces

### 9.1 Reserve planning

Current route truth:

```txt
/planning → archived redirect to /portfolio?tab=reserve-planning
```

P1 action:

1. Audit `/portfolio?tab=reserve-planning`.
2. If the tab is missing or stubbed, restore it under `/portfolio` rather than
   reviving `/planning`.
3. Any “See impact on DPI” action must create a scenario or draft branch. It
   must not silently mutate the currently published config.

Recommended data approach:

- Use current reserve/pacing snapshots for calculated baselines.
- Add persisted reserve-plan data only after auditing existing storage and
  deciding whether it belongs in JSONB config, snapshots, or normalized tables.

### 9.2 KPI dashboard

Current route truth:

```txt
/dashboard is live and protected.
/kpi-manager and /kpi-submission are archived redirects to /dashboard.
```

P1 action:

Extend `/dashboard` with construction-vs-current variance using current results
and metrics. Do not revive `/kpi-manager` or `/kpi-submission` until there is a
persisted KPI workflow.

Features:

- DPI, TVPI, IRR, NAV cards.
- Construction vs actual J-curve.
- Strategy-drift alerts.
- Portfolio company table.
- Snapshot/config version selector.

---

## 10. P2 — Stakeholder and Strategic Layer

### 10.1 Scenario engine

The Scenario Engine is not Step 7. Step 7 is Review. Scenario Engine is a
post-results strategic surface that consumes a published config and the P0
economics engine.

P2 architecture:

```txt
ScenarioConfig → run N economics simulations → scenario result snapshot/cache → sections.scenarios
```

Initial API can be additive:

```txt
POST /api/funds/:id/scenarios
GET  /api/funds/:id/scenarios/:scenarioId
```

Results still appear through `/api/funds/:id/results` when scenario output is
attached to a fund/config version.

Performance rule:

```txt
Benchmark TypeScript first.
Only consider Rust/WASM if 1,000 simulations cannot meet the target on representative data.
```

### 10.2 Public portal

Current route truth:

```txt
/portal/:rest* is an intentional public contract that currently resolves to access denied.
```

P2 action:

Portal activation requires a separate security design. Do not return raw
`FundResultsReadV1` directly to LPs. Create a redacted DTO, for example:

```ts
interface PortalFundResultsReadV1 {
  fundId: number;
  role: 'lp' | 'advisor' | 'co_investor' | 'gp_viewer' | 'gp_admin';
  visibleSections: {
    kpis: boolean;
    jCurve: boolean;
    distributions: boolean;
    assumptions: boolean;
    companyLevel: boolean;
    scenarios: boolean;
  };
  payload: unknown;
  redactionLog: string[];
}
```

Required before activation:

- invite-only access
- magic-link expiration
- role middleware
- audit logs
- redaction tests
- no self-signup

### 10.3 Compass

Current route truth:

```txt
Compass is experimental and unmounted.
```

Keep Compass out of the P0/P1 critical path. Mount it only after benchmark data
source, freshness policy, and legal/data-licensing constraints are confirmed.

---

## 11. P3 — Polish and Hardening

### 11.1 Shared Link

Current route truth:

```txt
/shared/:shareId is an intentional public shared-link contract.
```

P3 action:

Add LP-friendly economics output only after `sections.economics` is stable.

Features:

- Expiration.
- Revocation.
- Redacted metrics list.
- Access analytics.
- Watermarking.

### 11.2 Time-Travel Analytics

Do not use `fund_snapshots` as assumption snapshots. They are calculation
outputs.

Use:

- `fundconfigs` version history for assumptions.
- `fund_events` for audit metadata and user comments.
- `fund_snapshots` for calculated outputs tied to a config version.

Restore behavior:

```txt
Restore creates a new draft from a prior fundconfigs.config version.
It does not overwrite the active published config in place.
User must publish the restored draft to make it authoritative.
```

Diff behavior:

```txt
Compare two fundconfigs.config JSON payloads.
Optionally compare their attributed ECONOMICS snapshots to show impact on IRR/carry.
```

### 11.3 Performance hardening

Performance targets remain useful, but update index recommendations to actual
fields.

Suggested indexes after measurement:

```sql
-- if not already covered by current lookup index
CREATE INDEX CONCURRENTLY IF NOT EXISTS fund_snapshots_fund_type_config_created_idx
ON fund_snapshots (fund_id, type, config_version, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS calc_runs_fund_config_requested_idx
ON calc_runs (fund_id, config_version, requested_at DESC);
```

Monitoring should track:

- `gp_economics_normalization_failed`
- `gp_economics_dry_run_completed`
- `gp_economics_publish_enqueued`
- `gp_economics_snapshot_persisted`
- `gp_economics_snapshot_failed`
- `gp_economics_results_unavailable_rendered`
- economics engine execution time
- snapshot write latency
- results read latency
- invariant failure count by reason
- dry-run validation failure count
- queue success/failure/timeout counts
- stale-config snapshot count
- scenario simulation duration

Do not track WASM execution time unless WASM is actually adopted.

---

## 12. Testing Strategy

### 12.1 Contract tests

- `FundDraftWriteV1` accepts `economicsAssumptions` and rejects unknown fields.
- Existing drafts without `economicsAssumptions` remain valid.
- `FundFinalizeV1` carries `economicsAssumptions` through to persisted
  `fundconfigs.config`.
- `fundStoreToDraftWriteV1()` preserves legacy Step 5/6 fields.
- `fundStoreToFinalizeV1()` preserves legacy Step 5/6 fields and new
  `economicsAssumptions`.
- Results contract returns `sections.economics` as
  pending/unavailable/failed/available with strict reason codes.

### 12.2 Engine tests

| Test                       | Fixture                                       | Expected behavior                                            |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Flat fee                   | $100M fund, 2% committed capital              | $2M annual fee                                               |
| Fee stepdown               | 2.5% years 1–4, 1.5% after                    | Correct annual/cumulative fee curve                          |
| Called-capital basis       | capital calls over 5 years                    | Fee follows called capital, not fund size                    |
| Recycling cap              | 50% cap, large exits                          | Recycled proceeds stop at cap                                |
| Recycling before waterfall | exits in years 4–6                            | Recycled proceeds reduce distributable proceeds              |
| American early winner      | early 3x deal, later write-off                | Early carry and clawback exposure                            |
| European same data         | same fixture                                  | P1b only after ADR/truth-case approval; absent in default P0 |
| 100% catch-up              | hurdle 8%, catch-up 100%, carry 20%           | No divide-by-zero; GP reaches target carry share             |
| Escrow clawback            | early carry over-distribution                 | escrow absorbs clawback up to available balance              |
| GP net IRR                 | GP commit + fees + carry + investment returns | GP IRR includes all GP roles                                 |
| Conservation               | any valid fixture                             | all invariant deltas inside tolerance                        |

### 12.3 Integration tests

- Finalize with `economicsAssumptions` → publish → `ECONOMICS` snapshot exists.
- Publish without economics flag → existing reserve/pacing behavior unaffected.
- Publish with economics flag and invalid economics input → P0 returns
  failed/unavailable economics section while reserve/pacing remain unaffected.
- Recalculate writes a new attributed `ECONOMICS` snapshot for the current
  config version.
- `/api/funds/:id/results` prefers current-version economics snapshot over stale
  snapshots.

### 12.4 UI tests

- Step 5 saves economics assumptions into the store/draft contract.
- Step 6 preview updates when Step 5 fee/recycling settings change.
- ReviewStep blocks finalize on economics dry-run validation failure.
- ReviewStep allows finalize on valid economics dry-run.
- Results page renders economics cards/table/charts from
  `sections.economics.available`.
- Results page renders pending/failed/unavailable states without crashing.

### 12.5 Boss demo acceptance tests

These scenarios are the mandatory P0 demo acceptance surface:

| Scenario                            | Setup                                                                                     | Expected result                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Happy path                          | Create a fund with 2% management fee, 20% carry, American waterfall, and a recycling cap. | Step 7 dry-run shows fee schedule, recycling usage, carry, and clawback preview; finalize publishes; results show economics matching the dry-run fixture. |
| Missing economics                   | Open an existing fund with no `economicsAssumptions`.                                     | Reserve/pacing remain available; economics renders `unavailable` with `ECONOMICS_NOT_CONFIGURED`.                                                         |
| Disabled flag                       | Publish while `enable_gp_economics_engine` is disabled.                                   | Reserve/pacing behavior is unchanged; economics renders `unavailable` with `ECONOMICS_DISABLED`.                                                          |
| Invalid input                       | Configure an unsupported fee basis or invalid recycling cap.                              | ReviewStep blocks publish or marks economics unavailable with stable validation reasons; no successful economics snapshot is persisted.                   |
| Recalculate after assumption change | Change fee basis or recycling cap after a published config.                               | Recalculate creates a new calc run for the new published config version; old results remain attributable to the old config version.                       |

Additional finance-specific demos:

1. **Carry test:** early winner + later loser fixture shows American carry and
   clawback exposure; European remains unavailable unless P1b is enabled.
2. **Fee basis test:** switching fee basis from committed capital to invested
   capital changes management-fee drag visibly.
3. **Recycling test:** enabling recycling increases deployable/reinvested
   capital and reduces current-period distributions according to policy.
4. **GP net IRR test:** GP net IRR changes when GP commitment percentage
   changes.
5. **Conservation test:** published economics output shows invariant pass
   status.
6. **Rollback test:** restoring an old config version creates a draft;
   publishing it restores prior assumptions and generates new economics output.

---

## 13. Implementation Roadmap

### P0a / Sprint A — Contract and Normalization

Goal: economics assumptions can flow through draft/finalize without breaking
existing funds.

Deliverables:

- `EconomicsAssumptionsV1` schema.
- `FundDraftWriteV1` extension.
- `FundFinalizeV1` passthrough.
- `normalizeEconomicsConfig()`.
- Unit conversion tests.
- Backward-compatibility tests for existing drafts.

Validation:

```bash
npm run validate:core
# plus targeted contract/normalizer tests
```

### Sprint B — Pure Economics Engine

Goal: deterministic engine with golden fixtures, still separate from
persistence.

Deliverables:

- `runEconomicsModel()` pure module.
- Fee and expense calculation.
- Exit/recycling calculation.
- American/hybrid waterfall reducer.
- European reducer only if P1b approval gate is satisfied.
- Clawback and escrow logic.
- LP/GP IRR and DPI/RVPI/TVPI metrics.
- Conservation invariant report.

Validation:

```bash
npm run validate:core
# plus economics engine golden tests
```

### P0b / Sprint C — Experimental Publish and Results Integration

Goal: economics outputs are persisted and readable through the existing results
API without changing global fund readiness.

Deliverables:

- Economics engine catalog entry behind generated `enable_gp_economics_engine`
  flag.
- Economics calculation service.
- Queue-less inline execution support.
- Optional queue-backed execution path.
- `ECONOMICS` snapshot writes with run/config attribution.
- `sections.economics` in results contract and read service.
- Stale/current-version snapshot selection.
- Explicit states for disabled, not configured, pending, invalid input, engine
  failure, invariant failure, and stale config version.
- No P0 change to `AUTHORITATIVE_ENGINE_KEYS`, `AUTHORITATIVE_SNAPSHOT_TYPES`,
  or fund-state expected snapshot types.

Validation:

```bash
npm run test:publish-orchestration
npm run test:phase4
npm run lint:phase4
npm run validate:core
```

### P0c / Sprint D — Wizard Refactor

Goal: existing Step 5/6/7 collect and validate economics assumptions.

Deliverables:

- Refactored `DistributionsStep.tsx` tabs.
- Refactored `CashflowManagementStep.tsx` preview.
- ReviewStep economics dry-run and summary card.
- Client tests for valid/invalid dry-run.
- No routing changes.

Validation:

```bash
npm run validate:core
# plus targeted client tests
```

### P0c / Sprint E — Results Page

Goal: GP-facing calculated economics are visible on
`/fund-model-results/:fundId`.

Deliverables:

- Economics KPI cards.
- Cashflow chart.
- Waterfall/carry table.
- J-curve chart.
- Assumption summary.
- Pending/failed/unavailable states.

Validation:

```bash
npm run validate:core
# plus fund-model-results tests
```

### P1 / Sprint F — Authoritative Graduation

Only after P0a-P0c pass:

Deliverables:

- Migration/backfill plan for existing published configs.
- Readiness tests proving existing funds do not regress to calculating.
- Economics addition to authoritative arrays and expected snapshot types in the
  same migration-aware PR.
- Rollback criteria if backfill or readiness verification fails.

Validation:

```bash
npm run validate:core
npm run phoenix:truth
# plus readiness/backfill regression tests
```

### P1b — European Whole-Fund Waterfall

Only if business explicitly re-approves European waterfall:

Deliverables:

- ADR-004 update or replacement.
- Contract enum updates across draft/finalize/results/waterfall policy surfaces.
- Whole-fund golden fixtures.
- UI selector and display updates.
- Migration behavior for existing funds.

### P2+ — Operational and Stakeholder Layers

Only after P0 is stable and P1 graduation is accepted:

| Sprint | Focus                                   | Deliverable                                   |
| ------ | --------------------------------------- | --------------------------------------------- |
| F      | Reserve planning and dashboard variance | Restore/extend live canonical surfaces        |
| G      | Scenario engine                         | Monte Carlo from P0 economics engine          |
| H      | Portal activation                       | Redacted role-gated portal DTO                |
| I      | Shared links and time travel            | LP-friendly shares and config-version restore |
| J      | Performance                             | k6, caching, monitoring, index verification   |

---

## 14. Risk Register

| Risk                                                      | Likelihood |   Impact | Mitigation                                                                                                                       |
| --------------------------------------------------------- | ---------: | -------: | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit mismatch creates wrong economics                     |       High | Critical | Normalization layer, unit tests, no cents migration                                                                              |
| Catch-up/clawback formulas are wrong                      |     Medium | Critical | Golden fixtures, iterative reducer, CPA/finance review                                                                           |
| Economics engine changes lifecycle readiness too early    |     Medium |     High | Keep economics experimental in P0; add authoritative arrays and expected snapshot types only in P1 with migration/backfill proof |
| European waterfall is reintroduced as an enum-only change |     Medium |     High | Keep European out of default P0; require ADR-004 update and whole-fund truth cases before enabling                               |
| Existing reserve/pacing publish behavior regresses        |     Medium |     High | Keep `validate:core` green; add integration coverage around publish                                                              |
| ReviewStep dry-run blocks valid funds                     |     Medium |   Medium | Clear validation messages; server-side fallback diagnostics                                                                      |
| Scenario simulations are too slow                         |     Medium |   Medium | Benchmark TypeScript first; optimize only with evidence                                                                          |
| Portal leaks assumptions                                  |        Low | Critical | Separate redacted DTO, role tests, audit logs                                                                                    |
| Time-travel restore overwrites published config           |        Low |     High | Restore creates draft only; publish required                                                                                     |

---

## 15. Appendix — Formula Quick Reference

### Management fee

```txt
Fee_t = FeeBasis_t × Rate_t
TotalFees = Σ Fee_t
```

### Recycling before waterfall

```txt
Recycled_t = min(
  GrossExitProceeds_t,
  EligibleFeePool_t + EligibleExitPool_t,
  RecyclingCap - CumulativeRecycled_{t-1}
)

DistributableProceeds_t = GrossExitProceeds_t - Recycled_t
```

### Preferred return

```txt
PrefAccrual_t = UnreturnedCapital_{t-1} × HurdleRate
PrefDue_t = PriorPrefBalance + PrefAccrual_t - PrefPaid_t
```

### Catch-up

```txt
catchUpNeededForGP = targetGPCarry - actualGPCarrySoFar
catchUpGrossNeeded = catchUpNeededForGP / catchUpRate
catchUpGross = min(remainingProceeds, catchUpGrossNeeded)

gpGets += catchUpGross × catchUpRate
lpGets += catchUpGross × (1 - catchUpRate)
```

### Clawback

```txt
EligibleProfit = max(0, TotalDistributableProceeds - ReturnedCapital - RequiredPref)
TargetGPCarry = EligibleProfit × CarryPct
ActualGPCarry = CarryDistributed + CarryEscrowed - ClawbackPaid
ClawbackDue = max(0, ActualGPCarry - TargetGPCarry)
ActualClawbackPaid = min(ClawbackDue, EscrowAvailable)
```

### LP metrics

```txt
DPI_t  = cumulative LP distributions / cumulative LP paid-in capital
RVPI_t = LP net NAV / cumulative LP paid-in capital
TVPI_t = DPI_t + RVPI_t
```

### GP net cashflow

```txt
GPNetCashFlow_t =
  - GPCommitmentCalls_t
  + GPInvestmentDistributions_t
  + GPFeeIncome_t
  + GPCarryDistributed_t
  + GPCarryEscrowReleased_t
  - ClawbackPaid_t
```

### Period cash reconciliation

```txt
BeginningCash
+ LPCapitalCalls
+ GPCommitmentCalls
+ GrossExitProceeds
=
Investments
+ FeesPaidToManager
+ ExpensesPaid
+ LPDistributions
+ GPInvestmentDistributions
+ GPCarryDistributed
+ GPCarryEscrowed
- GPCarryReleasedFromEscrow
+ EndingCash
```

---

**End of Document**
