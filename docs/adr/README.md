---
status: ACTIVE
last_updated: 2026-07-10
---

# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Updog Fund
Management Platform.

## Routing Note — home-of-record

`DECISIONS.md` (repo root) is the **home-of-record** for the platform's running,
chronological ADR ledger (ADR-009 onward). This directory, `docs/adr/`, is a
**standalone collection of expanded ADRs with its own independent numbering** —
a number here does NOT correspond to the same-numbered entry in `DECISIONS.md`
(e.g. `ADR-018` here is "Stage Normalization"; `ADR-018` in `DECISIONS.md` is
"Phase 3C Truthful Rich Results"). Always cite an entry in this directory by
**file path and title**, never by number alone.

No stub files are backfilled for `DECISIONS.md` ADR-024..032 — doing so would
falsely imply the two numberings align. The one shared number is **ADR-033**
(Marginal Next-Dollar Reserve MOIC), which continues the `DECISIONS.md` sequence
but is authored as a full file here; `DECISIONS.md` carries its ledger entry and
this file is the deep-dive.

## Index

| ADR                                                 | Title                                                        | Status      |
| --------------------------------------------------- | ------------------------------------------------------------ | ----------- |
| [0001](0001-evaluator-metrics.md)                   | Evaluator Metrics for AI Agents                              | Accepted    |
| [0002](0002-token-budgeting.md)                     | Token Budgeting Strategy                                     | Accepted    |
| [0003](0003-streaming-architecture.md)              | Streaming Architecture for Long-Running Operations           | Accepted    |
| [004](ADR-004-waterfall-names.md)                   | Waterfall Distribution Names                                 | Accepted    |
| [005](ADR-005-xirr-excel-parity.md)                 | XIRR Excel Parity                                            | Accepted    |
| [006](ADR-006-fee-calculation-standards.md)         | Fee Calculation Standards                                    | Accepted    |
| [007](ADR-007-exit-recycling-policy.md)             | Exit Recycling Policy                                        | Accepted    |
| [008](ADR-008-capital-allocation-policy.md)         | Capital Allocation Policy                                    | Accepted    |
| [009](ADR-009-RESERVED.md)                          | Reserved                                                     | Reserved    |
| [010](ADR-010-xirr-day-count-and-bounds.md)         | XIRR Day-Count and Bounds Reconciliation                     | Accepted    |
| [011](ADR-011-decimal-string-api-convention.md)     | Decimal-String API Convention for Money Fields               | Accepted    |
| [013](ADR-013-scenario-comparison-activation.md)    | Scenario Comparison Activation                               | Superseded  |
| [014](ADR-014-snapshot-governance.md)               | Snapshot Governance                                          | Accepted    |
| [015](ADR-015-XIRR-BOUNDED-RATES.md)                | XIRR Bounded Rate Strategy                                   | Accepted    |
| [017](ADR-017-monte-carlo-validation-strategy.md)   | Monte Carlo Validation Strategy                              | Accepted    |
| [018](ADR-018-stage-normalization-v2.md)            | Typed Stage Normalization & Statistical Monte Carlo Testing  | Implemented |
| [019](ADR-019-mem0-integration.md)                  | mem0 Integration for AI Agent Memory Management              | Proposed    |
| [020](ADR-020-analysis-cohort-boundary.md)          | Analysis Cohort Boundary                                     | Accepted    |
| [021](ADR-021-runtime-authority.md)                 | Runtime Authority for Contract-Integrity Work                | Accepted    |
| [022](ADR-022-fund-scenario-architecture.md)        | Fund-Results Scenario Architecture                           | Implemented |
| [023](ADR-023-investment-event-persistence.md)      | Investment Event Persistence Backbone (Rounds First Tranche) | Accepted    |
| [033](ADR-033-marginal-next-dollar-reserve-moic.md) | Marginal Next-Dollar Reserve MOIC Model                      | Proposed    |

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural
decision made along with its context and consequences. Each record describes a
set of forces and a single decision in response to those forces.

## Format

We use the following lightweight format:

```markdown
# ADR-NNNN: Title

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Context

What is the issue we're addressing?

## Decision

What we decided.

## Consequences

Positive/negative outcomes.

## Alternatives Considered

What we didn't choose and why.
```

## When to Write an ADR

Write an ADR when:

- Making a significant architectural choice
- Adopting a new pattern or framework
- Changing a fundamental design decision
- Resolving a contentious debate with a clear decision

## References

- [Michael Nygard's ADR template](https://github.com/joelparkerhenderson/architecture-decision-record)
- [ThoughtWorks Technology Radar: Lightweight ADRs](https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records)
