# Code Review: WS2 — Reachable Transaction Audit → Repair

**Review Date**: 2026-08-07  
**Version**: 1.5.0  
**Files Reviewed**:

- `.clinerules/caveman.md`
- `.cursor/rules/caveman.mdc`
- `.github/path-filters.yml`
- `.github/workflows/ci-unified.yml`
- `.opencode/AGENTS.md`
- `.windsurf/rules/caveman.md`
- `AGENTS.md`
- `DESIGN.md`
- `docs/1-plans/F_1.2.4_ws2-transaction-audit-repair.plan.md`
- `docs/audits/F_1.2.4-transaction-reachability-audit.md`
- `package.json`
- `scripts/guardrails/transaction-support-usage.mjs`
- `server/db.ts`
- `server/lib/transaction-support.ts`
- `server/services/current-forecast-reference-service.ts`
- `server/services/fund-calculation-mode-service.ts`
- `server/services/fund-moic-input-service.ts`
- `server/services/lp-reporting/metric-run-evidence-service.ts`
- `server/services/lp-reporting/metric-run-lifecycle-service.ts`
- `server/services/lp-reporting/narrative-run-service.ts`
- `server/services/lp-reporting/planning-fmv-override-service.ts`
- `server/services/lp-reporting/report-package-service.ts`
- `tests/integration/current-forecast-reference.pg.test.ts`
- `tests/integration/neon-http/neon-lane.test.ts`
- `tests/integration/neon-http/neon-lane.ts`
- `tests/unit/lib/transaction-support.test.ts`
- `tests/unit/services/current-forecast-reference-service.test.ts`
- `tests/unit/services/fund-calculation-mode-service.current-forecast.test.ts`
- `tests/unit/services/fund-calculation-mode-service.golden.test.ts`
- `tests/unit/services/fund-calculation-mode-service.test.ts`
- `tests/unit/services/fund-moic-input-service.test.ts`
- `tests/unit/services/h9-invalidation-service-wiring.test.ts`
- `tests/unit/services/lp-reporting/metric-run-evidence-service.test.ts`
- `tests/unit/services/lp-reporting/metric-run-lifecycle-service.test.ts`
- `tests/unit/services/lp-reporting/narrative-run-service.test.ts`
- `vitest.config.neon.ts`

**Plan**: `docs/1-plans/F_1.2.4_ws2-transaction-audit-repair.plan.md`

---

## Executive Summary

Change repairs reachable transaction semantics through WebSocket-backed Neon
transactions, claim-last atomic statements, LP lifecycle rewrites, transaction
guardrails, and real-Neon concurrency tests. Both prior Major findings and one
precision-specialist finding are addressed; pointer advancement’s class-(b)
escalation is documented, tested, and plan-authorized.

**APPROVED**

---

## Changes Overview

Vercel database initialization now uses a WebSocket-capable pool with non-fatal
error handling, while affected service mutations use either atomic claim-last
statements or callback transactions according to their concurrency requirements.
LP reporting lifecycle operations now enforce deterministic lock order, and
activation responses normalize timestamps consistently across fresh and replay
paths.

Pointer advancement was intentionally restored to a callback transaction after
real-Neon testing demonstrated that a single-statement CTE could reject a valid
concurrent loser under PostgreSQL snapshot visibility. Plan and audit records
document this amendment, while WebSocket integration tests prove both concurrent
requests succeed.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Unhandled Neon Pool errors — addressed.** Previous finding: “New Vercel Neon
  Pool lacks an error listener.” Both Neon pool branches now attach non-fatal
  `error` handlers through `logger.error`: [server/db.ts:79](../../server/db.ts)
  and [server/db.ts:115](../../server/db.ts).

- **Potential narrative/report-package lock-order inversion — addressed.**
  Previous finding: “Metric and narrative `FOR UPDATE` CTEs are independent,
  permitting lock inversion against report-package assembly.” Narrative approval
  now forces the metric row dependency before acquiring the narrative lock:
  [narrative-run-service.ts:164](../../server/services/lp-reporting/narrative-run-service.ts),
  [narrative-run-service.ts:177](../../server/services/lp-reporting/narrative-run-service.ts),
  and
  [narrative-run-service.ts:182](../../server/services/lp-reporting/narrative-run-service.ts).

- **Activation timestamp representation drift — addressed.** PostgreSQL JSONB
  timestamp rendering could differ from the canonical `Date.toISOString()`
  response. `activationResponseFromLedger` now validates and normalizes
  `activatedAt`, with both replay and fresh-result paths routed through it:
  [current-forecast-reference-service.ts:589](../../server/services/current-forecast-reference-service.ts),
  [current-forecast-reference-service.ts:597](../../server/services/current-forecast-reference-service.ts),
  [current-forecast-reference-service.ts:633](../../server/services/current-forecast-reference-service.ts),
  and
  [current-forecast-reference-service.ts:870](../../server/services/current-forecast-reference-service.ts).

### Minor Issues

None.

### Suggestions

- **Pointer advancement class-(b) escalation — accepted, no action required.**
  Real-Neon concurrency testing established that claim-last CTE snapshot
  predicates could produce an erroneous `409` after lock waiting. The plan’s
  pre-authorized escalation clause covers the callback-transaction
  implementation:
  [plan.md:227](../../docs/1-plans/F_1.2.4_ws2-transaction-audit-repair.plan.md),
  [plan.md:462](../../docs/1-plans/F_1.2.4_ws2-transaction-audit-repair.plan.md),
  and
  [audit.md:79](../../docs/audits/F_1.2.4-transaction-reachability-audit.md).
  Implementation remains transactional at
  [current-forecast-reference-service.ts:335](../../server/services/current-forecast-reference-service.ts)
  and
  [current-forecast-reference-service.ts:352](../../server/services/current-forecast-reference-service.ts).
  Neon tests pin the HTTP-driver limitation, WebSocket success, and concurrent
  both-succeed contract at
  [neon-lane.test.ts:399](../../tests/integration/neon-http/neon-lane.test.ts),
  [neon-lane.test.ts:417](../../tests/integration/neon-http/neon-lane.test.ts),
  and
  [neon-lane.test.ts:734](../../tests/integration/neon-http/neon-lane.test.ts).

---

## Checklist

- [x] 1. Functional Requirements — Plan behavior implemented, including ratified
      claim-last and pointer-transaction amendments.
- [x] 2. Architecture and Design — ADR-073 driver scope and transaction
      classifications preserved.
- [x] 3. API and Backend — Atomicity, idempotency, optimistic guards, replay
      behavior, and response formatting verified.
- [x] 4. Data and Persistence — PostgreSQL snapshot and lock-order behavior
      handled explicitly.
- [x] 5. Phoenix and Financial Correctness — Precision specialist passed; MOIC
      precision preserved, no floating-point money math added, and no fee
      calculations changed.
- [x] 6. Frontend — Not applicable; no frontend runtime behavior changed.
- [x] 7. Error Handling and Observability — Both Neon pools handle asynchronous
      errors without crashing the process.
- [x] 8. Security and Safety — No security regressions, unsafe transaction
      fallbacks, or silent corruption paths found.
- [x] 9. Performance — Mutations retain bounded database round trips;
      transaction and lock scope remain appropriate for production inputs.

---

## Verdict

**APPROVED**

All recorded findings are resolved or explicitly accepted through the plan’s
amendment mechanism. Validation reports are clean: ESLint plus ten guardrails,
three type-check projects, 2,096 unit-service tests, Neon lane 25/25 across
three runs, five concurrency contracts, PostgreSQL driver lifecycle proof,
Phoenix truth 336, and calculation gate 79. No open review findings remain.
