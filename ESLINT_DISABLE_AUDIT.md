# ESLint Disable Audit

**Generated:** 2026-01-11
**Baseline:** 3987 problems (762 errors, 3225 warnings)
**Total disables:** 122 in server/

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Type definition files (.d.ts) | 40 | Boilerplate, necessary |
| File-level disables (source files) | 40 | Review for necessity |
| Inline next-line (justified) | 22 | Keep as-is |
| Inline next-line (unjustified) | 20 | **ADD JUSTIFICATIONS** |

## Type Definition Files (40 disables - LOW PRIORITY)

Standard boilerplate in `.d.ts` files. These suppress framework interop issues:

```
server/types/ws.d.ts (5 disables)
server/types/vite.d.ts (5 disables)
server/types/vite-plugins.d.ts (5 disables)
server/types/supertest.d.ts (5 disables)
server/types/request-response.d.ts (5 disables)
server/types/rate-limit-redis.d.ts (5 disables)
server/types/ioredis.d.ts (5 disables)
server/types/compression.d.ts (5 disables)
server/types/errors.ts (1 disable)
server/types/vite-plugins.d.ts (already counted)
```

**Action:** KEEP - These are framework interop, type system limitations.

## File-Level Disables in Source Files (40 disables)

### `@typescript-eslint/no-explicit-any` (most common)

Files disabling `any` checks:
```
server/http.ts
server/core/enhanced-fund-model.ts
server/metrics.ts
server/env.ts
server/health.ts
server/errors.ts
server/metrics/businessMetrics.ts
server/lib/hash.ts
server/lib/idempotency.ts
server/seed-demo-data.ts
server/cache/index.ts
server/lib/errorHandling.ts
server/seed-db.ts
server/bootstrap.ts
server/lib/inflight-server.ts
server/db/logger.ts
server/websocket.ts
server/lib/tracing.ts
server/providers.ts
server/vite.ts
server/seed-pipeline.ts
server/server.ts
server/middleware/asyncErrorHandler.ts
server/middleware/async.ts
server/middleware/rateLimitDetailed.ts
server/middleware/shutdownGuard.ts
server/middleware/requestId.ts
server/routes/fund-config.ts
server/routes/funds.ts
server/routes/interleaved-thinking.ts
```

**Rationale:** Infrastructure/middleware code often deals with generic types from frameworks. Strict typing would require extensive type gymnastics.

**Action:** KEEP - Add justification comments to each file explaining framework interop or generic handling requirements.

### `no-restricted-imports` (5 disables)

Files importing deprecated/restricted modules:
```
server/routes.ts (3 disables)
server/services/projected-metrics-calculator.ts (3 disables)
server/routes/calculations.ts (1 disable)
```

**Action:** INVESTIGATE - Check if these can use allowed alternatives or if restriction can be lifted.

### Multiple unsafe-* disables (LP routes)

```
server/routes/lp-distributions.ts (2 disables: unsafe-argument, unsafe-member-access)
server/routes/lp-api.ts (2 disables: unsafe-argument, unsafe-member-access)
server/routes/lp-capital-calls.ts (2 disables: unsafe-argument, unsafe-member-access)
```

**Action:** KEEP - External LP API data lacks strict types. Document this.

### XLSX service (3 disables)

```
server/services/xlsx-generation-service.ts:
  - unsafe-assignment
  - unsafe-member-access
  - unsafe-return
```

**Action:** KEEP - ExcelJS library types are incomplete.

## Inline Next-Line Disables (42 total)

### Justified (22 disables - GOOD)

Examples with clear rationale:
```
server/workers/version-pruning-worker.ts:68
  // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration serves as timeout

server/queues/report-generation-queue.ts:131
  // eslint-disable-next-line povc-security/require-bullmq-config -- uses lockDuration (BullMQ's actual timeout)

server/queues/report-generation-queue.ts:372
  // eslint-disable-next-line require-atomic-updates -- sequential cleanup, no race

server/middleware/security.ts:132
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- type compatibility between redis versions

server/services/pdf-generation-service.ts:1085
  // eslint-disable-next-line custom/no-hardcoded-fund-metrics -- Placeholder until fund metrics service integration
```

**Action:** KEEP AS-IS - These follow best practices.

### Unjustified (20 disables - **ACTION REQUIRED**)

Files needing justification comments:
```
server/lib/approvals-guard.ts:249 - require-atomic-updates
server/lib/auth/jwt.ts:107 - no-unsafe-member-access, no-explicit-any
server/lib/auth/jwt.ts:135 - no-explicit-any
server/lib/auth/jwt.ts:191 - no-explicit-any
server/db/redis-factory.ts:393 - no-explicit-any
server/workers/scenarioGeneratorWorker.ts:276-324 - 13 disables (unsafe-assignment, unsafe-call, unsafe-member-access)
server/lib/stage-validation-mode.ts:61 - require-atomic-updates
server/lib/stage-validation-mode.ts:90 - require-atomic-updates
server/routes/interleaved-thinking.ts:136 - unsafe-assignment
server/services/ai-orchestrator.ts:243-285 - 6 disables (no-explicit-any)
```

**Action:** ADD JUSTIFICATIONS - Explain why the disable is necessary for each.

## Plan: Batch C Execution

### C1: Add Justifications (Priority 1)

Target: 20 unjustified next-line disables

For each, add a comment explaining:
- Why the violation is unavoidable (framework limitation, external types, etc.)
- What the risk is (if any)
- Any related tickets/issues for future cleanup

### C2: Document File-Level Disables (Priority 2)

Add header comments to files with blanket `no-explicit-any` disables explaining:
- Why any types are necessary (framework interop, generic handling, etc.)
- Scope of the any usage (limited to specific functions/modules)

### C3: Investigate no-restricted-imports (Priority 3)

Files:
- server/routes.ts
- server/services/projected-metrics-calculator.ts
- server/routes/calculations.ts

Check if restricted imports can be replaced with allowed alternatives.

### C4: Verify Removals (Priority 4)

Test removing a few disables to confirm they're actually suppressing violations:
1. Comment out a disable
2. Run eslint on that file
3. If no new violations → remove permanently
4. If violations appear → restore and justify

## Metrics

**Current state:**
- Total disables: 122
- Justified: ~62 (51%)
- Need justifications: ~60 (49%)

**Target state:**
- Total disables: 115-120 (minimal removals expected)
- Justified: 100%
- Unnecessary: 0

**Realistic outcome:** Given the 3987-problem baseline, most disables are necessary. Focus on documentation quality, not removal quantity.
