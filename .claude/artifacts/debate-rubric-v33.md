---
status: REFERENCE
audience: agents
last_updated: 2026-06-23
owner: 'Platform / GP Modeling'
review_cadence: P365D
---

# Debate Rubric: v3.3 Trust-First Milestones Plan Review

## Context

You are reviewing the implementation plan at:
`docs/superpowers/plans/2026-06-23-trust-first-milestones-v3.3.md`

This plan describes a multi-milestone development program for a VC fund modeling
platform. The repo is `nikhillinit/Updog_restore` (TypeScript, Express, React,
PostgreSQL, Drizzle ORM).

Key prior art already merged:

- PR #910: `FinancialProvenance` contract + fail-closed prototype routes +
  guardrails
- Investment rounds schema + service (create/list/read/supersede with
  idempotency)
- Access-boundary hardening (Tranche A slices 0-5, fund-scope guards)
- Route governance registry (client) + portfolio-intelligence route
  classification

## Your Task

Produce a structured critique of the plan. Read the plan file, then read the
referenced source files to ground your analysis in actual code.

## Scoring Dimensions (rate each 1-10)

1. **Correctness** -- Do the plan's assertions about current code match reality?
   Are SQL schemas, join paths, FK references, service APIs accurate?

2. **Sequencing** -- Is the milestone dependency graph sound? Could any
   milestone be parallelized? Are there hidden dependencies the plan misses?

3. **Overengineering** -- Is the scope proportional to the stated goal (one
   trustworthy MOIC vertical)? What could be deferred without risk? Are there
   contracts or tables that won't have consumers in the first 3 milestones?

4. **Underspecification** -- What edge cases are missing? What error paths are
   undefined? Are there ambiguous states in the mapping/override logic?

5. **Security** -- Does the plan close known access-boundary gaps? Are there new
   attack surfaces introduced (especially around supersede, override, export)?

6. **Implementability** -- Can a solo developer + AI agents ship this? Are the
   PR boundaries right-sized? Are there integration risks between PRs?

7. **Reuse** -- Does the plan leverage existing code (PR #910 contracts,
   existing guards, route fixtures) or does it reinvent?

8. **Rollback safety** -- Are the rollback paths credible? What happens if
   shadow mode reveals divergence at scale?

## Required Sections in Your Output

```
## Scores
[dimension]: [score]/10 -- [one-line rationale]

## Top 3 Strengths
[numbered list]

## Top 5 Risks / Gaps
[numbered list with severity: BLOCKING / HIGH / MEDIUM]

## Overengineering Candidates
[things that could be deferred or simplified]

## Missing Edge Cases
[specific scenarios the plan doesn't address]

## Sequencing Improvements
[reordering or parallelization suggestions]

## Concrete Recommendations
[specific, actionable changes to the plan text]
```

## Grounding Rules

- Cite file paths and line numbers for every claim about current code.
- If you cannot verify an assertion, say so explicitly.
- Do not invent code that doesn't exist in the repo.
- Prefer "defer X" over "add X" -- the plan is already large.
