# ADR: Runtime Authority for Contract-Integrity Work

## Status

Accepted (2026-03-20)

## Context

The repository has multiple server entry points:

1. `server/main.ts` -> `bootstrap()` -> `server.ts` -> `registerRoutes()` (30+
   route modules)
2. `server/index.ts` -> `makeApp()` -> `server/app.ts` (~10 route modules)
3. `api/[[...slug]].ts` -> `makeApp()` (Vercel catch-all)
4. `api/funds.ts` (Vercel stub, gated by ENABLE_API_STUB)

These paths mount different route sets and have different middleware stacks.
Contract-integrity work (endpoint ownership, DTO contracts, persistence mapping)
must target one authoritative surface to avoid ambiguity.

## Decision

The authoritative runtime for contract-integrity work is:

**`server/main.ts` -> `bootstrap()` -> `server.ts` -> `registerRoutes()`**

This is the path used by:

- Local development: `npm run dev:api` (`package.json:47`)
- Docker production: `Dockerfile:63` runs `node dist/index.js`
- Railway production: `Dockerfile.railway:45` runs `node dist/index.js`
- Build chain: `scripts/build-server.mjs` compiles `server/bootstrap.ts`

### Non-authoritative surfaces

| Surface                             | Status           | Action                                          |
| ----------------------------------- | ---------------- | ----------------------------------------------- |
| `server/index.ts` + `server/app.ts` | Vercel adapter   | Out of scope for this release                   |
| `api/[[...slug]].ts`                | Vercel catch-all | Out of scope (uses makeApp, not registerRoutes) |
| `api/funds.ts`                      | Demo stub        | Leave as-is (gated by ENABLE_API_STUB=true)     |

Non-authoritative surfaces must either proxy to the canonical path or be
explicitly declared out of scope. They must not define competing endpoint
contracts.

## Consequences

- All contract-integrity phases (0A through 4) target `registerRoutes()` only
- Vercel adapter parity is deferred to follow-on hardening
- The `api/funds.ts` stub returns 404 unless explicitly enabled and does not
  conflict with the authoritative path
- Future work adding Vercel parity must go through `registerRoutes()` or an
  explicit adapter, not by duplicating route logic in `app.ts`

## Deployment Audit

| Target    | Entry point            | Build                | Start                | Routes           |
| --------- | ---------------------- | -------------------- | -------------------- | ---------------- |
| Local dev | `server/main.ts` (tsx) | N/A                  | `npm run dev:api`    | registerRoutes() |
| Docker    | `dist/index.js`        | `npm run build`      | `node dist/index.js` | registerRoutes() |
| Railway   | `dist/index.js`        | `npm run build:prod` | `node dist/index.js` | registerRoutes() |
| Vercel    | `api/*.ts`             | `npm run build:web`  | Vercel runtime       | makeApp()        |
