---
status: ACTIVE
last_updated: 2026-08-03
---

# ADR-070: Cashless GP Commitments and Fee Waivers

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
the GP capital account. Full contractual investment-return and waterfall
ownership applies to residual/profit participation; it does not give deemed
capital a return-of-capital or preferred-return allocation.

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

## Decision 4: Return of capital uses cash-contributed capital only

The return-of-capital base includes only `LPCashContribution` and
`GPCashContribution`. It excludes `GPDeemedContribution` entirely. The deemed
portion is never repaid through a return-of-capital distribution, at any tier,
under either waterfall basis.

```text
ReturnOfCapitalBase_t = LPCashContribution_t + GPCashContribution_t
```

**Confidence:** High. This follows from Decision 2's cash-conservation boundary
and is not a new policy choice.

## Decision 5: Preferred return accrues on cash-contributed capital only

`GPDeemedContribution` never accrues preferred return and is excluded from the
hurdle accrual base under both supported bases: European whole-fund and American
deal-by-deal. The cash-only principle is basis-agnostic.

Whether GP **cash** co-investment accrues preferred return pari passu with LP
capital is explicitly out of scope. Many LPAs exclude GP capital from preferred
return regardless of cashless mechanics because GP capital is compensated via
carry. That question predates cashless GP commitments. This ADR neither resolves
it nor recommends a treatment.

The current economics engine already allocates preferred return to GP cash
co-investment. Under that existing static ownership model, only the GP cash
investment share participates. Preserving that behavior does not settle the
broader LPA policy question above.

## Decision 6: Clawback capital base and obligation are cash-only

`GPDeemedContribution` does not count toward the capital base used to compute
the LP-required floor or the fund-profit basis that sizes carry and clawback.

`GPDeemedContribution` also may not satisfy a clawback obligation. Clawback is
paid in cash or drawn from escrow or other security under
`ClawbackPolicySchema.securityRequired`; it is never satisfied by writing down
the deemed balance.

This ruling is intentionally explicit because its failure direction is reversed
from Decisions 4 and 5. Including deemed capital in the clawback capital base
would shrink apparent profit and increase GP clawback exposure.

**Confidence:** High for the obligation rule. Medium for the capital-base rule,
because which capital pool sizes the clawback profit basis is a pre-existing,
orthogonal question.

## Capital taxonomy for issue #1320

These are three distinct quantities. Downstream code uses exactly one per
computation and never substitutes another.

| Quantity                                  | Feeds                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (i) Contractual GP commitment             | Sizing input only: multiplicand for the cash/deemed split, and the basis for GP ownership and profit-split percentage. Never directly a cash-flow, return-of-capital, preferred-return, or clawback input.                                                                                  |
| (ii) GP cash contribution                 | Fund cash ledger and reconciliation; GP net IRR outflows; return-of-capital base (Decision 4); preferred-return accrual base if GP cash participates at all (Decision 5, orthogonal); clawback capital base (Decision 6a); sole GP-side source of cash to satisfy a clawback (Decision 6b). |
| (iii) GP deemed (fee-funded) contribution | GP capital-account balance and GP ownership and carry-split percentage only. Never any cash-flow series, any IRR, the return-of-capital base, the preferred-return accrual base, or the clawback base or obligation.                                                                        |

If #1320 needs "GP capital" for anything not listed above, the calculation is
underspecified by this ADR and needs a new Decision, not a default to whichever
quantity happens to be in scope.

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

### Strict waterfall-schema compatibility proof

Adding `.strict()` to `GPCommitmentSchema` does not require a legacy-key shim
because the waterfall-policy schema has no persistence or database write path.
The production schema graph embeds `GPCommitmentSchema` only as `gpCommitment`
inside `WaterfallPolicySchema`. A contract test imports `GPCommitmentSchema`
directly to verify parsing behavior. `WaterfallPolicySchema` is consumed by
`ExtendedFundModelInputsSchema` and by an evaluation-only AI harness; neither is
a server or application persistence surface. `ExtendedFundModelInputs` otherwise
appears only in its schema barrel, type-only example data, and the type-only
client `schema-adapter`, which has no runtime importers. There are no
server-side references and no database write path.

On `main`, the legacy `fundedFromFees` key existed only in
`shared/schemas/waterfall-policy.ts`,
`shared/schemas/examples/standard-fund.ts`, and `docs/schemas/README.md`. This
change updates all three. No persisted payload could therefore carry the legacy
key, and no compatibility shim is required.

Defaulting differs intentionally by boundary. `FundDraftWriteV1` keeps
`fundedFromFeesPct` optional and does not materialize a default, preserving an
old draft's serialized shape and configuration hash. Parsing an embedded
`gpCommitment` through `GPCommitmentSchema` does materialize `new Decimal(0)`.
That isolated waterfall-policy schema has no persistence path, so its parse-time
default does not mutate stored drafts.

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
