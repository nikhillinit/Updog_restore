# Task 16.3 WP-L2 (2b) Cash-Assembly State Machine and Nonzero Fee Program — Implementation Plan

Status: DRAFT — awaiting user approval. Planning does not authorize
implementation. Produced 2026-07-30 by the WP-L2 salvage review session (Phase B
of the review/planning lane).

Governing documents (this plan implements, never overrides):

- Spec:
  `docs/superpowers/specs/2026-07-30-task163-deal-by-deal-scoping-design.md` (D6
  call/cash policy, D9 result schema and cash invariant, D10 layering).
- Briefs: `docs/superpowers/specs/2026-07-30-task163-go-readiness-briefs.md`
  (Brief 2 fee-vector bridge and three-channel identity; terminal matrix).
- `DECISIONS.md` ADR-065 "Internal LP Economics deal_by_deal V1" [ACCEPTED]
  (cite by full path plus title; two records are numbered ADR-014).

Settled decisions this plan does NOT re-litigate: the state machine is
from-scratch (ratified); `CohortProjectionV2.ts`, `fee-drag-compiler.ts`, and
latest-resolving services are named anti-patterns, never drafts;
`shared/core/capitalAllocation/periodLoopEngine.ts` and `invariants.ts` are
structural pattern references only; nonzero fees are NOT V1; compound hurdle
stays behind waterfall-specialist sign-off; the Decimal corrected-accounting
core is a separate parallel track and is never combined with new behavior.

---

## Part 0 — Preconditions from the Phase A salvage review (WP-0)

The state machine composes the D1–D7 salvage modules, so review findings that
change those modules' shapes must be dispositioned BEFORE WP-2b coding starts.

- **WP-0.1 (blocking) — DONE 2026-07-30.** D1 committed to the salvage branch as
  `fdd70cad` (promoted module + oracle re-export shim, byte-identical to the
  frozen oracle modulo the Task163 prefix).
- **WP-0.2 (major) — DONE 2026-07-30.** D7 ratios now route through
  `toFixedDecimalString` at the canonical 12-dp `RatioDecimalStringSchema`
  scale, with schema conformance pinned in the test (`7d6f31c9`).
- **WP-0.3 (major) — DONE 2026-07-30.** D3 hardened (`3eca3f3d`): `hurdleRate`
  removed from `LedgerAllocationConfigV1` (never forwarded even if present at
  runtime) and invocation-level assertions added — the wrapper throws
  `LedgerAllocationInvariantError` if recycled cash or clawback fields leak into
  the ledger result. Branch pushed; remote head `3eca3f3d`.
- **WP-0.4 (minor) — DONE 2026-07-30.** Fixtures declare their waterfall config
  (`carryPct`, `hurdleBasis: 'none'`) and the fixture test reproduces the profit
  split from it; the D5 wildcard allowlist covers array descendants; the D3
  docstring was fixed in `3eca3f3d` (`867ba17f`).

All WP-0 items are complete on `feat/task163-wp-l2-salvage` (head `867ba17f`, PR
#1254). Approval gate A0 now reduces to: user merges PR #1254. Nothing below
starts before A0.

---

## Part 1 — WP-2b: Cash-Assembly State Machine Core

### Design stance

Pure function of `(basis, policy, engineVersion, methodologyVersion)` per
ADR-065 purity contract. No I/O, no ambient clock (pinned `clock` is basis), no
randomness — enforced by the existing D4 source guard, which the new modules
land inside (`shared/lib/internal-economics/`). Full-precision Decimal state
internally; canonical decimal strings only at the output boundary (money 6 dp
via `MoneyDecimalStringSchema`, ratios 12 dp via `RatioDecimalStringSchema`,
both through `toFixedDecimalString`). Integer-cent presentation happens only
through the D1 module. The L1 ledger is reachable only through the D3 interface
(D4 guard already pins this).

Frozen components composed, never re-implemented:

| Concern               | Frozen component                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fee/expense schedule  | D2 `compileQuarterlyScheduleV1` (bridge-backed; zero vector in V1)                                                                                                        |
| Waterfall allocation  | D3 `computeLedgerAllocationV1` over `shared/lib/waterfall/american-ledger.ts`                                                                                             |
| Event ordering        | `deriveFactsEventOrderKey` / `deriveForecastEventOrderKey` / `compareEventOrderKeys` (`event-ordering-v1.contract.ts`, version `internal-economics-event-ordering/1.0.0`) |
| Terminal mechanics    | `resolveTerminalPeriodEndV1`, `resolvePostTermDispositionV1`, `POST_TERM_ACTIVITY_MATRIX_V1` (`terminal-policy-v1.contract.ts`, 76/76)                                    |
| Ratios                | D7 `calculateGuardedRatios` (after WP-0.2)                                                                                                                                |
| Presentation rounding | D1 `presentation-rounding-v1.ts` (after WP-0.1)                                                                                                                           |
| Raw-number sweep      | D5 `findRawNumbers`/`assertNoRawNumbers` (test-side)                                                                                                                      |

### Work packages (ordered; each is TDD: failing tests first)

**WP-2b-1 — Engine-internal types and period grid.** New
`shared/lib/internal-economics/cash-assembly-types-v1.ts` (or equivalent):
Decimal-native engine state (`openingCashUsd`, cumulative calls/deployments/
fees/expenses/proceeds/distributions, unfunded envelope remaining), the
quarterly-row builder targeting the exact D9 field list, and the engine version
constant (`internal-economics-cash-assembly/1.0.0`). Period grid derives from
the pinned forecast series plus `resolveTerminalPeriodEndV1`; grid defects
reject with the spec's typed codes (`FORECAST_HORIZON_SHORT`,
`FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE`, `FUND_LIFE_GRID_UNREPRESENTABLE` at
seed). Depends on: A0.

**WP-2b-2 — Event-stream assembly.** New module that merges facts cash-flow
events and synthetic forecast events (`forecast_quarterly_distribution`,
priority 4, period-end 23:59:59.999Z instant) into one stream sorted by
`compareEventOrderKeys`, then buckets by quarter. Post-term classification via
`resolvePostTermDispositionV1` / `POST_TERM_ACTIVITY_MATRIX_V1`; prohibited
activity yields `POST_TERM_ACTIVITY`. Negative source money yields
`NEGATIVE_SOURCE_MONEY`; cumulative deployment decrease yields
`FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE`. Order-invariance is a required
obligation, to be proven with the D6 permutation builders: every input
permutation must produce a byte-identical assembled stream. No
permutation-generator exists yet in the codebase; WP-2b-6's fixture list must
add it (`tests/helpers/multi-event-independence-fixtures.ts` is currently a
static 3-case array with no shuffle logic). Depends on: WP-2b-1.

**WP-2b-3 — Call sizing and buffer roll-down (the hard core, spec D6).**
Dedicated, separately-tested function — not inlined in the period loop:

- PROPOSED (not spec-sourced — this is the thing A1 reviews, not settled fact):
  coverage target for quarter Q = deployments + fees + expenses scheduled in
  quarters `Q .. min(Q + cashBufferQuarters, terminalQuarter)` (fees/expenses
  come only from the D2 schedule — zero in V1, but the shape is basis for the
  fee program). D6's buffer paragraph gives qualitative behavior only (rolls to
  zero, timing-only, no residual); it does not specify a windowed-sum formula or
  a `min(...)` cap — those are implementer proposals for A1 to accept, amend, or
  reject.
- Early calls reduce later calls one-for-one; the target rolls down to zero
  approaching the terminal horizon; after terminal processing no residual buffer
  cash remains. Buffer effect is timing-only, never total — pinned by an
  invariant test comparing total called at `cashBufferQuarters = 0` vs `N`.
- Envelope is reject-never-clamp against the LEGAL capital envelope (never
  forecast `committedCapitalUsd`): first violating quarter, requested call,
  remaining capacity, cumulative calls in `COMMITTED_CAPITAL_EXCEEDED` context.
- Opening cash comes only from pinned facts (Brief 1); missing yields
  `OPENING_CASH_UNAVAILABLE`, never assumed zero.
- DECISION (D6 permits either; this plan picks one — flagged for A1, not stated
  as spec fact): deployment funding calls land at `periodStart` rather than
  prior quarter-end; fee/expense true-up at `periodEnd` (both zero-value in V1,
  but the two-slot structure is built now so the fee program does not reshape
  the machine).

Depends on: WP-2b-1, WP-2b-2. This package carries its own design note in the PR
describing the roll-down recurrence — including the coverage-target formula and
the call-timing choice above as open proposals, not settled decisions; user
review of that note is approval gate A1 before the period loop lands.

**WP-2b-4 — Period loop and waterfall integration.** The state machine proper
(structural reference: `executePeriodLoop`). Per quarter, apply the D6 cash
recurrence in its exact order (this sentence is verbatim D6, not D9 — corrected
citation): opening cash, calls, deployments, fees, expenses, proceeds,
distributions, ending cash. NAV is a stock outside the recurrence. Distribution
events route through `computeLedgerAllocationV1` (recycling/clawback
structurally off; hurdle none); event rows carry the D9 decomposition (gross =
LP capital return + LP profit + GP investment distribution + GP carry) and never
populate `lpUnreturnedCapital*` (E1: legacy ledger must not emit them). Terminal
modes: `liquidate_at_horizon` emits the required terminal event when
pre-terminal NAV is positive and zeroes final NAV; `hold_unrealized` forbids the
terminal event and contributes exactly one synthetic terminal-NAV flow to XIRR.
Ratios per quarter via D7 (null before positive LP paid-in). `resultStatus` caps
at `indicative` with `FLOAT64_WATERFALL_PATH` (plus
`LP_NET_NAV_FLAT_SHARE_APPROXIMATION` on lpNetNav-derived fields). Depends on:
WP-2b-3, A1.

**WP-2b-5 — Invariants module (structural reference: `invariants.ts`).**
Fail-closed checks, violation = failed run, no result: full-precision cash
recurrence conservation per quarter AND post-rounding integer-cent conservation
(via the D1 run processor); event conservation; quarterly/event reconciliation
(events are decomposition only); cumulative LP paid-in and distributed
monotonicity (IMPLEMENTER-ADDED — neither D6 nor D9 states this invariant;
carried here as an engineering safeguard subject to A2 review, not a spec
mandate — if it ever rejects a legitimate scenario, revisit rather than treat as
ground truth); buffer timing-only equality; envelope never exceeded in emitted
rows. The D5 sweep runs over every emitted result in tests (allowlist only for
genuinely numeric fields such as counts). Depends on: WP-2b-4.

**WP-2b-6 — Fixture and verification program.** Fixture obligations mapped to
spec sections:

| Fixture                                                                                                  | Spec anchor                       |
| -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Permutation invariance over mixed facts/forecast events                                                  | D6 ordering table                 |
| Multi-event independence (D6 data + explicit carry config from WP-0.4)                                   | D6 / D10 corrected-semantics pins |
| Buffer roll-down: early-call offset, terminal roll-to-zero, no residual                                  | D6 buffer paragraph               |
| Fee-transition placeholder (zero vector; asserts two-slot call/true-up shape)                            | D6 call assembly                  |
| Terminal both modes incl. positive/zero pre-terminal NAV                                                 | D9 terminal/XIRR rules            |
| Ratio-null quarters before first positive LP paid-in                                                     | D9 ratios                         |
| Envelope breach first-violating-quarter context                                                          | D6 envelope                       |
| Rounding conservation on adversarial cent splits                                                         | D9 ratified rounding contract     |
| `OPENING_CASH_UNAVAILABLE` refusal                                                                       | WP-2b-3 opening-cash prose        |
| `FORECAST_HORIZON_SHORT` / `FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE` / `FUND_LIFE_GRID_UNREPRESENTABLE` | WP-2b-1 period-grid prose         |
| `POST_TERM_ACTIVITY` / `NEGATIVE_SOURCE_MONEY` / `FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE`               | WP-2b-2 event-stream prose        |

Verification gates per package and at branch end: scoped
`npx vitest run <paths> --project=server` with `TZ=UTC`, `npm run check`,
`npm run lint`, `npm run phoenix:truth` (no existing calc surface should move;
any drift is a stop), and full `npm test` before push. LEGACY-* pins and the
corrected-counterpart truth cases must remain byte-identical.

Approval gate A2: user reviews the completed WP-2b branch (or stacked PRs)
before merge. WP-L3 (service/persistence/idempotency) and WP-L4 (routes) are out
of scope here and get their own plans.

---

## Part 2 — Nonzero Fee/Expense Program (Brief 2; explicitly post-V1)

V1 doctrine stands: zero-fee/zero-expense only; anything nonzero, absent, or
ambiguous stays `FORECAST_FEE_BASIS_INCOMPATIBLE`. This program is sequenced
AFTER WP-2b (and realistically after WP-L3) and is gated behind a policy schema
bump plus an engine/methodology version change. No waterfall-semantics design
happens here.

**WP-F1 — Upstream basis decision (blocking dependency).** Nonzero support stays
closed until the forecast exposes gross/pre-fee NAV or an exact quarterly
basis-aware fee vector (Brief 2 closing condition). Decide and spec which: (a)
forecast contract change adding gross NAV series, or (b) forecast consumes the
same canonical fee vector so NAV drag is exact. User decision; touches the
forecast contract, so it is its own reviewed PR.

**WP-F2 — Decimal-native quarterly accrual primitive.** New primitive (never
divide `calculateManagementFeeForYear` by four — it is module-private, annual,
and evaluates dynamic bases once per year;
`shared/lib/economics/economics-engine.ts:387`). Inputs: fee tiers/expense
schedule, capital base series, application mode. Explicit basis-measurement
timing decision (beginning-, average-, or end-of-quarter) recorded in
DECISIONS.md — user decision point. Fee-transition (tier step-down) fixture
mandatory per D6.

**WP-F3 — Bridge V2: exact dollar vector and hash.** Extend the bridge lane so
`effectiveFeeExpenseHash` covers the canonical quarterly fee/expense DOLLAR
VECTOR plus compiler version, application mode, capital base, and horizon (spec
D6/B2: config-version or flat-rate equality is an insufficient bridge). D2's
compiler shape already carries the six channel fields per quarter, so the state
machine consumes vector changes without reshaping. Lineage gates distinguish
`CONFIG_LINEAGE_MISMATCH` from `FORECAST_FEE_BASIS_INCOMPATIBLE`.

**WP-F4 — Three-channel identity harness.** Executable proof that every fee
dollar appears exactly once across: (1) upstream deployable-capital reduction
(`shared/lib/current-plan/derive-current-plan-v1.ts:140-145` — corrected path;
D6 ~L410 cites the wrong `shared/lib/economics/...` path and should be fixed
too); (2) forecast NAV-embedded drag (`CohortProjectionV2.ts` ~L511); (3)
economics cash debits. This harness settles the unproven double-burden assertion
recorded in D6. It is pure test/proof tooling and can start early, but its PASS
is a merge gate for WP-F5.

**WP-F5 — Activation.** Policy schema bump (V1.x) admitting nonzero fee/expense
bodies; engine and methodology version changes;
`FORECAST_FEE_BASIS_INCOMPATIBLE` remains the refusal for every input the
certified vector path does not cover. Rollout posture (which funds, still
`indicative`) is a user decision at that time.

Explicitly excluded from this program: compound hurdle (separate V1.1 gate,
waterfall-specialist sign-off), the Decimal corrected-accounting core (parallel
track; numeric migration is never combined with new behavior), and any change to
frozen contracts under `shared/contracts/internal-economics/`.

---

## Dependency graph and approval points

```text
A0 (user: salvage disposition + WP-0 fixes)
  -> WP-2b-1 -> WP-2b-2 -> WP-2b-3 -> A1 (user: buffer/call design note)
       -> WP-2b-4 -> WP-2b-5 -> WP-2b-6 -> A2 (user: WP-2b merge review)
A2 -> WP-L3 / WP-L4 (separate plans)
WP-F1 (user decision) -> WP-F2 (basis-timing decision) -> WP-F3 -> WP-F4 -> WP-F5
```

WP-F4's harness scaffolding may start any time after WP-F1, but its channel 3
("economics cash debits") evaluates outputs of WP-F2 (accrual primitive) and
WP-F3 (dollar-vector bridge), so a PASS requires both to exist first — the edge
above reflects the PASS dependency, not just when scaffolding can begin.

## Residual risks and unknowns

- Buffer roll-down interacting with envelope rejection (a buffered early call
  can hit the envelope a smaller just-in-time call would not) — surfaced as
  fixture obligations in WP-2b-6; semantics per D6 (reject, never clamp).
- Opening-cash cutover details (Brief 1 extended) must be re-read when WP-2b-1
  starts; this plan pins only the refusal behavior.
- WP-F1's forecast contract change has consumers outside this lane; a green
  economics gate does not prove forecast consumers — run their real suites.
- L-DEF-1 remains pinned legacy until the Decimal track certifies; nothing in
  WP-2b may compensate for it in assembly code.
