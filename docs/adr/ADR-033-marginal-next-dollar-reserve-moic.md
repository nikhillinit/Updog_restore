# ADR-033: Marginal Next-Dollar Reserve MOIC Model

## Status

Accepted (2026-07-12)

## Context

The planned-reserves MOIC path ranks existing planned reserves using reserve
exit-multiple and exit-probability assumptions. It does not measure the return
on the next reserve dollar because it does not isolate incremental ownership,
future dilution and checks, staged outcomes, or the expected proceeds that are
caused by a prospective decision.

This ADR defines the version-one analytical contract. It does not activate a
production route or user interface. Activation remains gated by shadow evidence
and investment-team acceptance.

## Decision

### Paired counterfactual basis

Every calculation projects two independent paths from the same current ownership
and source assumptions:

- path W includes the prospective reserve decision and its path-specific future
  participation;
- path B is the baseline without that decision and has its own future
  participation choices.

The marginal return is:

```text
deltaExpectedProceeds = E[proceeds_W] - E[proceeds_B]
deltaExpectedCapital  = E[capital_W]  - E[capital_B]
marginalReserveMoic   = deltaExpectedProceeds / deltaExpectedCapital
```

The denominator is expected capital, not the nominal first check. It includes
every probability-weighted future check that differs between the paths.

### Probability tree

At stage `s`, `reachProbability_s` is unconditional and equals the product of
all prior conditional graduation probabilities. Exit, graduation, and failure
are conditional on reaching the stage:

```text
conditionalFailureProbability_s =
  1 - conditionalExitProbability_s - conditionalGraduationProbability_s
```

Each probability must be in `[0, 1]`, and exit plus graduation must not exceed
one. Stage reach, exit, failure, expected capital, and expected proceeds are
retained in the result so the expectation can be reconstructed.

### Priced-round ownership

For a priced round, `postMoney = preMoney + roundSize`, and each path updates
ownership independently:

```text
existingOwnershipAfter =
  existingOwnershipBefore * preMoney / postMoney
incrementalOwnershipPurchased = fundCheck / postMoney
ownershipAfter =
  existingOwnershipAfter + incrementalOwnershipPurchased
```

A path with `participate = false` has a zero check and buys no incremental
ownership, but its existing position is still diluted. Participation in one
stage does not imply participation in any later stage. A participating check
must be part of the modeled round size and cannot purchase more than the round.

### SAFEs and convertible notes

Version one does not invent conversion economics. A SAFE or convertible note is
`unavailable` unless upstream source construction supplies either an explicitly
approved conversion price or priced-equivalent ownership inputs that satisfy
this priced-round contract. Instrument terms alone are insufficient.

### Currency policy

All valuations, round sizes, and checks must use the fund base currency. Version
one accepts USD only because the absolute denominator floor is denominated in
USD and no approved FX source is part of this contract. Non-USD or
mixed-currency inputs are rejected upstream/at contract validation rather than
silently converted.

### Terminal and liquidation policy

There is no automatic terminal liquidation. Expected proceeds include only
explicit stage exits. A fund-end FMV or liquidation value may be included only
when the source construction assumptions explicitly define that rule; it must be
represented and disclosed separately before reaching this engine.

### Timing and marginal IRR

`asOfDate` is time zero. Each stage's `monthsFromPriorStage` advances both paths
by the same cumulative number of months. Expected checks are negative marginal
cash flows and expected exit proceeds are positive marginal cash flows at the
corresponding stage time. Marginal IRR uses those delta expected cash flows and
is `null` when there is no sign change, no unique bounded solution, or the MOIC
itself is unavailable. A missing IRR does not invent a rate and does not by
itself invalidate an otherwise supported marginal MOIC.

### Denominator floor and actionability

The minimum denominator is recomputed for each result:

```text
floor = max(USD 1,000, 1% * E[capital_W])
```

- `unavailable`: `deltaExpectedCapital <= 0`, or
  `0 < deltaExpectedCapital < floor`. MOIC and IRR are both `null`. The latter
  condition emits `MIN_DENOMINATOR_FLOOR`. A numeric MOIC is never returned
  below the floor.
- `indicative`: a supported numeric result whose marginal MOIC is greater than
  `100`. It emits `IMPLAUSIBLE_MAGNITUDE` and is not actionable without source
  review.
- `actionable`: the denominator meets the floor, the result is at most `100`,
  contract validation passes, and the accepted source and shadow gates below are
  satisfied by the activating consumer.

The pure engine can establish mathematical status but cannot prove production
source acceptance. Consumers must not display `actionable` unless the accepted
source/version/hash and shadow criteria are also met.

### Source, version, and hash rules

Inputs and results use literal version identifiers. Facts and assumptions carry
separate lower-case SHA-256 hashes. The engine validates and normalizes the
input, preserves both source hashes, and computes the result hash from the
canonical output payload excluding `resultHash`. Object keys are canonicalized;
stage arrays retain their unique canonical stage order because order is model
semantics. A changed fact, assumption, engine version, or ordered stage path
therefore produces a distinguishable evidence record.

### Shadow acceptance criteria

Production activation requires a shadow run over the accepted investment-team
sample with all of the following recorded against exact hashes and versions:

1. every result reconstructs from its stage contributions at six decimal places;
2. no numeric result is emitted below its denominator floor;
3. all results above `100x` are `indicative` with the required warning;
4. source reviewers resolve every unsupported SAFE/note, currency, and terminal
   value input without invented defaults;
5. the investment team approves the paired scenarios and manually verifies the
   anchor cases; and
6. no unexplained result-hash drift remains across identical reruns.

## Hand-worked example

Assume current ownership is zero. At a certain-exit priced round, pre-money is
USD 8,000,000, round size is USD 2,000,000, path W invests USD 1,000,000, and
path B invests zero. There are no later rounds.

```text
postMoney = 8,000,000 + 2,000,000 = 10,000,000
incremental ownership_W = 1,000,000 / 10,000,000 = 0.10
incremental ownership_B = 0

E[proceeds_W] = 1.00 reach * 1.00 exit * 0.10 * 50,000,000
              = 5,000,000
E[proceeds_B] = 0
deltaExpectedProceeds = 5,000,000

E[capital_W] = 1.00 * 1,000,000 = 1,000,000
E[capital_B] = 0
deltaExpectedCapital = 1,000,000

floor = max(1,000, 0.01 * 1,000,000) = 10,000
marginalReserveMoic = 5,000,000 / 1,000,000 = 5.000000
status = actionable
```

If the only difference were a USD 500 check, the absolute USD 1,000 prong would
apply. The result would be `unavailable` with `MIN_DENOMINATOR_FLOOR`, even if
the computed ratio would otherwise be finite.

## Rejected alternatives

- **Nominal first check as denominator:** rejected because later path-specific
  checks are part of the decision's expected capital cost.
- **Single-path attribution:** rejected because dilution and future
  participation can change the baseline; only paired paths isolate causation.
- **Divide every positive denominator:** rejected because near-zero differences
  generate unstable, falsely actionable magnitudes.
- **Cap results at 100x:** rejected because it hides source/model risk. Preserve
  the number, downgrade it to `indicative`, and warn.
- **Infer SAFE/note conversion:** rejected because conversion economics require
  approved terms and can materially alter ownership.
- **Assume liquidation at fund end:** rejected because it invents proceeds not
  present in the source construction assumptions.
- **Convert currencies inside the engine:** rejected because no approved FX
  source, date, or conversion policy belongs to this version.

## Consequences

- Planned-reserves MOIC remains a separate assumption-based ranking and cannot
  be relabeled as marginal next-dollar return.
- The new result is auditable through paired summaries, stage contributions,
  source hashes, and a canonical result hash.
- Some opportunities intentionally return `unavailable`; upstream source work,
  not a fallback calculation, is required to make them modelable.
- Investment-team calibration and shadow acceptance remain gates before any
  production actionability claim.
