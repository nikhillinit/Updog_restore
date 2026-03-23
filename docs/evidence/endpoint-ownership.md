# Endpoint Ownership: /api/funds

Generated: 2026-03-22 ADR: docs/decisions/adr-runtime-authority.md

Authoritative machine-checked manifest:

- `server/contracts/funds-endpoint-ownership.ts`

## Current State (Phase 4)

| Endpoint             | Method | Canonical owner | File                   | Surface        | Notes                                                |
| -------------------- | ------ | --------------- | ---------------------- | -------------- | ---------------------------------------------------- |
| /api/funds           | GET    | router          | server/routes/funds.ts | registerRoutes | canonical                                            |
| /api/funds/:id       | GET    | router          | server/routes/funds.ts | registerRoutes | canonical                                            |
| /api/funds           | POST   | router          | server/routes/funds.ts | registerRoutes | canonical wrapper contract                           |
| /api/funds/calculate | POST   | router          | server/routes/funds.ts | registerRoutes | canonical single-prefix path                         |
| /api/funds           | GET    | stub            | api/funds.ts           | Vercel only    | gated by `ENABLE_API_STUB=true`, intentionally defer |

## Phase History

1. **Phase 0B**
   - removed the shadowed inline `POST /api/funds` handler from
     `server/routes.ts`
   - corrected the mounted calculate route from the old double-prefix bug to
     `/api/funds/calculate`
2. **Phase 4**
   - moved `GET /api/funds` and `GET /api/funds/:id` into
     `server/routes/funds.ts`
   - left `server/routes.ts` responsible only for mounting the canonical funds
     router on the authoritative `registerRoutes()` surface

## Request / Response Contract Summary

### GET /api/funds

Canonical owner: `server/routes/funds.ts`

Response `200`: `Fund[]`

Response `500`: `{ error, message }`

### GET /api/funds/:id

Canonical owner: `server/routes/funds.ts`

Response `200`: `Fund`

Response `400`: `{ error, message }` for invalid fund IDs

Response `404`: `{ error, message }` when the fund does not exist

Response `500`: `{ error, message }`

### POST /api/funds

Canonical owner: `server/routes/funds.ts`

Request:

- canonical marker: top-level `name`
- legacy marker: top-level `basics`

Response `201`:

- `{ success: true, data: { id, name, size, managementFee, carryPercentage, vintageYear, status, engineResults, createdAt }, message }`

Response `400`:

- canonical validation: `{ error, code, issues }`
- unknown marker: `{ error, code: 'FUND_NO_MARKERS' }`
- legacy validation: `{ error: ZodError.format() }`

### POST /api/funds/calculate

Canonical owner: `server/routes/funds.ts`

Reachable path:

- `POST /api/funds/calculate`

Not canonical:

- `POST /api/api/funds/calculate`

## Release-Surface Verification

- `registerRoutes()` remains the only release-supported runtime for contract
  integrity work
- `server/app.ts`, `api/[[...slug]].ts`, and `api/funds.ts` remain intentionally
  out of scope for this release
- solo-maintainer enforcement uses the manifest above plus targeted contract
  tests instead of a broader multi-surface CI ownership system
