---
status: ACTIVE
last_updated: 2026-08-03
---

# ADR-035: Cashless GP Commitments and Fee Waivers

**Status:** Accepted **Date:** 2026-08-03 **Issue:**
[#1314](https://github.com/nikhillinit/Updog_restore/issues/1314)

## Context

The design document defines a cashless GP contribution as the percentage of the
contractual GP commitment that the GP does not contribute in cash. Its example
keeps the GP's full ownership while only part of the commitment is cash-funded
(section 2.3).

Before this decision, three incompatible treatments existed:

- the quarantined client projection subtracted the cashless amount from a
  fund-wide fee basis;
- the general economics engine treated the full GP commitment as cash; and
- internal LP economics rejected nonzero GP commitments and wrote zero for
  projected GP calls.

The waterfall policy also carried a Boolean `fundedFromFees`, which could not
represent a partial cashless contribution.

## Decision 1: Fee waivers use LP-class rates

A management-fee waiver is a reduced fee rate for the named LP classes that
receive the waiver. It is not a deduction from a shared fee basis.

The design document settles this mechanism:

- section 2.3 describes lower management fees to certain LPs in lieu of a
  cashless GP commitment;
- section 5.2 defines fee profiles; and
- section 5.3 maps fee profiles to LP classes.

The governing calculation is therefore:

```text
ManagementFee_t = sum(LPClassBasis_i,t * AssignedFeeProfileRate_i,t)
```

`fundedFromFeesPct` never reduces a fee basis. Actual fee profiles determine
actual fee cash outflows. The design document does not define a counterfactual
standard rate, waiver timing, or a required dollar equality between waived fees
and the deemed GP contribution, so the engine must not infer one.

Surfaces that must follow this decision:

- fee-profile and LP-class persistence;
- fee normalization and calculation;
- the routed setup and review UI; and
- the quarantined legacy projection in `client/src/lib/capital-calculations.ts`,
  which currently performs a basis deduction.

The versioned LP-class implementation and removal of the legacy deduction are
tracked in [#1321](https://github.com/nikhillinit/Updog_restore/issues/1321).

## Decision 2: Cashless contribution is a deemed, non-cash contribution

The contractual GP contribution is split into cash and deemed portions:

```text
GPCashContribution_t
  = ScheduledGPContribution_t * (1 - fundedFromFeesPct)

GPDeemedContribution_t
  = ScheduledGPContribution_t * fundedFromFeesPct
```

Only the cash portion enters the fund cash ledger. The deemed portion remains in
the GP capital account and preserves the GP's investment-return and waterfall
ownership based on the full contractual commitment.

Period cash reconciliation is:

```text
BeginningCash
+ LPCashCalls
+ GPCashContribution
+ GrossExitProceeds
= Investments
+ ActualManagementFees
+ Expenses
+ CashDistributions
+ EndingCash
```

The deemed contribution is neither a cash source nor a cash use. It cannot
repair a cash reconciliation difference.

IRR treatment follows the same boundary:

- gross/fund IRR includes actual LP and GP cash calls, never the deemed amount;
- GP net IRR subtracts actual GP cash calls only and includes actual fee income,
  GP investment distributions, carry, escrow releases, and clawback; and
- LP net IRR remains limited to LP cash calls, distributions, and LP NAV.

Counting the deemed contribution as a GP IRR outflow while also reducing actual
fee income would double-count the waiver economics.

Global invariant 8 is interpreted as a cash invariant:

```text
Cash Investable Capital
  = LP Commitment
  + GP Cash Commitment
  + Recycled Cash
  - Actual Fees
  - Expenses
```

Equivalently, start with total committed capital and subtract the GP deemed
contribution before applying recycled cash, fees, and expenses.

## Decision 3: Fee-basis populations are LP-attributable

All management-fee bases are LP-attributable:

- committed-capital basis uses LP commitments only;
- called-capital bases use LP cash calls only; and
- invested-capital, fair-market-value, and unrealized-cost bases use the
  LP-attributable share of those fund assets.

The design document settles LP-only population for committed capital in sections
5.2 and 5.3. It lists the other basis methods but does not settle their
population. LP-only treatment for those bases is a platform decision: GP
investor capital must not generate management fees paid back to the GP manager.

Current economics V1 uses full-fund populations. Changing those meanings in
place would change existing outputs, result hashes, and retained scenarios,
conflicting with reproducibility and #1314's exact-output compatibility
requirement. LP-only populations therefore require a versioned semantic. That
work is tracked in
[#1321](https://github.com/nikhillinit/Updog_restore/issues/1321).

## Canonical field and compatibility

`fundedFromFeesPct` is the single canonical persisted ratio, from `0` through
`1`, meaning the fraction of contractual GP commitment satisfied through
non-cash fee-funded contribution.

It replaces `GPCommitmentSchema.fundedFromFees: boolean`. The Boolean and the
percentage are not distinct concepts. A second persisted `cashlessSplit` or
cashless percentage is prohibited.

Compatibility rules:

- a missing draft value behaves as `0` without materializing a schema default;
- the client store and economics boundary normalize omission to `0`;
- `0` preserves all existing economics outputs; and
- the legacy `cashlessSplit` name is compatibility-only and is not a canonical
  server or shared contract.

Avoiding a draft-schema default is intentional: parsing an old draft must not
change its serialized shape or configuration hash.

## Internal LP economics known defect

Internal LP economics currently rejects nonzero GP commitments through
`GP_COMMITMENT_UNSUPPORTED`. Its projected branch consequently writes a GP call
of zero. This is gated unsupported behavior, not an alternate valid treatment.

Removing the gate requires separate contractual GP, GP cash, and GP deemed
amounts; GP cash-call sizing; GP investment distributions; opening-state
support; IRR changes; and version review. The defect is tracked in
[#1320](https://github.com/nikhillinit/Updog_restore/issues/1320). Until that
ticket lands, internal LP economics remains unavailable for nonzero GP
commitments and must continue to fail closed.

## What the design document settles

- the cashless input is a percentage of GP commitment;
- the percentage is not cash contributed;
- fee waivers reduce fees for selected LPs through fee profiles;
- committed-capital fees use LP commitments only; and
- the full contractual GP commitment retains GP ownership economics.

## What the design document leaves open

- whether the deemed contribution enters cash reconciliation or IRR;
- the population for non-committed fee bases;
- waiver timing and any dollar reconciliation to deemed contribution;
- migration from the `fundedFromFees` Boolean; and
- behavior across the general and internal economics engines.

This ADR resolves those open points as stated above.

## Consequences

- Cash and ownership are no longer conflated for GP commitments.
- Exact 0% compatibility remains possible without mutating old draft payloads.
- Fee-waiver and LP-only basis behavior cannot be completed by an unversioned
  patch to economics V1.
- Internal LP economics remains fail-closed until its versioned follow-up is
  implemented and specialist-reviewed.
