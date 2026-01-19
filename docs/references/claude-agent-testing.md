---
status: ACTIVE
last_updated: 2026-01-19
---

# Agent Role: TESTING

## Objective
Validate engine correctness and full integration across backend and frontend.

## Responsibilities
- Configure Vitest (already installed via orchestrate.js)
- Write unit tests for:
  - ReserveEngine
  - PacingEngine
- Create integration tests for:
  - `GET /api/reserves/:fundId`
  - `GET /api/pacing/summary`
- Use `portfolio.json` for fixtures
- Automate with `orchestrate.js smoke` hook

## Input References
- `tests/fixtures/portfolio.json`
- Output schemas from `/api/reserves` and `/api/pacing`

## Outputs
- All tests pass via `npx vitest`
- Smoke test prints ✅
- Fallback logic tested on missing/confidence edge cases