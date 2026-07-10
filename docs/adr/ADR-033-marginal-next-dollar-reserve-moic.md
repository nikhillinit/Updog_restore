# ADR-033: Marginal Next-Dollar Reserve MOIC Model

## Status

Proposed

## Context

The current planned-reserves MOIC path ranks existing planned reserves using reserve exit multiple and exit probability inputs. That is not a full marginal next-dollar opportunity-cost model because it does not derive incremental ownership, future dilution, subsequent rounds, staged probabilities, or delta expected proceeds.

## Decision

Keep #1021 scoped to facts/provenance integration. Model true marginal reserve return in a separate lane that calculates:

```text
delta probability-weighted expected proceeds / delta reserve capital deployed
```

The model must include prospective check size, round price, incremental ownership, future dilution, follow-on participation, staged exit/failure assumptions, and explicit expected-value weighting.

## Consequences

- Planned-reserves MOIC can be labeled assumption-based until this ADR is implemented.
- #1021 cannot claim marginal next-dollar opportunity cost.
- A missing exit probability or reserve exit multiple cannot silently become trusted input.
- Investment-team calibration is required before production activation.
