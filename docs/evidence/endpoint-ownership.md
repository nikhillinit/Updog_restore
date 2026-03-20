# Endpoint Ownership: /api/funds

Generated: 2026-03-20 ADR: docs/decisions/adr-runtime-authority.md

## Current State (Observed)

| Endpoint             | Method | Handler | File:Line                  | Mount                       | Surface        | Precedence                                           |
| -------------------- | ------ | ------- | -------------------------- | --------------------------- | -------------- | ---------------------------------------------------- |
| /api/funds           | GET    | inline  | server/routes.ts:138       | direct                      | registerRoutes | load-bearing (no GET in funds router)                |
| /api/funds/:id       | GET    | inline  | server/routes.ts:151       | direct                      | registerRoutes | load-bearing (no GET in funds router)                |
| /api/funds           | POST   | router  | server/routes/funds.ts:63  | /api + /funds               | registerRoutes | wins (mount at routes.ts:48 precedes inline at :189) |
| /api/funds           | POST   | inline  | server/routes.ts:189       | direct                      | registerRoutes | shadowed by router mount                             |
| /api/funds/calculate | POST   | router  | server/routes/funds.ts:114 | /api + /api/funds/calculate | registerRoutes | BUG: resolves to /api/api/funds/calculate            |
| /api/funds           | GET    | stub    | api/funds.ts:26            | Vercel function             | Vercel only    | gated by ENABLE_API_STUB=true                        |

## Target State (Phase 0B)

| Endpoint             | Method | Canonical Owner               | File                      | Surface        |
| -------------------- | ------ | ----------------------------- | ------------------------- | -------------- |
| /api/funds           | GET    | server/routes.ts inline       | routes.ts:138             | registerRoutes |
| /api/funds/:id       | GET    | server/routes.ts inline       | routes.ts:151             | registerRoutes |
| /api/funds           | POST   | server/routes/funds.ts router | funds.ts:63               | registerRoutes |
| /api/funds/calculate | POST   | server/routes/funds.ts router | funds.ts:114 (fix prefix) | registerRoutes |

## Phase 0B Actions

1. Remove or quarantine inline POST /api/funds at routes.ts:189 (confirmed
   shadowed)
2. Fix routes/funds.ts:114 prefix: /api/funds/calculate -> /funds/calculate
3. Vercel api/funds.ts stub: leave as-is (gated, no conflict)

## Request/Response Contract Summary

### POST /api/funds (canonical: routes/funds.ts:63)

Request:

- name: string (required, min 1)
- size: number (required, positive)
- managementFee: number (0-0.1, default 0.02)
- carryPercentage: number (0-0.5, default 0.2)
- vintageYear: number (int, 2000-2100, default current year)
- engineResults: EngineResults | null (optional)
- basics: { name, size, modelVersion? } (optional legacy format)
- strategy: { stages: [...] } (optional)

Response 201:

- { success: true, data: { id, name, size, managementFee, carryPercentage,
  vintageYear, status, engineResults, createdAt }, message }

Response 400: { error: ZodError.format() }

### POST /api/funds (shadowed: routes.ts:189)

Request:

- name: string (required, min 1)
- size: number (required, positive)
- deployedCapital: number (optional, non-negative)
- managementFee: number (0-1)
- carryPercentage: number (0-1)
- vintageYear: number (int, 2000-2030)

Response 201: raw Fund object (no wrapper) Response 400: { error, message,
details: { validationErrors } }

NOTE: Different validation ranges (managementFee 0-1 vs 0-0.1), different
response shapes. This handler is shadowed and should be removed in Phase 0B.

### GET /api/funds (inline: routes.ts:138)

Response 200: Fund[] Response 500: { error, message }

### GET /api/funds/:id (inline: routes.ts:151)

Response 200: Fund Response 400: { error, message } (invalid ID) Response 404: {
error, message } (not found) Response 500: { error, message }
