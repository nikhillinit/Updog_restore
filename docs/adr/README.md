---
status: ACTIVE
last_updated: 2026-04-18
---

# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Updog Fund
Management Platform.

## Routing Note

`docs/adr/` is a standalone ADR collection. `DECISIONS.md` also contains ADRs,
including separate ADR-017/018/019 entries on unrelated topics. Cite ADRs from
this directory by file path and title, not by number alone.

## Index

| ADR                                               | Title                                                       | Status      |
| ------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| [0001](0001-evaluator-metrics.md)                 | Evaluator Metrics for AI Agents                             | Accepted    |
| [0002](0002-token-budgeting.md)                   | Token Budgeting Strategy                                    | Accepted    |
| [0003](0003-streaming-architecture.md)            | Streaming Architecture for Long-Running Operations          | Accepted    |
| [004](ADR-004-waterfall-names.md)                 | Waterfall Distribution Names                                | Accepted    |
| [005](ADR-005-xirr-excel-parity.md)               | XIRR Excel Parity                                           | Accepted    |
| [006](ADR-006-fee-calculation-standards.md)       | Fee Calculation Standards                                   | Accepted    |
| [007](ADR-007-exit-recycling-policy.md)           | Exit Recycling Policy                                       | Accepted    |
| [008](ADR-008-capital-allocation-policy.md)       | Capital Allocation Policy                                   | Accepted    |
| [009](ADR-009-RESERVED.md)                        | Reserved                                                    | Reserved    |
| [013](ADR-013-scenario-comparison-activation.md)  | Scenario Comparison Activation                              | Superseded  |
| [014](ADR-014-snapshot-governance.md)             | Snapshot Governance                                         | Accepted    |
| [015](ADR-015-XIRR-BOUNDED-RATES.md)              | XIRR Bounded Rate Strategy                                  | Accepted    |
| [017](ADR-017-monte-carlo-validation-strategy.md) | Monte Carlo Validation Strategy                             | Accepted    |
| [018](ADR-018-stage-normalization-v2.md)          | Typed Stage Normalization & Statistical Monte Carlo Testing | Implemented |
| [019](ADR-019-mem0-integration.md)                | mem0 Integration for AI Agent Memory Management             | Proposed    |
| [020](ADR-020-analysis-cohort-boundary.md)        | Analysis Cohort Boundary                                    | Accepted    |
| [021](ADR-021-runtime-authority.md)               | Runtime Authority for Contract-Integrity Work               | Accepted    |
| [022](ADR-022-fund-scenario-architecture.md)      | Fund-Results Scenario Architecture                          | Implemented |

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
