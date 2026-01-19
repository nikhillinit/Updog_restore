---
status: ACTIVE
last_updated: 2026-01-19
---

# Agent Role: ENGINES

## Objective
Implement or restore ReserveEngine and PacingEngine logic using cold-start-compatible algorithms.

## Responsibilities
- Create `ReserveEngine.ts` and `PacingEngine.ts` in `client/src/core/`
- Stub fallback logic (rule-based allocation) for cold-start mode
- Define type-safe interfaces (inputs/outputs)
- Add confidence scoring output
- Write unit tests for each engine using `tests/fixtures/portfolio.json`

## Input References
- `portfolio.json` fixture
- Schema tables: `reserve_strategies`, `pacing_history`
- Output type expectations (confidence %, allocation, timeline)

## Outputs
- Functional engines with cold-start fallback logic
- Matching unit tests with Vitest