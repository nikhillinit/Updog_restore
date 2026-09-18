# Handoff: Semantic Convergence Plan for Updog_restore

**Created:** 2026-09-17 **Working directory:**
`/Users/nikhil/code/Updog_restore` **Branch:** `main` at `feddc9eac` **Next
session focus:** Draft an execution plan for the semantic convergence path
(items 1-10 below)

## Context

A multi-model strategy review (GPT-5.6 Sol, Claude Opus 5, Kimi K3) was
conducted against a proposed development roadmap. The review document is at:

```
~/Downloads/Critically review the proposed strategy roadmap a....md
```

The central thesis — that Updog_restore's binding constraint has shifted from
missing infrastructure to inconsistent meaning across calculation paths — was
validated by all three models and confirmed against current HEAD.

## Ground Truth (verified against `feddc9eac`)

All P0 defects are **confirmed still live** in the codebase:

| ID   | Defect                                                                        | Location                                                                                    | Status                                                                               |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P0-A | `Math.random()` projections reported as valid financial data                  | `shared/core/cohorts/CohortEngine.ts:26` (`generateMockCompanies`)                          | LIVE                                                                                 |
| P0-B | Unknown stage silently receives 2.0x multiplier                               | `server/services/reserve-input-builder.ts:152` (seed legacy default)                        | LIVE (partial: `stage-utils.ts` has fail-closed, but reserve-input-builder bypasses) |
| P0-B | 0x MOIC coerced to 1x                                                         | `shared/core/reserves/DeterministicReserveEngine.ts:526` (`company.currentMOIC \|\| 1`)     | LIVE                                                                                 |
| P0-C | Null valuation coerced to $0                                                  | `server/services/position-value.ts:10` and `server/services/fund-metrics-calculator.ts:118` | LIVE                                                                                 |
| P0-D | Scenario calc version not in reuse predicate                                  | `server/services/fund-scenario-calculation-service.ts:52`                                   | LIVE                                                                                 |
| P0-E | CF V2 receipt excludes methodology version from match                         | `server/services/current-forecast-v2-service.ts:344`                                        | LIVE                                                                                 |
| AI   | AbortController not passed to OpenAI SDK; custom retries stack on SDK retries | `server/services/ai-orchestrator.ts:202-228`                                                | LIVE                                                                                 |

## Recommended Execution Sequence

| #   | What                                                              | Est.  | Key files                                                                                                       |
| --- | ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Kill random projections — replace with `unavailable` + reason     | 1hr   | `CohortEngine.ts`, consumers of cohort projection API                                                           |
| 2   | Fix `\|\| 1` MOIC coercion + reserve-input-builder stage defaults | 2hr   | `DeterministicReserveEngine.ts:526`, `reserve-input-builder.ts`, `adapter.ts:377`                               |
| 3   | AI abort/retry one-liners                                         | 30min | `ai-orchestrator.ts`                                                                                            |
| 4   | Type position value as available/unavailable union                | 4hr   | `position-value.ts`, `performance-calculator.ts`, `portfolio-overview-service.ts`, `fund-metrics-calculator.ts` |
| 5   | Add calc methodology version to receipt reuse predicate           | 3hr   | `fund-scenario-calculation-service.ts`, `current-forecast-v2-service.ts`                                        |
| 6   | Prod release of items 1-5                                         | 2hr   | Existing release pipeline                                                                                       |
| 7   | P1 semantic primitives (stage enum, MOIC type, coverage object)   | 1wk   | New shared layer, all calculator consumers                                                                      |
| 8   | Construction Forecast completion                                  | 2wk   | Existing construction infrastructure                                                                            |
| 9   | Current vs Construction workspace                                 | 1wk   | New decision surface UI                                                                                         |
| 10  | Reserve Decision Center                                           | 2wk   | Highest-value net-new product capability                                                                        |

## Right-sizing decisions (5-user internal tool)

Things the strategy review recommends that were **deferred as over-engineered**:

- **Basis ladder** (5+ valuation states): Start with binary
  available/unavailable. Add states when GP asks.
- **dependency-cruiser import boundaries**: Code review sufficient at this
  scale.
- **Methodology-drift CI gate**: `phoenix:truth` + version discipline is enough.
- **Canonical serialization spec**: Normalize effective-as-of and drop raw clock
  covers 90%.
- **Shadow price / knapsack reserve allocation**: Marginal-return sort is fine
  until GP hits infeasible recommendation.
- **Data-profile pre-step**: Owner knows the 13-company portfolio. No blind
  database discovery needed.
- **Seven MOIC variants**: One deployed + one planned covers 95% of GP
  questions.

## Key constraints

- **Non-negotiable rules:** See `CLAUDE.md` — idempotent mutations, optimistic
  locking, cursor validation, job timeouts, no emoji, phoenix:truth must pass,
  conventional commits, TZ=UTC for tests.
- **Prod:** `068430726` (2026-07-30). Main merges are preview-only until release
  dispatch.
- **User merges PRs manually (squash)** — never merge/push main yourself.
- **Design system:** `DESIGN.md` is source of truth. Primary accent is charcoal
  `#292929`, never blue.

## Suggested skills

- `/ponytail:ponytail full` — enforce KISS/YAGNI throughout
- `/caveman:caveman full` — terse output
- `superpowers:writing-plans` — for structuring the execution plan
- `superpowers:brainstorming` — if scoping decisions need exploration
- `phoenix-truth-case-orchestrator` — when adding truth fixtures for P0 fixes
- `financial-calc-correctness` — when touching calculation paths
- `phoenix-precision-guard` — when modifying Decimal/numeric code
