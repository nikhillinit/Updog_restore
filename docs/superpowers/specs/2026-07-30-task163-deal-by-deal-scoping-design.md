# Task 16.3 Scoping: Internal LP Economics deal_by_deal Slice (PLAN_61 Wave F)

Date: 2026-07-30 Status: Accepted contracts; fresh exact-SHA re-sign pending
Source contract: GitHub issue #1176 Task 16.3 combined text, deal_by_deal slice
only. Provenance: 10-question scoping interview (grilling protocol), every
decision user-ratified 2026-07-30; every code citation below verified against
the live repository at `main` = `6dda7c19`, not taken from plan docs or the
knowledge graph (which correctly refused authority on a stale workspace hash).
Companion ADR: ADR-065 in `DECISIONS.md` (narrow durable choices only; this spec
holds the detail).

Ratification: waterfall-specialist and Phoenix precision-guardian independently
re-signed the pre-terminal contracts on 2026-07-30 against exact SHA
`d2b39f7db476ca8a7497b21688c79e1178a6a352`. Terminal-policy repair requires a
fresh exact-SHA dual-specialist re-sign.

## Verdict: scoped production implementation pending fresh re-sign

**Candidate GO scope after re-sign:**

1. WP-L2 quarterly fee/expense compiler and cash-assembly state machine.
2. WP-L3 basis resolution, service, lineage, idempotency, and atomic
   persistence.
3. WP-L4 manifest-registered restricted internal-investment analytics routes.
4. Schema migrations only inside reviewed implementation PRs owned by the work
   package that consumes them.

After re-sign, GO authorizes implementation only. It does not authorize
deployment, activation, production traffic, or claim feature availability. No
production internal LP economics engine exists at ratification. `available`
remains typed-but-unreachable until a certified Decimal-native money core
exists.

**Completed readiness evidence:**

- Authoritative opening cash and opening waterfall state land in pinned facts
  through the attested source-artifact bridge (Blocker B1).
- Exact zero-fee/no-double-count proof and typed rejection for every nonzero,
  absent, or ambiguous fee/expense input are implemented (Blocker B2).
- Immutable capital-envelope design is complete; persistence belongs only in its
  reviewed owning WP-L3 implementation PR.
- Decimal no-hurdle parity decision made (see D10 sequencing). RESOLVED
  (user-ratified 2026-07-30, escalation E1): the Decimal core CORRECTS
  unreturned-capital accounting — not a parity migration.
- Release-schema-audit remediation resolved (GitHub issue #1179). RESOLVED: PRs
  #1247/#1248 and exact-SHA release proof are recorded below. This removes the
  release blocker but did not independently open the production implementation
  gate.
- REVIEW-ADDED (2026-07-30): ledger unreturned-capital semantic disposition made
  (defect L-DEF-1, see D10) — parity-with-legacy vs corrected capital accounting
  decides what the Decimal core certifies. RESOLVED (user-ratified 2026-07-30,
  escalation E1): corrected capital accounting; engine + methodology version
  change with dual-pinned old-vs-new fixtures.
- REVIEW-ADDED: authoritative opening waterfall state and actual/projected
  cutover semantics defined (Brief 1, extended).
- REVIEW-ADDED: rounding contract frozen (mode, presentation boundary,
  hierarchical exact-Decimal LRM, dual conservation — see D9). RESOLVED
  (user-ratified 2026-07-30, escalation E7) and reconciled by the governance
  freeze after the former specialist NO-GO review.
- REVIEW-ADDED: forecast realization granularity resolved (quarterly aggregates
  vs per-event exits at the basis boundary — Brief 4, extended).
- Terminal resolution and the exhaustive post-term activity matrix are frozen in
  `internal-economics-terminal-resolution/1.0.0`, with 76/76 focused contract
  tests.
- RATIFICATION PENDING: fresh waterfall-specialist and Phoenix
  precision-guardian re-signs must review the exact SHA containing the terminal
  repair.

| Specialist                 | Date       | SHA                                        | Verdict                 | Exact re-sign evidence                                                                                 |
| -------------------------- | ---------- | ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| waterfall-specialist       | 2026-07-30 | `d2b39f7db476ca8a7497b21688c79e1178a6a352` | GO (pre-terminal scope) | 12 focused files, 205/205 tests; Phoenix 328/328; `npm run check` exit 0; lint and guardrails pass     |
| phoenix-precision-guardian | 2026-07-30 | `d2b39f7db476ca8a7497b21688c79e1178a6a352` | GO (pre-terminal scope) | 51/51 focused precision tests; corrected-account pins, event ordering, Decimal LRM, conservation clean |
| terminal repair re-sign    | 2026-07-30 | pending                                    | PENDING                 | Exact-SHA waterfall and precision re-signs required                                                    |

Blocker B3 (vehicle-scoped basis) does not block single-vehicle funds; it
runtime-gates SPV-bearing funds via `MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE`.
SPV/co-invest-bearing funds remain runtime-ineligible.

Historical reachability finding (verified before readiness implementation on
2026-07-30): composing the original gates, no then-persisted fund could produce
a value-bearing result. B1 alone made every run `unavailable` (no cash-balance
field existed in any facts snapshot); B2 independently did the same; and
`defaultWaterfall` (`shared/lib/economics/economics-engine.ts:276-283`) seeds an
8 percent compounded hurdle plus `clawbackEnabled: true` into every defaulted
config, so default-seeded funds refuse at policy seed
(`HURDLE_BASIS_UNSUPPORTED`, `CLAWBACK_UNSUPPORTED`). B1 and the zero-fee B2
bridge now exist, but no production engine exists at ratification. A future
implemented float64 path still caps at `indicative` (`FLOAT64_WATERFALL_PATH`),
and nonzero, absent, or ambiguous fees/expenses remain runtime-ineligible. The
`available` schema member is typed but UNREACHABLE pending certification;
consumers must not branch on availability before Decimal certification
(escalation E5 resolved 2026-07-30: user ratified keeping `available`
typed-but-unreachable in schema V1 — no omission, no version bump needed when
certification lands).

Release evidence (verified 2026-07-30): PRs
[#1247](https://github.com/nikhillinit/Updog_restore/pull/1247) and
[#1248](https://github.com/nikhillinit/Updog_restore/pull/1248) merged.
[Run 30567774563](https://github.com/nikhillinit/Updog_restore/actions/runs/30567774563)
completed successfully for exact SHA `068430726a0d1d297d50e93be36a67f90238a26a`,
with clean production schema audit and no DDL, staged inspect locator
`5fB4SsnPTmF76xw13nRQhwFf55jb`, 12/12 staged smoke tests, 12/12 production smoke
tests, and successful GitHub production deployment `5679938936`. Issue
[#1179](https://github.com/nikhillinit/Updog_restore/issues/1179) closed
2026-07-30. This removed one release blocker but did not independently open the
Task 16.3 implementation gate. The prior exact-SHA dual-specialist ratification
opened the pre-terminal lane; the terminal repair temporarily closes it until
fresh exact-SHA dual-specialist re-sign.

## D1. Fidelity posture: A+ (indicative float64 core, hardened boundaries)

- V1 keeps the float64 event-level engine. Mandatory provenance labels:
  `precisionMode` and `accountingGrain: 'event_level_fund_scope_approximation'`.
  Product language: internal projection, not an accounting statement.
- AMENDED by D8: the float64 waterfall path is CAPPED at
  `resultStatus: 'indicative'` with reason `FLOAT64_WATERFALL_PATH`. `available`
  is reserved for a certified Decimal-native path. Repo vocabulary support:
  `shared/core/calc-substrate/calc-result.ts` defines `indicative` = "value
  present but not decision-grade; must disclose why".
- REVIEW-ADDED grain honesty (2026-07-30): within this program, `deal_by_deal`
  is DEFINED per issue #1176 finding W8 — a non-compounding hurdle computed
  fresh against outstanding capital at each event, NOT strict per-security
  cost-basis netting; neither existing engine has per-deal capital accounts, and
  the `accountingGrain: 'event_level_fund_scope_approximation'` label is the
  load-bearing disclosure. Additionally, the persisted forecast contract emits
  only quarterly aggregate `distributionsUsd` (no per-event exits at the basis
  boundary) — see Brief 4 (extended) for the realization-granularity decision
  this forces on event rows.
- Hardening goes where the error mass is (estimated during scoping — the float64
  cents-scale figure below is an UNBENCHMARKED order-of-magnitude estimate; the
  Decimal-parity track owes an error-bound benchmark before the estimate is
  load-bearing): float64 substrate error over 40 quarters is on the order of
  cents on a 100M fund; the material risks are unit errors (100x+), hurdle
  time-basis (tens of millions over 10y), catch-up omission (~1M-scale),
  terminal policy (up to half of TVPI). Hence: branded unit types on every
  input; full-precision entitlement, threshold, and accounting-state math;
  hierarchical exact-Decimal LRM only after each emitted event total is
  HALF_UP-rounded to cents at the presentation boundary; conservation assertions
  that fail the run; truth cases pinned on both full-precision and emitted-cent
  results. Rounded presentation never feeds accounting state.
- No catch-up math in V1; no Decimal refactor of the shared ledger in PR-1 (see
  D10 sequencing for the Decimal path).
- Issue #1176 exit-gate wording ("genuine Decimal-derived boundaries") is
  amended by ADR-065: decimal-string formatting at boundaries plus indicative
  capping until the Decimal-native core certifies.
- REVIEW-REJECTED (user-ratified 2026-07-30, escalation E4): a plan-repair
  review proposed inverting this posture (Decimal-first, float64 shadow-only).
  Rejected — the `indicative` cap plus `FLOAT64_WATERFALL_PATH` already contains
  the risk; the A+ posture stands as ratified.

## D2. Purity contract and basis

```text
result = f(basis, economicsPolicyVersion, engineVersion, methodologyVersion)
```

- Zero ad-hoc overrides at the canonical run endpoint.
- Facts snapshots contain OBSERVATIONS only. Operator assumptions (carry,
  hurdle, fees, expenses, cash buffer, terminal policy, capital envelope) live
  in immutable policy versions, never in facts.
- "Same basis -> same result forever" holds only with engine and methodology
  versions pinned.
- EXPLICIT basis IDs required. Anti-pattern on record: the current-forecast
  service (`server/services/current-forecast-v2-service.ts`,
  `RunCurrentForecastV2Input`) accepts optional `currentPlanVersionId` /
  `financialFactsSnapshotId` and resolves omissions to latest; the GP-economics
  service does the same with fund configs
  (`server/services/economics-calculation-service.ts`). Internal economics must
  not latest-resolve anything.
- Sensitivity analysis = persisted immutable scenario plan version, never
  promoted to current. Persistence happens before calculation; UI may make this
  feel instant.
- `waterfallTemplate: 'deal_by_deal'` is a literal route guard, not an override.
  Future template choice lives in persisted economics policy.
- Cash buffer is persisted policy or an explicitly versioned default policy.
  Never silently defaulted.

## D3. Policy entity and run lineage

Policy is authored configuration, not calculated state. `fund_snapshots` remains
result storage per `docs/adr/ADR-014-snapshot-governance.md` (Snapshot
Governance — full-path citation is mandatory: `DECISIONS.md` carries a DIFFERENT
"ADR-014: Test Baseline & PR Merge Criteria"; the two series collide on
numbers).

New table `internal_economics_policy_versions` (precedent: `currentPlanVersions`
in `shared/schema/current-plans.ts`). Minimum columns:

```text
id, fund_id, version, policy_schema_version, policy_body (JSONB,
contract-versioned), assumptions_hash, source_config_id,
source_config_version, parent_policy_version_id, idempotency_key,
request_hash, created_at, created_by
```

- Unique `(fund_id, version)` does NOT enforce immutability: add append-only DB
  protection or a trigger preventing changes to policy body, hash, and
  provenance.
- Responsibility split: current plan owns deployment pacing and portfolio
  construction; economics policy owns waterfall, fees, expenses, call/cash
  policy, terminal mechanics, and REFERENCES the capital-envelope policy/version
  (a separate immutable entity — see Briefs).
- Seed provenance: `source_config_id` + `source_config_version` (GP-economics
  inputs persist in versioned `fundConfigs.config`, parsed by
  `FundDraftWriteV1Schema`). REVIEW CAVEAT: the draft-write contract has NO
  dedicated hurdle field — hurdle is DERIVED at normalization time from
  `waterfallTiers[].preferredReturn` (`defaultWaterfall`,
  `economics-engine.ts:276`), defaulting to 8 percent compounded when tiers are
  absent. Seed detection for `HURDLE_BASIS_UNSUPPORTED` therefore reads the tier
  fields and the normalized assumptions, never a persisted hurdle column; the
  detection source must be named explicitly in the seed design.
- Run lineage: new table `internal_lp_economics_runs` with FK-backed references
  to policy version, facts snapshot, plan version, forecast snapshot, and result
  snapshot. Never IDs buried only in result JSON.
- Results persist as `fund_snapshots.type = 'INTERNAL_LP_ECONOMICS'`, enrolled
  in `NON_TIMELINE_SNAPSHOT_TYPES` (`shared/schema/fund.ts:148`). The denylist
  is FAIL-OPEN (`notInArray` readers in `fund-state-read-service.ts` and
  `time-travel-analytics.ts`); enrollment plus reader regression tests close
  THIS slice's leak risk, but the fail-open classification gap (previously cited
  as "finding 6" from an uncommitted review doc — re-anchored here) stays open
  until classification is fail-closed (out of slice scope). REVIEW NOTE
  (verified 2026-07-30): the leak is not hypothetical — the legacy `ECONOMICS`
  snapshot type is NOT enrolled in `NON_TIMELINE_SNAPSHOT_TYPES`
  (`shared/schema/fund.ts:148` lists only `CURRENT_FORECAST_V2`,
  `RESERVE_INTELLIGENCE`), so existing ECONOMICS rows already flow into
  fail-open timeline readers today. Follow-up worth filing: a lint/source gate
  on any new `fund_snapshots` query lacking the denylist filter (repo precedent:
  the decimal-string-laundering and legacy-calculation-consumers guards).
- Migration-bearing work above proceeds only in the reviewed owning
  implementation PR; #1179 no longer blocks it.

## D4. Policy waterfall semantics: catch-up and hurdle

- Catch-up: structurally excluded from V1 `policy_body` (no field exists). Seed
  refusal `CATCH_UP_UNSUPPORTED` inspects `prefCatchUp`, `catchUpRate`, AND
  `catchUpTargetCarryPct` — never silently discard dormant-but-contradictory
  fields. Refusal targets ACTIVE semantics; disabled features with dormant
  parameters get an explicit normalization warning/confirmation, not an
  unsupported-feature failure (the defaults constructor `defaultWaterfall` in
  `shared/lib/economics/economics-engine.ts` can carry dormant nonzero settings,
  e.g. a catch-up rate while `prefCatchUp` is false). REVIEW-ADDED: every
  normalization outcome (dropped dormant fields plus the confirmation) PERSISTS
  in policy provenance and participates in `assumptions_hash` — a
  silently-dropped dormant parameter leaves no audit trail and is a latent
  activation hazard if the controlling flag later flips. G1-default treatment
  (SUPERSEDED 2026-07-30 by the user's strict catch-up ruling, E3 revision):
  issue #1176's G1 default ("no hurdle, 100 percent GP catch-up to a 20 percent
  carry split") CONFLICTS with V1's structurally catch-up-free policy.
  `prefCatchUp: true` seed-refuses (`CATCH_UP_UNSUPPORTED`) even when hurdle
  basis is `'none'`; only dormant numeric catch-up fields with
  `prefCatchUp: false` normalize with a persisted warning. This is a ratified
  deviation from G1 (Deviation register entry 3), not a reconciliation.
- Hurdle: required `{ rate, basis }`. The ledger's flat-at-event semantics
  (`hurdleRate` applied as a flat percent of outstanding capital at event time,
  `shared/lib/waterfall/american-ledger.ts:152-155`) is NEVER exposed in the
  policy surface — it is not a preferred return, and over a 10-year hold it
  understates an 8 percent/yr compounding pref by an order of magnitude. The
  flat mode stays a ledger-internal legacy path pinned by truth cases L01-L14.
- Sequencing (no unsupported enum values advertised):
  1. Policy schema V1 permits `basis: 'none'` only.
  2. Seed/import recognizes pref-bearing source configuration and returns
     `HURDLE_BASIS_UNSUPPORTED`.
  3. Fast-follow policy schema V1.1 adds `annualized_compound` with a matching
     engine and methodology version bump.
  4. Pref-bearing funds remain `unavailable` — never silently downgraded to
     no-hurdle.
- Before freezing `annualized_compound` (see compound-hurdle brief): accrual
  base (unreturned contributed capital; whether accrued pref itself compounds),
  accrual start/end dates, day-count or quarterly convention,
  partial-capital-return treatment, ordering among ROC, pref, residual LP share,
  and carry, terminal accrual date and liquidation behavior.
  waterfall-specialist sign-off covers SEMANTICS before schema addition, not
  only implementation math.
- Compound implementation is Decimal-native behind a legacy-ledger compatibility
  wrapper. Decision-grade behavior is never built atop the number-based ledger.
  In-repo precedent for Decimal discipline plus sanctioned number boundaries:
  `shared/core/cohorts/CohortProjectionV2.ts`.

## D5. Term anchor and terminal mechanics

- Required term anchor in policy: `isEvergreen: false`, `termStartDate`,
  `fundLifeYears`, and persisted resolved `terminalPeriodEnd` (no repeated date
  arithmetic at run time). Separate typed failures: `FUND_LIFE_ABSENT`,
  `FUND_TERM_START_ABSENT`, `EVERGREEN_STATUS_ABSENT` (a missing evergreen flag
  never silently means false). `isEvergreen: true` -> `EVERGREEN_UNSUPPORTED`.
- Ratified terminal-resolution methodology:
  `internal-economics-terminal-resolution/1.0.0`, frozen in
  `shared/contracts/internal-economics/terminal-policy-v1.contract.ts`.
  `fundLifeYears * 4` must resolve exactly to a positive integer quarter count;
  otherwise `FUND_LIFE_GRID_UNREPRESENTABLE`. Add `quarterCount * 3` UTC
  Gregorian calendar months to `termStartDate` in one operation, clamping the
  source day to the target month's last day. Resolve `terminalPeriodEnd` to the
  containing calendar-quarter end; an exact quarter-end legal term date remains
  unchanged. `terminalInstant` is `<terminalPeriodEnd>T23:59:59.999Z`. Persist
  `terminalPeriodEnd` and `terminalResolutionMethodologyVersion`; the exact pair
  participates in assumptions and result hashing.
- Resolve and persist the pair at policy time. Runtime accepts that pair plus
  forecast/cutover inputs and performs no term-date arithmetic. Policy readback
  rejects an unsupported persisted methodology version with
  `TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED` and a persisted date that
  differs from fresh policy-time resolution with `TERMINAL_RESOLUTION_MISMATCH`.
- Runtime forecast representation requires exactly one point whose `periodEnd`
  equals persisted `terminalPeriodEnd`. If the maximum forecast period is
  earlier, return `FORECAST_HORIZON_SHORT`. If the grid reaches or passes the
  terminal period but the exact point is missing or duplicated, return
  `FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE`. Never interpolate.
- Opening cutover may equal persisted `terminalInstant`; a later cutover returns
  `TERMINAL_BEFORE_CUTOVER`. Frozen typed-error precedence is persisted
  pair/version, cutover chronology, short horizon, then exact-point
  representability.
- Terminal modes (repo-style literals), both required in WP-L2:
  `liquidate_at_horizon | hold_unrealized`.
- `liquidate_at_horizon` exact ordering: (1) process normal terminal-quarter
  calls and exits; (2) read end-of-quarter `navUsd`; (3) create a synthetic
  realization for remaining NAV; (4) run proceeds through the waterfall; (5) set
  residual NAV to zero. Methodology label: ONE-FOR-ONE NAV REALIZATION
  assumption (not "gross proceeds") — forecast NAV already reflects projected
  activity and fee drag (`shared/core/cohorts/CohortProjectionV2.ts` ~L511-533).
- `hold_unrealized`: no synthetic distribution; DPI unchanged; NAV remains in
  TVPI; residual NAV still contributes to net IRR as a terminal-value flow,
  matching existing forecast behavior (`CohortProjectionV2.ts` ~L658: terminal
  `navUsd` pushed as final XIRR flow).
- Trust propagation: terminal processing inherits forecast trust. An
  `indicative` forecast can never produce an `available` economics result.
- Ratified post-term matrix, identical under both terminal modes:
  - Nonzero LP capital calls, projected contributions, portfolio investments,
    and projected deployment deltas reject with `POST_TERM_ACTIVITY`. Projected
    deployment means only a positive change between consecutive cumulative
    deployed-capital values; unchanged values are not deployment activity. A
    decrease rejects as `FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE` before the
    post-term matrix.
  - Nonzero compiled management fees or compiled fund expenses first reject with
    `FORECAST_FEE_BASIS_INCOMPATIBLE` under V1's zero-cost compatibility gate. A
    future fee-compatible path must reject the same post-term activity with
    `POST_TERM_ACTIVITY`.
  - Nonzero actual fund expenses, LP distributions, realized proceeds, and
    recallable distributions reject with `POST_TERM_ACTIVITY`.
  - Actual NAV marks and actual `periodNav` observations reject with
    `POST_TERM_ACTIVITY`, including zero-valued observations.
  - Later projected forecast quarterly distributions and projected NAV are
    excluded under both modes.
  - Negative source money and negative cumulative deployment inputs reject with
    `NEGATIVE_SOURCE_MONEY` before matrix or delta evaluation.
  - Exact-zero money rows are no-ops. NAV observations are observations, not
    money rows, so zero does not make them no-ops.
- Liquidation is NOT cheap: it requires valuation-basis, event-ordering,
  trust-inheritance, post-term-activity, and conservation fixtures.
- Readiness proof: 76/76 focused tests in
  `tests/unit/internal-economics/terminal-policy-v1.contract.test.ts` cover
  policy-time resolution, strict persisted-pair projection, methodology and date
  mismatch rejection, runtime-only validation, frozen error precedence,
  Gregorian clamping, timezone invariance, exact forecast representation,
  cutover chronology, hash preimage, every exported matrix source class under
  both modes, negative and zero handling, and cumulative deployment validation.
  This contract is implementation readiness evidence, not a production engine or
  feature-availability claim.

## D6. Call/cash policy (Blockers B1 and B2 live here)

- Buffer: `cashBufferQuarters: integer >= 0`, quarterly semantics (months UI, if
  any, must be multiples of three and normalize to quarters BEFORE hashing).
  Coverage target includes future deployment, fee, and expense uses; early calls
  reduce later calls one-for-one; the target rolls down to zero approaching the
  terminal horizon; no residual buffer cash remains after terminal processing.
  Effect is timing-only, never total.
- BLOCKER B1 — opening cash: must come from pinned facts with as-of provenance.
  VERIFIED: `financial-facts-snapshot-v1.contract.ts` exposes cash-flow EVENT
  series only — no authoritative cash-balance field. Missing balance ->
  `OPENING_CASH_UNAVAILABLE`; never assume zero.
- Lineage gate: same source-config version is necessary but NOT sufficient (two
  transforms can share a config yet differ in effective fee schedule). Required
  matches: `economicsPolicyVersionId`, `capitalEnvelopeVersionId`,
  `effectiveFeeExpenseHash`. Same-lineage-different-methodology is caught by
  `CONFIG_LINEAGE_MISMATCH` vs `FORECAST_FEE_BASIS_INCOMPATIBLE` (two distinct
  codes).
- BLOCKER B2 — fee-drag reconciliation: the forecast subtracts flat
  `annualFeeDragPct / 4 x deployableCapitalUsd` from projected NAV
  (`CohortProjectionV2.ts` ~L511). The flat rate is produced by
  `shared/lib/economics/fee-drag-compiler.ts`, whose own comment states "Basis
  is intentionally ignored: this compiler flattens the shared fee inputs to one
  rate" (last-matching-tier-wins, averaged over horizon). Config lineage or
  flat-rate equality is therefore an INSUFFICIENT bridge.
  `effectiveFeeExpenseHash` must cover the exact canonical quarterly fee/expense
  DOLLAR VECTOR plus compiler version, application mode, capital base, and
  horizon. Expenses must be zero unless the forecast carries a matching expense
  vector. Otherwise reject `FORECAST_FEE_BASIS_INCOMPATIBLE`.
- Call assembly mechanics: do NOT divide `calculateManagementFeeForYear` by four
  (module-private, annual, evaluates dynamic bases once per year —
  `shared/lib/economics/economics-engine.ts:387`). Build a Decimal-native
  quarterly fee/expense accrual primitive. Define basis measurement timing
  (beginning-, average-, or end-of-quarter). Deployment funding call at
  `periodStart` or prior quarter-end; fee/expense true-up at `periodEnd`. The
  cash recurrence explicitly orders: opening cash, calls, deployments, fees,
  expenses, proceeds, distributions, ending cash. Fee-transition fixture
  mandatory. Event ordering is frozen as
  `internal-economics-event-ordering/1.0.0`, with canonical key
  `(effectiveAt, eventClassPriority, stableSourceId)` and priority table:
  `lp_capital_call=1`, `portfolio_investment=2`, `fund_expense=3`,
  `realized_proceeds=4`, `lp_distribution=5`, `recallable_distribution=6`.
  Persisted facts already contain `eventType`, `effectiveAt`, and `eventId`;
  facts `eventClassPriority` derives from `eventType`, and facts
  `stableSourceId` derives post-insert as
  `facts:<snapshotId>:cash_flow_event:<eventId>`. Neither derived field is
  persisted redundantly. Forecast uses canonical type
  `forecast_quarterly_distribution`, priority `4`, stable key
  `forecast:<id>:quarter:<periodEnd>:forecast_quarterly_distribution`, and
  `effectiveAt=<periodEnd>T23:59:59.999Z`. The methodology version pins this
  derivation and permutation fixtures prove it. Also note a SECOND fee channel
  exists upstream: `derive-current-plan-v1.ts:140-145` already reduces
  deployable capital by the compiled drag
  (`fundSize x (1 - annualDrag x horizonYears)`) — Brief 2's identity must prove
  each fee dollar appears exactly once across deployable-capital reduction,
  forecast NAV drag, and economics cash assembly (one review asserts the
  forecast already double-burdens fees across these channels; unproven — exactly
  what the identity settles).
- Envelope enforcement: reject-never-clamp. Use the LEGAL capital-envelope
  version (LP/GP/total components), NOT forecast-derived `committedCapitalUsd`.
  `COMMITTED_CAPITAL_EXCEEDED` context reports the first violating quarter,
  requested call, remaining capacity, and cumulative calls. Recallable
  distributions never expand capacity while recycling is unsupported.
- Escrow/recycling: structurally excluded from V1 policy body; ACTIVE
  source-config semantics seed-refuse (`ESCROW_UNSUPPORTED`,
  `RECYCLING_UNSUPPORTED`); dormant-parameter cases get normalization warnings
  (same rule as catch-up). The ledger's recycling parameters are never
  exercised; truth cases assert the zeroed behavior.

## D7. Vehicle scope (Blocker B3 lives here)

- V1 computes main-fund LP economics only. `vehicles.spvEconomics` is an
  unconsumed JSONB placeholder (zero readers repo-wide); SPV/co-invest
  consolidation is deferred to a designed V2-plus feature. Deferral is explicit
  here and in ADR-065 — not silent.
- Envelope corrections: the partial unique index (`shared/schema/vehicles.ts`
  ~L61) guarantees AT MOST one `main_fund` vehicle, not exactly one;
  `committedCapital` is nullable and total-only. Typed:
  `MAIN_FUND_VEHICLE_ABSENT`, `MAIN_FUND_COMMITMENT_ABSENT`,
  `MAIN_FUND_CURRENCY_UNSUPPORTED`. Envelope LP plus GP components must
  reconcile EXACTLY to the vehicle total. Plan, policy, facts, forecast, and
  envelope all pin `vehicleScope: main_fund`.
- BLOCKER B3 — main-fund-scoped basis absent: facts snapshots are
  type-constrained to `vehicleScope: 'fund_all'` at BOTH the schema
  (`shared/schema/financial-facts-snapshots.ts:39`, `$type<'fund_all'>`) and the
  contract (`financial-facts-snapshot-v1.contract.ts` ~L368,
  `z.literal('fund_all')`); `periodNav` has no vehicle dimension; the forecast
  is fund-all and may blend SPV NAV. Consumer-side event filtering CANNOT create
  main-fund economics.
- Gate: V1 runs ONLY when the roster contains EXACTLY ONE VEHICLE TOTAL (the
  main fund). ANY `spv` or `co_invest` roster entry ->
  `MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE` until vehicle-scoped facts and
  forecast exist (see brief). "One main_fund plus SPVs" does NOT pass.
- Once scoped facts exist: null-`vehicleId` events are attributable only in
  single-vehicle rosters and recorded as INFERRED provenance; ambiguity ->
  `VEHICLE_ATTRIBUTION_AMBIGUOUS`. The typed per-vehicle exclusion summary
  covers vehicleId, vehicleType, cash-flow counts and signed totals by
  eventType, mark count and NAV total, position/participation counts, and
  attribution mode; the summary participates in the assumptions/input hash.
- Perspective is fixed BY SEMANTIC ROLE, frozen in this spec, never an
  implementer choice or request override:

```text
actual LP capital calls, LP distributions   -> lp_net
portfolio investments, expenses,
realized proceeds, NAV                      -> fund_gross
```

Never sum lp_net distributions and gross realized proceeds as equivalent flows.
A missing required perspective -> typed unavailable, no fallback precedence. The
scoped-facts policy must preserve required perspectives explicitly (current
facts construction keeps one preferred perspective per eventType/vehicle and may
discard alternatives). REVIEW-ADDED (verified 2026-07-30): the forecast's own
ACTUAL buckets blend `lp_distribution` and `realized_proceeds` into a single
distributions bucket (`CohortProjectionV2.ts:248-256`) — a second, independent
reason economics can never consume forecast actual rows; actual result rows are
constructed from scoped facts under the perspective roles above, with the
explicit cutover defined in Brief 1 (extended).

## D8. API surface, execution, status model, idempotency

Routes (restricted internal-investment analytics access, not generic fund access
— REVIEW CAVEAT: no policy by that name exists today; the closest precedent is
`require_auth_fund_access_and_role` on the moic/reserve-intelligence routes in
`server/route-policy/api-route-policy-registry.ts`, and the concrete role
predicate plus a create/run/read role matrix with negative tests is a decision
REQUIRED before L4; registration = manifest entry + implementation map +
`register_routes` order + route-policy registry + schema metadata + endpoint
coverage; `makeApp` derives order from the manifest —
`server/routes/mount-common-routes.ts`):

```text
POST /api/funds/:fundId/internal-economics/policies      201 new / 200 replay
GET  /api/funds/:fundId/internal-economics/policies      bounded cursor pagination
GET  /api/funds/:fundId/internal-economics/policies/:policyVersionId
POST /api/funds/:fundId/internal-economics/runs          200 always (incl. persisted unavailable); never 202
GET  /api/funds/:fundId/internal-economics/runs/:runId   lineage join to result snapshot
```

- Run body carries independently selectable basis IDs only; the capital envelope
  is transitively pinned by the policy and never duplicated.
- Ownership: extend `server/lib/fund-scoped-ownership.ts` kinds (current set has
  no policy-version/envelope/run kinds; the `fund_snapshot` kind checks
  ownership only and must also validate expected snapshot TYPE).
- Execution: synchronous. Maximum period count, execution deadline, and duration
  telemetry. Engine/infrastructure crash -> 500; lineage may record `failed`; no
  fabricated result snapshot.
- Status model (VERIFIED precedents: the shadow service throws on `held` as an
  engine status; `calc-result.ts` separates value trust from failure):

```text
runState:     completed | failed          (lineage/lifecycle; excluded from resultHash)
resultStatus: available | indicative | unavailable
servingState: future concern; `held` lives there if economics ever gains
              activation/pointers
```

`resultStatus` = worst of forecast trust, policy gates, methodology trust, and
numerical trust. Float64 waterfall path caps at `indicative` with
`FLOAT64_WATERFALL_PATH`.

- Idempotency: route injects authoritative `fundId` and `contractVersion` before
  `runIdempotentCommand` (`server/lib/idempotent-command.ts` canonical SHA-256
  preimage). Preimage = normalized request + every direct basis ID + template +
  resolved policy/config hashes + engine/methodology versions. Unique
  `(fund_id, idempotency_key)`; persisted request hash; lineage and result
  snapshot inserted atomically; same key/preimage replays; changed preimage
  -> 409. REVIEW-ADDED decision item: whether a persisted `failed` run CONSUMES
  its idempotency key (recommendation: yes — identical replay returns the same
  failure and run id rather than re-executing); concurrent identical and
  concurrent changed-preimage requests are acceptance fixtures, not
  implementation details.
- REVIEW-ADDED persistence acceptance invariants (freeze before L3): exactly one
  `INTERNAL_LP_ECONOMICS` result snapshot per completed run; no result snapshot
  for a `failed` run; exactly one persisted `unavailable` snapshot for a
  completed-unavailable run; `ON DELETE RESTRICT` on every basis-version FK;
  DB-enforced check that the referenced result snapshot has the expected type
  (the `fund_snapshot` ownership kind is type-blind today); and an unambiguous
  reference direction (run points to snapshot) — never a circular graph.
- REVIEW-ADDED status-phase rationale: the 422-at-seed vs 200-persisted-
  unavailable-at-run asymmetry is intentional — seed failure REFUSES to create
  an entity (nothing exists to persist or replay; 422), while run unavailability
  is a persisted, replayable computation OUTCOME (200). Stated so the asymmetry
  reads as design, not accident.

## D9. Result schema

- Single-member discriminated union on `waterfallTemplate`: `deal_by_deal` only.
  NO whole-fund stub. whole_fund arrives as a V2 publish, never silent V1
  widening.
- Nested `resultStatus` discriminated union inside the template member:
  `available | indicative` carry series/events/totals (available: reasons empty;
  indicative: reasons nonempty); `unavailable` carries no value arrays/totals
  and nonempty reasons.
- API composition (runState outside the immutable result):

```text
{ run: { runId, runState: 'completed' | 'failed', ... }, result: ResultV1 | null }
```

- Perspective locked `lp_net`; envelope carries `currency: 'USD'` and
  `perspective: 'lp_net'`. GP commitment flows modeled separately (precedent
  `EconomicsAnnualRowV1Schema`, `shared/contracts/economics-v1.contract.ts`
  ~L201): if PR-1 cannot model GP commitment participation, nonzero GP
  commitment is rejected explicitly (`GP_COMMITMENT_UNSUPPORTED`), never folded
  into LP flows.
- Quarterly rows (all money `MoneyDecimalStringSchema`, ratios
  `RatioDecimalStringSchema`, shared canonical formatter; never `number`
  round-trips):

```text
periodStart, periodEnd, source: actual | projected,
openingCashUsd,
lpCapitalCallUsd, gpCommitmentCallUsd,
portfolioDeploymentUsd,
managementFeesUsd, fundExpensesUsd,
grossRealizedProceedsUsd,
lpDistributionUsd, gpInvestmentDistributionUsd, gpCarryDistributedUsd,
endingCashUsd,
grossNavUsd, lpNetNavUsd,
cumulativeLpPaidInUsd, cumulativeLpDistributedUsd,
dpi | null, rvpi | null, tvpi | null
```

Ratios are null before positive LP paid-in (precedent:
`server/services/lp-reporting/metrics-engine.ts` ~L307, ZERO_CONTRIBUTIONS) —
never fabricated zero. `lpNetNav = grossNav x   (1 - gpShare)` distinction per
`economics-engine.ts` ~L837. REVIEW CAVEAT (2026-07-30): under a deal-by-deal
waterfall the GP claim on unrealized value is NOT a flat share — carry accrues
only above return of capital (and any future hurdle), so the flat haircut
over-assigns GP value on below-threshold NAV, biasing LP NAV, RVPI, TVPI, and
the hold-mode terminal XIRR flow DOWNWARD. V1 keeps the flat-share derivation as
a LABELED approximation: every lpNetNav-derived output carries indicative reason
`LP_NET_NAV_FLAT_SHARE_APPROXIMATION` (registry; ratified 2026-07-30, escalation
E6) until a hypothetical-liquidation attribution is designed.
Label-now/design-later is the user-ratified posture; any attribution-method
change touches waterfall semantics and requires waterfall-specialist sign-off
per Phoenix protected-path rules. While `GP_COMMITMENT_UNSUPPORTED` is active,
`gpCommitmentCallUsd` and `gpInvestmentDistributionUsd` are structural
placeholders that are exactly zero BY REFUSAL, not modeled zeros — documented so
schema readers do not infer modeled GP participation. Cash invariant:

```text
ending cash = opening cash
            + LP calls + GP commitment calls + gross proceeds
            - deployment - fees - expenses
            - LP distributions - GP investment distributions - GP carry
```

NAV is a stock, outside the cash recurrence.

- Event rows: `eventSequence`, stable `eventId`, typed `sourceRefs`,
  `lpUnreturnedCapitalBeforeUsd`, `lpUnreturnedCapitalAfterUsd` (REVIEW
  CONTINGENCY, resolved by escalation E1 2026-07-30: these two fields may be
  emitted ONLY by an engine that actually maintains a dedicated
  unreturned-capital account — the legacy ledger does NOT; it derives
  outstanding capital as paidIn minus distributions-including-profit, defect
  L-DEF-1 in D10, and must never populate them. The ratified
  corrected-accounting Decimal core WILL maintain that account and emits them
  once certified), `grossProceedsUsd`, `lpCapitalReturnUsd`, `lpProfitShareUsd`,
  `gpInvestmentDistributionUsd`, `gpCarryUsd`,
  `eventKind: forecast_quarterly_distribution | terminal_realization`
  (documented as modeled forward events, not historical LP distributions).
  Forecast events use the D6 canonical priority, stable source key, and UTC
  period-end instant; they are never mislabeled `forecast_exit`. V1 is
  clawback-free per issue. Event conservation: gross = LP capital return + LP
  profit share + GP investment distribution + GP carry. Quarterly/event
  reconciliation identities are enforced; events are DECOMPOSITION only —
  consumers must not sum both arrays as separate cashflows.
- Terminal/XIRR exact rules: `liquidate_at_horizon` -> terminal event REQUIRED
  when pre-terminal NAV is positive; final NAV becomes zero; XIRR uses resulting
  distributions only (adding terminal NAV after liquidation double-counts).
  `hold_unrealized` -> terminal event FORBIDDEN; residual LP-net NAV remains;
  XIRR adds exactly one synthetic terminal-NAV flow. Add
  `terminalNavBeforeRealizationUsd`. IRR block: `lpNetIrr`,
  `lpNetIrrBasis: cash_only | cash_plus_terminal_nav`, `lpNetIrrDiagnostic`
  reusing the ADR-010 XIRR taxonomy
  (`shared/contracts/lp-reporting/lp-metric-run.contract.ts`:
  convergence/method/boundHit/failureReason). No duplicate cashflow array —
  flows derive exactly from quarterly LP calls, LP distributions, and the
  optional final LP-net NAV. REVIEW CLARIFICATION: "certified Decimal-native
  path" means Decimal-native MONEY allocation with a SANCTIONED float64 XIRR
  boundary — the canonical solver accepts `number` flows
  (`shared/lib/finance/xirr.ts`, ADR-015 bounded rates) and XIRR is a
  diagnostic, not money. XIRR non-convergence or a bound hit yields a null IRR
  plus its diagnostic and does NOT cap `resultStatus`; the money results stand.
- Totals: LP and GP commitment calls; deployment, fees, expenses; gross
  proceeds; LP capital returned and LP profit distributed; total LP
  distribution; GP investment distribution and GP carry; ending cash, gross NAV,
  LP-net NAV; nullable DPI/RVPI/TVPI; LP net IRR plus diagnostic.
- Envelope: `clock` is the pinned evaluation clock, not request arrival. REVIEW
  CLARIFICATION: `clock` is BASIS — pinned in the request, it participates in
  the idempotency preimage and the result hash like any other basis ID and
  replays byte-identical; it is NOT one of the excluded timestamps (those cover
  run-lineage times only). Two runs on identical basis by definition share the
  same pinned clock. Typed per-vehicle exclusion summary with deterministic
  ordering. Hash covers basis, value, provenance, exclusions, and reasons;
  excludes run IDs, timestamps, replay flags.
  `precisionMode: decimal_native_with_float64_xirr` once waterfall money math is
  Decimal-native; while the number ledger remains, results cap at `indicative`.
- Conservation: enforced at full precision AND, REVIEW-ADDED, again in emitted
  units after rounding (post-rounding cents must also conserve); violation at
  either precision -> failed run, no result. No `conservation: false` field
  ever.
- RATIFIED rounding contract (required for L2 acceptance; reconciles the former
  waterfall and precision NO-GO findings): entitlement, threshold, and
  accounting-state math remains full precision. No ratio split rounds to cents,
  and no rounded presentation value participates in threshold comparison or
  feeds accounting state. HALF_UP converts each emitted event total to integer
  cents only at the presentation boundary. Hierarchical exact-Decimal LRM first
  allocates event cents across LP ROC, LP preferred return, and residual, then
  allocates residual-stage cents across LP residual and GP carry. Each stage
  floors exact entitlement cents and distributes shortfall by exact Decimal
  remainder DESC, stable index ASC. Tie contract:
  `LP is canonical first bucket and wins exact-remainder ties. Otherwise largest exact Decimal remainder wins.`
  Independently rounding each entitlement is forbidden. Full-precision and
  emitted-cent conservation both fail closed; money persists at six decimals,
  ratios/rates at their frozen field scales, negative values reject, and signed
  zero canonicalizes to zero.

## D10. Architecture and sequencing

Layering:

- L1 pure waterfall allocation: existing shared ledger
  (`shared/lib/waterfall/american-ledger.ts`), recycling/clawback off, `'none'`
  hurdle only; UNTOUCHED in PR-1; injected into L2 through an allocation
  interface.
- KNOWN SEMANTIC DEFECT L-DEF-1 (review finding, VERIFIED by live execution
  2026-07-30): the ledger derives outstanding capital as `paidIn - distributed`
  where `distributed` includes LP PROFIT distributions, so a contribution AFTER
  a profitable exit is treated as already returned. Live repro: contribute 100
  in Q1, exit 200 in Q2, contribute 100 in Q3, exit 100 in Q4 -> ledger returns
  ROC 20 / carry 16 for Q4, where capital-account semantics require ROC 100 /
  carry 0 (prior profit distributions cannot return a later contribution).
  Separately, contributions after the FINAL exit are dropped from `paidIn`
  entirely (paid-in only advances per exit event), understating paid-in and
  corrupting DPI/TVPI denominators. Characterization PINS both behaviors as
  LEGACY; they are not product truth, and `lpUnreturnedCapital*` result fields
  are contingent on a repaired account (D9).
- L2 split internally: (2a) canonical quarterly fee/expense schedule COMPILER;
  (2b) cash-assembly STATE MACHINE.
- L3 service: basis resolution, ownership, lineage gates, trust propagation,
  idempotency, atomic persistence.
- L4 manifest-registered restricted routes.

Precision migration is SEPARATED from hurdle semantics:

```text
characterization (complete; pins L-DEF-1 as legacy behavior)
  -> SEMANTIC DISPOSITION (user-RATIFIED 2026-07-30, escalation E1): the
     Decimal core CORRECTS unreturned-capital accounting. This is NOT a
     parity migration: engine + methodology version change, dual-pinned
     old-vs-new fixtures (LEGACY-* pins untouched); lpUnreturnedCapital*
     event fields become emittable once the corrected core certifies.
     (Rejected alternative: preserve legacy parity, which would have kept
     lpUnreturnedCapital* unavailable.)
  -> Decimal no-hurdle corrected-accounting core certified behind
     compatibility wrapper
  -> specialist-reviewed compound hurdle (schema V1.1)
```

Never combine numeric migration with new hurdle semantics or another unreviewed
waterfall-behavior change. The E1-ratified correction of L-DEF-1
unreturned-capital accounting is the named exception and requires the recorded
engine/methodology version change plus dual-pinned old-vs-new fixtures. Until
Decimal certification lands, integrated results remain `indicative` with
`FLOAT64_WATERFALL_PATH`.

Readiness executable proofs freeze three seams without implementing a production
engine at ratification: the hierarchical presentation oracle in
`tests/unit/truth-cases/helpers/task163-presentation-rounding-oracle.ts`; exact
same-input corrected counterparts for `LEGACY-04` and `LEGACY-05` in
`docs/waterfall-corrected-capital-account.truth-cases.json`; and the derived
event-order contract in
`shared/contracts/internal-economics/event-ordering-v1.contract.ts`. These are
test/contract artifacts, not L2 assembly. Atomic run/result persistence,
idempotency races, and failure rollback remain mandatory WP-L3 implementation
acceptance.

REVIEW-ADDED work-package naming (replaces the ambiguous "PR-1" label): WP-CHAR
(completed characterization PR), WP-DECIMAL (semantic disposition + Decimal
track), WP-L2 (compiler + state machine), WP-L3 (service/persistence), WP-L4
(routes). Where this document says "PR-1" it means the first gated integration
package (WP-L2 onward) unless it explicitly names the characterization PR.

REVIEW-RESOLVED wave order (user-ratified 2026-07-30, escalation E2): a review
claimed this Decimal-ledger track contradicts R34-i's "seam ships with its first
consumer" rationale. Reconciliation per issue #1176's own Task 16.2 text: the
R34-i seam is the Decimal tier-allocation primitive whose first consumer is the
whole_fund quarterly loop; the deal_by_deal slice is backed by the relocated
shared ledger — a second, distinct Decimal workstream. WP-DECIMAL therefore
sequences after WP-CHAR with no wave reordering.

Scope guards carried from Task 16.0/16.1 (unchanged):
`shared/contracts/ economics-v1.contract.ts` and `WaterfallAssumptionsV1Schema`
are not modified; `WaterfallTypeSchema` is never imported or round-tripped;
`FORBIDDEN_TOKENS` and the integration scanner are not weakened; client ledger
consumers keep the `@/lib/waterfall/american-ledger` shim.

## Rejection-code registry

One definitions registry; each entry carries phase, outcome, trigger, and typed
context. Reason shape `{ code, detail, context? }`; reasons canonically sorted
and deduplicated before hashing. Align conventions with
`shared/core/calc-substrate/reason-codes` rather than inventing a parallel
vocabulary.

Phase: policy-seed (HTTP 422, no policy created):

```text
CATCH_UP_UNSUPPORTED         active catch-up semantics in source config
CLAWBACK_UNSUPPORTED         active clawback semantics (REVIEW-ADDED:
                             defaultWaterfall emits clawbackEnabled: true
                             into every defaulted config — the
                             active/dormant determination must be
                             explicit; silent normalization forbidden)
ESCROW_UNSUPPORTED           active escrow semantics
RECYCLING_UNSUPPORTED        active recycling semantics
HURDLE_BASIS_UNSUPPORTED     pref-bearing source config; schema V1 is basis 'none'
FUND_LIFE_ABSENT             no fund life resolvable
FUND_LIFE_GRID_UNREPRESENTABLE
                             fundLifeYears * 4 is not a positive integer quarter count,
                             or resolved Gregorian date is outside supported range
FUND_TERM_START_ABSENT       no term start resolvable
EVERGREEN_STATUS_ABSENT      evergreen flag missing (never silently false)
EVERGREEN_UNSUPPORTED        isEvergreen true
CREDIT_FACILITY_UNSUPPORTED  issue-mandated; loc/lineOfCredit identifiers forbidden
                             (DEVIATION: #1176 words this as run-phase
                             'unavailable'; seed-phase 422 chosen here —
                             see Deviation register)
```

Dormant-but-disabled parameters: normalization warning/confirmation, not
failure. REVIEW-ADDED: normalization outcomes persist in policy provenance and
participate in `assumptions_hash` (see D4).

Phase: run unavailability (HTTP 200, persisted `unavailable`):

```text
OPENING_CASH_UNAVAILABLE               no authoritative opening cash in facts (B1)
FORECAST_FEE_BASIS_INCOMPATIBLE        fee-vector bridge unproven (B2)
CONFIG_LINEAGE_MISMATCH                policy/plan descend from different config versions
FORECAST_UNAVAILABLE                   pinned forecast unavailable
FORECAST_FAILED                        pinned forecast failed
FORECAST_HELD_UNSUPPORTED              pinned forecast is serving-plane held
FORECAST_HORIZON_SHORT                 maximum forecast period precedes terminalPeriodEnd
FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE
                                       grid reaches/passes terminalPeriodEnd but exact
                                       point is missing or duplicated
FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE
                                       cumulative deployedUsd decreases between periods
NEGATIVE_SOURCE_MONEY                  source money or cumulative deployment is negative
TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED
                                       persisted terminal methodology version is unsupported
TERMINAL_RESOLUTION_MISMATCH           persisted terminalPeriodEnd differs from policy-time
                                       resolution
TERMINAL_BEFORE_CUTOVER                opening cutover is later than terminalInstant
POST_TERM_ACTIVITY                     prohibited post-term calls, positive deployment
                                       delta, actual money event, or NAV observation
COMMITTED_CAPITAL_EXCEEDED             context: first violating quarter, requested
                                       call, remaining capacity, cumulative calls
MAIN_FUND_VEHICLE_ABSENT               no main_fund vehicle row
MAIN_FUND_COMMITMENT_ABSENT            main_fund committedCapital null
MAIN_FUND_CURRENCY_UNSUPPORTED         non-USD main fund
MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE  any spv/co_invest roster entry (B3)
VEHICLE_ATTRIBUTION_AMBIGUOUS          null vehicleId with multi-vehicle roster
GP_COMMITMENT_UNSUPPORTED              nonzero GP commitment before PR models it
```

Phase: indicative reasons (resultStatus `indicative`):

```text
FLOAT64_WATERFALL_PATH       waterfall money math not yet Decimal-certified
LP_NET_NAV_FLAT_SHARE_APPROXIMATION
                             (REVIEW-ADDED, ratified 2026-07-30) lpNetNav
                             and every
                             ratio/IRR derived from it use the flat
                             gpShare haircut, not waterfall-attributed
                             unrealized value (D9 caveat)
```

Phase: run failure / transport (separate surface):

```text
HTTP 500                     engine/infrastructure failure; lineage failed;
                             no result snapshot
HTTP 409                     idempotency key reuse with changed preimage
```

## Fixture obligations (collected)

- Existing-ledger characterization (GO item 1 = WP-CHAR): ROC ordering, residual
  carry, partial ROC, multiple exits, no-hurdle behavior, conservation, PLUS the
  L-DEF-1 pins (REVIEW-ADDED): contribution-after-profitable-exit,
  contribution-after-final-exit (dropped paid-in), and same-quarter
  contribution+exit ordering. REVIEW-ADDED naming: these live in a SEPARATE
  legacy-labeled file (`waterfall-american-ledger.legacy-characterization.json`,
  IDs `LEGACY-01...`, header stating they encode legacy behavior and are NOT
  product truth); existing L01-L14 stay untouched so the legacy pins can never
  become a de facto product oracle.
- Readiness-only corrected product oracles replay exact `LEGACY-04` and
  `LEGACY-05` inputs with repaired unreturned-capital accounting. The
  hierarchical exact-Decimal LRM oracle and versioned event-order permutation
  contract are also executable. None is a production economics engine.
- Assembly fixtures (WP-L2 implementation): fee-base transition,
  buffer-triggered early call, envelope-violation rejection; REVIEW-ADDED:
  event-order permutation fixtures against the frozen priority table and
  single-count fee-identity cases (each fee dollar exactly once across both
  channels — D6/Brief 2).
- Terminal fixtures: the frozen 76-test terminal-policy proof covers policy-time
  persistence, readback mismatch and unsupported-version rejection, runtime-only
  validation, mid-quarter and exact-quarter-end resolution, leap-day clamping,
  quarter-grid validation, timezone invariance, exact-one forecast
  representation, frozen cutover/horizon/shape precedence, persisted hash
  fields, the exhaustive exported post-term matrix under both modes,
  negative/exact-zero handling, and cumulative deployment validation. WP-L2
  still owes valuation-basis, event-ordering, trust-inheritance, terminal
  realization, and conservation integration fixtures.
- REVIEW-ADDED purity/boundary obligations: the issue-named
  `tests/unit/source/internal-economics-boundary.test.ts`; engine purity (no
  I/O, no ambient clock or randomness); determinism (same input ->
  byte-identical result); input immutability; canonical decimal serialization;
  deep-walk no-raw-number sweep; and multi-event independence — the test proving
  the engine did not silently degrade into a whole-fund carry computation.
- Escrow/recycling: assert the NEW engine path always invokes the ledger with
  recycling and clawback structurally OFF (invocation-level assertion). REVIEW
  CORRECTION: the legacy truth case `L04-recycling-enabled` exercises recycling
  TODAY and stays untouched; "zeroed behavior" is #1176's mandate for the new V1
  path, not a description of current pinned behavior.
- REVIEW-ADDED persistence/API acceptance (WP-L3/L4): concurrent identical and
  changed-preimage idempotency races, failed-run key consumption replay, atomic
  no-result persistence on failure, wrong-fund and wrong-snapshot-type FK
  rejection, no orphan snapshots, role-matrix negatives. Readiness oracles do
  not discharge these L3/L4 obligations.
- The issue's "GP catch-up on/off" fixtures belong to the whole_fund truth-case
  slice (parked on G1) and are replaced in THIS slice by seed-refusal plus
  dormancy-normalization tests (see Deviation register).
- Ratios-null-before-paid-in; nested resultStatus union shape tests.
- REVIEW-ADDED rounding fixtures (contract ratified 2026-07-30, escalation E7):
  dual conservation (full precision AND post-rounding cents), exact-tie LP
  precedence, larger exact-remainder precedence, sub-1e-7 remainder ordering,
  negative rejection, and negative-zero normalization.
- REVIEW-ADDED Decimal-parity track: a float64-vs-Decimal error-bound benchmark
  backing D1's cents-scale estimate.

## Ratified implementation sequence

```text
COMPLETE:           characterization PR | accepted spec + ADR-065 | five briefs
                    B1 opening-state source bridge | B2 zero-fee bridge
RE-SIGN PENDING:    terminal-policy repair exact-SHA specialist review
AFTER GO:           WP-L2 compiler + state machine
                    WP-L3 service + owned persistence/migrations
                    WP-L4 restricted routes
                    V1 integration (indicative-capped, single-vehicle funds)
PARALLEL TRACK:     Decimal no-hurdle corrected-accounting core (E1)
                    -> compound hurdle policy schema V1.1
                       (separately gated despite ratified semantics)
LATER:              vehicle-scoped basis (unlocks SPV-bearing funds)
                    whole_fund = V2 publish (Task 16.2 primitive; G1 question)
```

## Completed readiness briefs

### Brief 1: Authoritative opening cash AND opening waterfall state in facts (extended 2026-07-30)

Status: Completed; ratified contract recorded in the companion readiness brief.

Original readiness question: where does the fund's authoritative cash balance
come from, and how does it enter the facts snapshot as an observation with as-of
provenance? Candidates: anchored derivation from the cash-flow event series
(requires an anchor observation), or a directly observed balance. Constraints:
facts remain observations-only (D2); warnings taxonomy for staleness. Exit:
facts contract vNext plus builder emit an opening-cash observation consumable by
the economics run; `OPENING_CASH_UNAVAILABLE` becomes reachable only on
genuinely missing data.

REVIEW EXTENSION — opening waterfall state and cutover: opening cash alone
cannot initialize a forward waterfall run. The brief must also resolve the
authoritative OPENING CAPITAL-ACCOUNT STATE: cumulative LP and GP paid-in;
unreturned contributed capital; historical LP distributions split ROC vs profit;
GP carry and investment distributions previously paid; recallable/recycled state
(even if only proven zero); and prior realized proceeds vs actual LP
distributions. Exit contract: EITHER deterministic replay from fund inception
over complete, perspective-preserving, canonically ordered source events, OR a
pinned opening-waterfall-state observation with replay/audit provenance. The
brief must also define the actual/projected CUTOVER: `cutoverInstant`; inclusion
rules (actual: `effectiveAt <= cutoverInstant` or strictly `<`, chosen
explicitly; projected: strictly after); source assignment (actual rows from
scoped facts ONLY — forecast actual rows are never consumed, they blend
`lp_distribution` and `realized_proceeds`, `CohortProjectionV2.ts:248-256`;
projected rows from forecast projected series only); same-instant ordering
(event-class priority, source timestamp, stable source id); and duplicate-event
prevention across facts and forecast. Opening state and cutover methodology
participate in the input and result hashes.

### Brief 2: Exact fee/expense vector bridge

Status: Completed; ratified zero-fee bridge recorded in the companion readiness
brief.

Original readiness question: define `effectiveFeeExpenseHash` — the canonical
quarterly fee/expense dollar vector plus compiler version, application mode,
capital base, and horizon — and the reconciliation proof that economics-side
accrual does not double-count the forecast's embedded flat drag. Alternatives:
forecast emits gross/pre-fee NAV; or an exact fee-drag reconciliation bridge;
identity-match (policy fee model hash-identical to the plan's flat drag) is
necessary but NOT sufficient (REVIEW CORRECTION: hash equality proves shared
input, not single-count application). Constraints: the fee-drag compiler
intentionally ignores basis and collapses tiers — its output alone can never
anchor the hash. REVIEW EXTENSION: the brief must audit BOTH fee channels — the
NAV-embedded flat drag AND the upstream deployable-capital reduction
(`derive-current-plan-v1.ts:140-145`) — and produce a formal per-quarter
reconciliation identity connecting committed capital, deployable capital,
deployment, fee expense, NAV, distributions, and ending cash; fixtures prove
each fee dollar is represented exactly once, not merely that conservation
balances. This brief also OWNS the quarterly fee/expense accrual primitive's
definition (previously unassigned): basis measurement timing (beginning-,
average-, or end-of-quarter), partial-period convention, and tier-transition
timing. Exit: proof or typed rejection path exercised by fixtures.

### Brief 3: Immutable capital-envelope entity

Status: Completed; ratified contract recorded in the companion readiness brief.

Original readiness question: schema and seeding for the versioned LEGAL
envelope: main-fund vehicle reference, LP/GP/total commitment components,
currency, provenance, hash; LP plus GP reconcile exactly to total. Constraints:
policy references it by version (D3); observed state (opening cash,
called-to-date) stays in facts/run basis. Persistence and any migration belong
in the reviewed owning WP-L3 PR. Exit: schema plus reconciliation rule plus seed
flow specified.

### Brief 4: Vehicle-scoped facts and forecast

Status: Completed; ratified V1 restriction and vNext design recorded in the
companion readiness brief.

Original readiness question: introduce `vehicleScope: 'main_fund'` variants of
facts snapshot and forecast (periodNav gains a vehicle dimension or a scoped
series), with the perspective-preservation policy from D7. Constraints: existing
`fund_all` consumers untouched; scoped-facts policy must preserve required
perspectives explicitly. REVIEW EXTENSION — realization granularity: the
persisted forecast contract emits only quarterly aggregate `distributionsUsd`
(no per-event exits at the basis boundary; modeled exits exist only inside the
projection's cohort structure). The brief must decide whether forecast vNext
exposes per-cohort/per-deal exit events (enabling honest `forecast_exit` event
rows with real `sourceRefs`) or V1 event rows are explicitly labeled SYNTHETIC
decompositions of quarterly aggregates. Exit: SPV-bearing funds can produce a
main-fund basis; `MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE` retires for them; the
realization-granularity decision is recorded.

### Brief 5: Compound-hurdle semantics (waterfall-specialist)

Status: Completed for semantics; policy schema V1.1 remains separately gated.

Original readiness question: freeze `annualized_compound` semantics BEFORE
schema V1.1: accrual base (unreturned contributed capital; does accrued pref
compound), accrual start/end dates, day-count or quarterly convention,
partial-capital-return treatment, ordering among ROC, pref, residual LP share,
carry, terminal accrual date and liquidation interaction. Constraints:
Decimal-native core behind the legacy-ledger compatibility wrapper; existing
truth cases L01-L14 unchanged (REVIEW NOTE: the new legacy-characterization pins
live in a separate `LEGACY-*` file and never become the product oracle);
compound-hurdle work targets the CORRECTED capital-account semantics chosen in
D10's semantic disposition, never the L-DEF-1 derivation; specialist sign-off on
semantics precedes schema addition (Phoenix protected-path rules). Exit:
signed-off semantics document; schema V1.1 plus engine/methodology version bump
plan.

## Deviation register (review-added 2026-07-30)

Six ratified departures from issue #1176's Task 16.3 text, in one place. All six
were user-ratified 2026-07-30. The authoritative #1176 register correction
supersedes the initial five-ratified/one-pending posting and closes entry 4:
https://github.com/nikhillinit/Updog_restore/issues/1176#issuecomment-5134955218

1. Exit gate "genuine Decimal-derived boundaries" -> amended to decimal-string
   boundaries plus `indicative` cap until the Decimal-native core certifies
   (D1/ADR-065). Ratified.
2. Fixture list "GP catch-up on/off" -> those fixtures belong to the whole_fund
   truth-case slice (parked on G1); this slice replaces them with seed-refusal
   plus dormancy-normalization tests. Ratified.
3. G1 default LPA terms ("no hurdle, 100 percent GP catch-up") conflict with
   V1's structurally catch-up-free policy. `prefCatchUp=true` seed-refuses even
   when hurdle basis is `none`; only dormant numeric fields with
   `prefCatchUp=false` normalize with persisted warning. Ratified deviation.
4. RESOLVED: seed-time `422 CREDIT_FACILITY_UNSUPPORTED` is reserved and
   structurally unreachable because accepted source contracts expose neither a
   facility field nor a facility cash-flow event. Strict source schemas reject
   both. Once an authoritative facility field lands, policy seeding refuses it
   before normalization.
5. "Payload-only" persistence -> dedicated `internal_economics_policy_versions`
   and `internal_lp_economics_runs` lineage tables added (D3/ADR-065). Ratified.
6. Result union: #1176 finding W3 wants a discriminated union carrying BOTH
   templates; V1 ships the single-member `deal_by_deal` union with whole_fund as
   a V2 publish (D9). Ratified.

## Verified citations

Every claim above marked VERIFIED was read from the live repository at
`6dda7c19` during scoping:

- `shared/lib/waterfall/american-ledger.ts` (271 lines): no catch-up;
  flat-at-event hurdle (L152-155); JS number math; event-level.
- `shared/contracts/current-forecast-v2.contract.ts`: basis-bundle input shape;
  `status` enum including `indicative`; input/assumptions/result hashes.
- `server/services/current-forecast-v2-service.ts`: optional basis IDs resolve
  to latest (anti-pattern for economics).
- `server/services/economics-calculation-service.ts`: GP-economics assumptions
  persist in `fund_snapshots.type = 'ECONOMICS'` payloads; config
  latest-resolution.
- `shared/schema/current-plans.ts`: `currentPlanVersions` precedent
  (sourceConfig columns, supersedes lineage, idempotency columns).
- `shared/schema/fund.ts:148`: `NON_TIMELINE_SNAPSHOT_TYPES` fail-open denylist;
  readers in `fund-state-read-service.ts`, `time-travel-analytics.ts`.
- `docs/adr/ADR-014-snapshot-governance.md` vs `DECISIONS.md` "ADR-014: Test
  Baseline & PR Merge Criteria": duplicate numbering.
- `shared/lib/economics/economics-engine.ts`: `calculateManagementFeeForYear`
  private/annual/dynamic-basis (L387); `defaultWaterfall` dormant defaults
  (~L262); `lpNetNav = grossNav x (1 - gpShare)` (~L837).
- `shared/lib/economics/fee-drag-compiler.ts`: "Basis is intentionally ignored"
  flattening comment.
- `shared/core/cohorts/CohortProjectionV2.ts`: flat fee drag (~L511);
  Decimal-native with sanctioned number boundaries; terminal NAV as final XIRR
  flow (~L658).
- `shared/contracts/financial-facts-snapshot-v1.contract.ts`: event-series cash
  flows, nullable `vehicleId`, `perspective` enum; no cash balance;
  `vehicleScope: z.literal('fund_all')` (~L368); `periodNav` without vehicle
  dimension (~L143-151).
- `shared/schema/financial-facts-snapshots.ts:39`: `$type<'fund_all'>`.
- `shared/schema/vehicles.ts`: vehicle types, nullable total-only
  `committedCapital`, at-most-one `main_fund` partial unique index, unconsumed
  `spvEconomics`.
- `server/lib/fund-scoped-ownership.ts`: kind list lacks policy/envelope/run;
  `fund_snapshot` kind is type-blind.
- `server/routes/mount-common-routes.ts`: manifest-derived registration.
- `server/services/current-forecast-shadow-service.ts`: `held` rejected as
  engine status.
- `shared/core/calc-substrate/calc-result.ts`: trust vocabulary; `indicative` =
  present but not decision-grade.
- `server/lib/idempotent-command.ts`: authoritative fundId + contractVersion in
  canonical preimage.
- `shared/contracts/lp-reporting/lp-metric-run.contract.ts`: ADR-010 XIRR
  diagnostic taxonomy.
- `server/services/lp-reporting/metrics-engine.ts` (~L307): ratios null on zero
  contributions.
- `shared/contracts/economics-v1.contract.ts` (~L201):
  `EconomicsAnnualRowV1Schema` LP/GP flow separation.

## Process notes

- Review adjudication 2026-07-30: four independent review artifacts (a
  fact-check of the scoping Q&A, a deep spec review with a live ledger
  execution, a three-model critical review, and a plan-repair proposal) were
  adjudicated against live code in this session; amendments carry REVIEW-ADDED /
  REVIEW CAVEAT / REVIEW EXTENSION annotations, and the full disposition table
  lives in the session completion report.
- CI Unified on `6dda7c19`: completed SUCCESS (verified via `gh run list`
  2026-07-30) — closes the review's open question about the in-progress run at
  handoff time.
- Knowledge-graph queries refused authority during scoping (workspace hash stale
  from untracked `HANDOFF.*` files); live repository evidence was used instead.
  Correct behavior; do not bypass the staleness check. REVIEW NUANCE: a rebuilt
  graph manifest now exists at head (snapshot `b9572d27...`,
  `coding_authority: "strict"` at build instant, observed 2026-07-30T04:44Z),
  yet the live query STILL refuses on a workspace hash mismatch in this dirty
  worktree. Semantic conclusions continue to rest on direct source reads; the
  graph serves orientation only.
- `HANDOFF.md` / `HANDOFF.json` at repo root predate this scoping and are stale
  (their nextTask is this completed scoping). Deliberately NOT regenerated:
  completed scope makes a refresh misleading.
- Commit-time reminder (repo rule): a new `docs/**/*.md` file requires `git add`
  FIRST, then `npm run docs:routing:generate`, with the regenerated
  `docs/_generated/` outputs in the same commit.
