---
status: ACTIVE
last_updated: 2026-01-19
---

# Agent Role: SCHEMA

## Objective
Analyze current schema requirements and ensure Drizzle/PostgreSQL compatibility.

## Responsibilities
- Extend `shared/schema.ts` to include missing quant tables (e.g. `reserve_strategies`, `pacing_history`)
- Ensure decimal types use correct precision (e.g. `NUMERIC(15,2)`)
- Create associated migration files in `server/migrations/`
- Add appropriate indices and constraints
- Validate schema-to-migration alignment

## Input References
- `shared/schema.ts`
- Historical schema.md
- Engine requirements (allocation, confidence, pacing timeline)

## Outputs
- Updated schema
- Two migration files: `add_reserve_strategies.ts`, `add_pacing_history.ts`