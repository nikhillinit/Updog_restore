# Session: 2026-03-19 ESLint Wave 1A (Partial)

## Summary

Continued ESLint remediation Wave 1A (server schema roots, middleware, parsers).
Fixed 145 warnings across 11 files, reducing repo total from 2470w to 2325w. All
4 contract producer files (shared/security/http.ts,
server/db/schema/reserves.ts, shared/lib/reserves-v11.ts,
server/lib/http-preconditions.ts) are now 0-warning. Middleware sub-batch
partially complete: 7 middleware files edited, 7 remaining with systemic Express
type resolution issues.

## Work Completed

- Sub-batch 1 (Contract Producers): 5 files remediated to 0 warnings (104w
  eliminated)
  - shared/security/http.ts: replaced `require('node-fetch')` with native fetch,
    typed CORS middleware
  - server/db/schema/reserves.ts: removed `table: any` (Drizzle v0.45 infers
    types)
  - server/db/schema/market.ts: same Drizzle fix
  - shared/lib/reserves-v11.ts: removed `: any` from reduce/sort callbacks
  - server/lib/http-preconditions.ts: introduced HttpError interface, fixed
    require-atomic-updates
- Sub-batch 2 (Middleware): 6 files edited, ~41 additional warnings fixed
  - with-rls-transaction.ts: typed pgClient as PoolClient, tx as typeof db,
    replaced console with logger
  - rateLimits.ts: replaced console.log with logger
  - auditLog.ts: replaced console.log with dynamic logger import
  - dedupe.ts: typed JSON.parse, fixed unused var, replaced console.log with
    logger
  - idempotency.ts: fixed stableStringify typing, unused var, console.log to
    logger, typed JSON.parse
  - engine-guards.ts: replaced `any` with `unknown`/`ArrayBufferView`

## Findings / Decisions

- Systemic Express type resolution issue: `req.user`, `req.requestId`,
  `req.body` warnings across 7+ middleware files caused by competing
  augmentations (types/express.d.ts vs server/types/express.d.ts) AND `.d.ts`
  exclusion in tsconfig.eslint.server.json. This is a deeper fix (likely
  tsconfig change or augmentation consolidation) that should be a separate
  sub-task.
- Used `eslint-disable-next-line require-atomic-updates` (4 lines total) for
  Express middleware false positives where `req` is unique per request.
- `res.send`/`res.json` override signatures must use `any` to match Express API
  -- unavoidable.

## Repo State

- Warnings: 2325 (down from 2470, delta -145)
- Errors: 0 (unchanged)
- Typecheck: clean
- Git: 11 modified files, UNCOMMITTED

## Context for Next Session

- Wave 1A has 57 files, 362 warnings. ~145 fixed, ~217 remain.
- 11 files edited, ~46 files untouched in Wave 1A.
- Remaining middleware files (asyncErrorHandler, audit, requireLPAccess,
  engineGuardExpress, performance-monitor, rateLimitDetailed, requestId,
  shutdownGuard) have 25 warnings total, mostly systemic Express type resolution
  issues.
- After middleware: still need server/lib helpers (redis/cluster 22w,
  errorHandling 18w, auth/jwt 12w, etc.), server/core helpers (mlClient 20w,
  market/score 10w), and shared helpers (type-guards 11w, jcurve-fit 10w, jcurve
  7w, etc.).

## Open Questions

- Express type augmentation conflict: should we consolidate the two augmentation
  files and remove `.d.ts` from tsconfig.eslint.server.json exclude? This would
  fix ~15-20 systemic warnings across middleware.

---

_Session duration: ~45 min_
