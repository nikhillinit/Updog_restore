---
phase: 05-test-hygiene-resurrection
plan: 01
subsystem: middleware/performance-monitor
tags: [test-hygiene, performance-monitor, monte-carlo, regression-test, bug-fix]
requirements: [REQ-TEST-02]
wave: 1
depends_on: []
dependency_graph:
  requires:
    - server/middleware/performance-monitor.ts (existing
      MonteCarloPerformanceTracker + monitor singleton)
  provides:
    - Regression test that locks bytes-as-duration bug closed
    - Silent phoenix:truth output (no memory_* critical alerts)
  affects:
    - tests/unit/truth-cases/backtesting-scenario.test.ts (runs Monte Carlo
      unmocked; no longer triggers bogus alerts)
    - server/services/monte-carlo-engine.ts:373 (caller — no change needed,
      signature preserved)
    - server/routes/performance-metrics.ts (SSE consumer — still reads
      metadata/duration correctly)
tech_stack:
  added: []
  patterns:
    - Gauge metrics pass 0 as duration when tracked through a duration-typed
      monitor
key_files:
  created:
    - tests/unit/middleware/performance-monitor.test.ts
  modified:
    - server/middleware/performance-monitor.ts
decisions:
  - Chose Option A.i (fix at the source of the event, inside trackMemoryUsage)
    over introducing a new threshold entry for memory_* operations — keeps the
    PerformanceMonitor API single-purpose (durations only) and avoids hiding a
    gauge inside a duration threshold map
metrics:
  duration_minutes: 4
  tasks_completed: 3
  files_created: 1
  files_modified: 1
  commits: 2
  completed_date: 2026-04-08
---

# Phase 05 Plan 01: Silence memory_simulation_complete false-positive alert

## One-liner

Fix bytes-as-milliseconds bug in `MonteCarloPerformanceTracker.trackMemoryUsage`
so `npm run phoenix:truth` stops emitting bogus
`Performance Alert: memory_simulation_complete took 36110552ms (critical)` lines
on every run.

## What Shipped

- **Regression test** at `tests/unit/middleware/performance-monitor.test.ts`
  with 4 assertions that lock the fix in:
  1. `monteCarloTracker.trackMemoryUsage` does NOT emit a `performance_alert`
     event on `monitor` regardless of heap size.
  2. Heap values land in `metric.metadata` (`heapUsed`, `heapTotal`, `external`,
     `rss`), not in the `duration` field.
  3. Recorded metric `severity === 'normal'`.
  4. `metric_recorded` still fires exactly once for memory metrics (no
     observability regression).
- **Source fix** at `server/middleware/performance-monitor.ts:360-368`:
  `trackMemoryUsage` now passes `0` for the `duration` argument of
  `monitor.track(...)`. Heap values remain in metadata. Public method signature
  preserved — zero caller impact.

## Code Change

```diff
-  trackMemoryUsage(operation: string, memoryUsage: NodeJS.MemoryUsage) {
-    monitor.track(`memory_${operation}`, memoryUsage.heapUsed, 'computation', {
-      heapTotal: memoryUsage.heapTotal,
-      heapUsed: memoryUsage.heapUsed,
-      external: memoryUsage.external,
-      rss: memoryUsage.rss,
-    });
-  }
+  /**
+   * Record memory usage as a gauge metric.
+   *
+   * NOTE: `PerformanceMonitor.track` takes a `duration: number` in milliseconds.
+   * Memory usage is not a duration — it is a gauge. We pass `0` for duration so
+   * the threshold check in `track()` never marks this metric as slow/critical
+   * (which would otherwise fire bogus `performance_alert` events every simulation,
+   * polluting `npm run phoenix:truth` output). Heap values are carried in metadata
+   * where any real consumer can read them.
+   *
+   * See REQ-TEST-02 in `.planning/phases/05-test-hygiene-resurrection/`.
+   */
+  trackMemoryUsage(operation: string, memoryUsage: NodeJS.MemoryUsage) {
+    monitor.track(`memory_${operation}`, 0, 'computation', {
+      heapTotal: memoryUsage.heapTotal,
+      heapUsed: memoryUsage.heapUsed,
+      external: memoryUsage.external,
+      rss: memoryUsage.rss,
+    });
+  }
```

## Why This Works

`PerformanceMonitor.track(operation, duration, category, metadata)` looks up the
`operation` in its threshold map; if not found, it falls back to the
`api_request` thresholds where `critical = 5000ms`. The operation name
`memory_simulation_complete` is NOT in the threshold map, so it always used the
api_request fallback. Passing `memoryUsage.heapUsed` (tens of millions of bytes)
into a number field that represents milliseconds meant the check
`duration > 5000` was always true on every Monte Carlo completion — firing a
`performance_alert` with severity `critical` and triggering the
`console.warn(...took ${metric.duration}ms (${metric.severity}))` handler at the
bottom of `performance-monitor.ts`.

Passing `0` keeps the metric recorded (observability preserved) but skips the
alert branch (`0 < 200ms normal`). Heap values are still available in metadata
for any real consumer. Consumer audit per plan: zero code reads `memory_*`
metric durations — only `monitor.exportMetrics()` and the SSE stream at
`server/routes/performance-metrics.ts`, both of which accept the new shape.

## TDD Flow

| Step     | Commit     | Result                                                |
| -------- | ---------- | ----------------------------------------------------- |
| RED      | `f0dda58a` | 2 of 4 tests fail (alert fires, severity `critical`)  |
| GREEN    | `776925b9` | All 4 tests pass, heap in metadata, severity `normal` |
| REFACTOR | —          | Not needed (single-line value change + doc comment)   |

## Verification

### Phoenix truth suite (REQ-TEST-02 primary gate)

```
TZ=UTC npm run phoenix:truth > phoenix-truth.log 2>&1
```

- **Exit code:** 0
- **Live count:** 262 passed / 262 total across 6 test files (matches M8
  closeout baseline — `/gsd-new-milestone` recorded 262/262 at commit
  `46be2c37`)
- **`grep -c "memory_.*critical" phoenix-truth.log`** → **0** (was firing on
  every Monte Carlo run before the fix)
- **`grep -c "memory_simulation_complete" phoenix-truth.log`** → **0** (the
  alert line is gone entirely)
- **`grep -c "Performance Alert: memory_" phoenix-truth.log`** → **0**

### Unit test smoke (regression + monte-carlo)

```
TZ=UTC npx vitest run \
  tests/unit/middleware/performance-monitor.test.ts \
  tests/unit/engines/monte-carlo.test.ts
```

- 2 test files passed, 60/60 tests passed (4 new + 56 existing monte-carlo)

### Type check

`npm run check` — 0 TypeScript errors, baseline unchanged (0 → 0).

### validate:core gate

`npm run validate:core` — exit 0. All stages green (type baseline, wizard e2e
integration test 1/1, `lint:phase4:strict --max-warnings 0`, worker warning
ratchet 41 ≤ 55 baseline).

### Orphan test enforcement

`node scripts/check-orphan-tests.mjs` — exit 0. Test file placed under
`tests/unit/middleware/` (an allowed root where the sibling
`idempotency-dedupe.test.ts` already lives).

### Git hygiene

`git status --short` at completion shows only pre-existing orchestrator-owned
changes (`.planning/STATE.md`, `docs/PHASE-STATUS.json`) and untracked
scaffolding from other tracks (`.agents/`, `.codex/`, `.planning/config.json`,
`AGENTS.md`). No stray `phoenix-truth.log`, no files outside the plan scope.

## Success Criteria

| Criterion                                                                                                                     | Status |
| ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| `trackMemoryUsage` never emits `performance_alert` (proven by regression test)                                                | PASS   |
| `phoenix:truth` output contains zero lines matching `memory_.*critical` and zero lines matching `Performance Alert: memory_`  | PASS   |
| `phoenix:truth` still exits 0 with the same live truth-case count (262/262 across 6 files) it had before the fix              | PASS   |
| `npm run validate:core` exits 0                                                                                               | PASS   |
| `npm run check` exits 0 (no new TypeScript errors)                                                                            | PASS   |
| `node scripts/check-orphan-tests.mjs` stays green                                                                             | PASS   |
| Only two files changed (`server/middleware/performance-monitor.ts` + new `tests/unit/middleware/performance-monitor.test.ts`) | PASS   |

## Deviations from Plan

None — the plan was followed exactly. RED test committed first, source fix
committed second, verification gauntlet run third. No Rule 1-4 auto-fixes
triggered.

One cosmetic note: the pre-commit lint-staged hook re-ran Prettier on the test
file after the first commit, producing minor formatting differences (single
import line, compact call sites). Functionally identical; the four assertions
are unchanged.

## Commits

| Hash       | Type | Message                                                                |
| ---------- | ---- | ---------------------------------------------------------------------- |
| `f0dda58a` | test | test(05-01): add failing regression test for trackMemoryUsage (RED)    |
| `776925b9` | fix  | fix(05-01): pass 0 duration in trackMemoryUsage, keep heap in metadata |

## Surprises

None. The bug was exactly as diagnosed in the orchestrator context — the fix is
one numeric literal plus a doc comment, and the test captured RED on the first
run. Phoenix:truth stayed at 262/262 (no hidden dependency on the old buggy
duration values anywhere in the suite).

## Self-Check: PASSED

- `tests/unit/middleware/performance-monitor.test.ts` → FOUND
- `server/middleware/performance-monitor.ts` (with
  `monitor.track(`memory\_${operation}`, 0,`) → FOUND (line 361)
- Commit `f0dda58a` (test RED) → FOUND in git log
- Commit `776925b9` (fix GREEN) → FOUND in git log
- Phoenix:truth 262/262, zero memory alerts → VERIFIED
- validate:core exit 0 → VERIFIED
- Orphan check exit 0 → VERIFIED
