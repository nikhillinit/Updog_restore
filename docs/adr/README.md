# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Updog Fund Management Platform.

## Index

- [ADR-0001](0001-evaluator-metrics.md) - Evaluator Metrics for AI Agents
- [ADR-0002](0002-token-budgeting.md) - Token Budgeting Strategy
- [ADR-0003](0003-streaming-architecture.md) - Streaming Architecture for Long-Running Operations

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences. Each record describes a set of forces and a single decision in response to those forces.

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
