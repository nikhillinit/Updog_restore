---
status: ACTIVE
last_updated: 2026-01-19
---

# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Updog Fund
Management Platform.

## Index

| ADR                                               | Title                                              | Status   |
| ------------------------------------------------- | -------------------------------------------------- | -------- |
| [0001](0001-evaluator-metrics.md)                 | Evaluator Metrics for AI Agents                    | Accepted |
| [0002](0002-token-budgeting.md)                   | Token Budgeting Strategy                           | Accepted |
| [0003](0003-streaming-architecture.md)            | Streaming Architecture for Long-Running Operations | Accepted |
| [004](ADR-004-waterfall-names.md)                 | Waterfall Distribution Names                       | Accepted |
| [005](ADR-005-xirr-excel-parity.md)               | XIRR Excel Parity                                  | Accepted |
| [006](ADR-006-fee-calculation-standards.md)       | Fee Calculation Standards                          | Accepted |
| [007](ADR-007-exit-recycling-policy.md)           | Exit Recycling Policy                              | Accepted |
| [008](ADR-008-capital-allocation-policy.md)       | Capital Allocation Policy                          | Accepted |
| [009](ADR-009-RESERVED.md)                        | Reserved                                           | Reserved |
| [010](ADR-010-monte-carlo-validation-strategy.md) | Monte Carlo Validation Strategy                    | Accepted |
| [011](ADR-011-stage-normalization-v2.md)          | Stage Normalization v2                             | Accepted |
| [012](ADR-012-mem0-integration.md)                | Mem0 Integration                                   | Accepted |
| [013](ADR-013-scenario-comparison-activation.md)  | Scenario Comparison Activation                     | Accepted |
| [014](ADR-014-RESERVED.md)                        | Reserved                                           | Reserved |
| [015](ADR-015-XIRR-BOUNDED-RATES.md)              | XIRR Bounded Rate Strategy                         | Accepted |

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
