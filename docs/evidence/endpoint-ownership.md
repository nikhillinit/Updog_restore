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

## Phase 0B Achieved (2026-03-20)

### Changes Applied

1. **Idempotency import fix**: `server/routes/funds.ts` changed from named
   import (`{ idempotency }` -- the factory) to default import (`idempotency` --
   the pre-called middleware). POST /api/funds now receives real idempotency
   middleware instead of the factory function.

2. **Calculate path correction**: `server/routes/funds.ts` changed route
   declaration from `/api/funds/calculate` to `/funds/calculate`. Since the
   router is mounted at `/api`, this corrects the resolved path from
   `/api/api/funds/calculate` (bug) to `/api/funds/calculate` (intended).

3. **Inline POST removal**: The shadowed inline `POST /api/funds` handler at
   `server/routes.ts` (previously at line 189) was deleted. The router-owned
   handler in `server/routes/funds.ts` is now the sole POST owner.

4. **Inline GET handlers preserved**: `GET /api/funds` and `GET /api/funds/:id`
   remain as inline handlers in `server/routes.ts` -- they are load-bearing
   because the funds router does not provide equivalent reads.

### Post-Cutover State

| Endpoint             | Method | Canonical Owner               | File             | Surface        |
| -------------------- | ------ | ----------------------------- | ---------------- | -------------- |
| /api/funds           | GET    | server/routes.ts inline       | routes.ts        | registerRoutes |
| /api/funds/:id       | GET    | server/routes.ts inline       | routes.ts        | registerRoutes |
| /api/funds           | POST   | server/routes/funds.ts router | funds.ts         | registerRoutes |
| /api/funds/calculate | POST   | server/routes/funds.ts router | funds.ts (fixed) | registerRoutes |

### Release-Surface Verification

- `registerRoutes()` surface: changed (inline POST removed, calculate prefix
  fixed, idempotency import fixed)
- Non-authoritative surfaces: unchanged (no modifications to `server/app.ts`,
  `api/[[...slug]].ts`, or `api/funds.ts`)
