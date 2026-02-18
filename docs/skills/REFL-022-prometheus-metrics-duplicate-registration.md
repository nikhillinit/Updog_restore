---
type: reflection
id: REFL-022
title: Prometheus Metrics Duplicate Registration on Hot Reload
status: VERIFIED
date: 2026-02-18
version: 1
severity: high
wizard_steps: []
error_codes: [ERR_METRIC_ALREADY_REGISTERED]
components: [server, metrics, prometheus, vitest, integration-tests]
keywords:
  [
    prometheus,
    prom-client,
    duplicate-metric,
    hot-reload,
    getOrCreate,
    registry,
    integration-test,
  ]
test_file: null
superseded_by: null
---

# Reflection: Prometheus Metrics Duplicate Registration on Hot Reload

## 1. The Anti-Pattern (The Trap)

**Context:** Server modules that create Prometheus counters, gauges, or
histograms at the module top level cause "metric already registered" errors when
reimported during Vitest hot-reload cycles, integration test setup, or server
restarts in dev mode.

**How to Recognize This Trap:**

1.  **Error Signal:**
    `Error: A metric with the name X has already been registered.` thrown from
    `prom-client` during test runs or dev-mode HMR
2.  **Code Pattern:** Top-level metric construction scattered across multiple
    files:

    ```typescript
    // ANTI-PATTERN - breaks on reimport
    import promClient from 'prom-client';

    // These execute every time the module is imported
    export const httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });

    export const requestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Request duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    });
    ```

3.  **Mental Model:** Assuming Node module caching prevents double execution. In
    reality, Vitest workers, `--watch` restarts, and integration test isolation
    can bypass the module cache.

**Financial Impact:** Flaky integration test suites block CI. Developers waste
time debugging "phantom" registration errors unrelated to their changes. In
production, hot-reload during zero-downtime deploys can crash the metrics
endpoint.

> **DANGER:** Do NOT create Prometheus metrics at module top level without a
> deduplication guard.

## 2. The Verified Fix (The Principle)

**Principle:** Use a `getOrCreate` factory that checks the registry before
constructing a new metric. Centralize the registry instance.

**Implementation Pattern:**

1.  Single `register` export from one canonical module (`server/metrics.ts`)
2.  Factory functions that check `register.getSingleMetric(name)` first
3.  All other files import the factories instead of constructing metrics
    directly

```typescript
// VERIFIED IMPLEMENTATION -- server/metrics.ts

import promClient from 'prom-client';

// Single registry -- all metrics share this instance
export const register = promClient.register;

function getOrCreateCounter(
  name: string,
  help: string,
  labelNames?: string[]
): promClient.Counter<string> {
  const existing = register.getSingleMetric(name) as
    | promClient.Counter<string>
    | undefined;
  if (existing) return existing;
  const config: { name: string; help: string; labelNames?: string[] } = {
    name,
    help,
  };
  if (labelNames) config.labelNames = labelNames;
  return new promClient.Counter(config);
}

function getOrCreateGauge(
  name: string,
  help: string,
  labelNames?: string[]
): promClient.Gauge<string> {
  const existing = register.getSingleMetric(name) as
    | promClient.Gauge<string>
    | undefined;
  if (existing) return existing;
  const config: { name: string; help: string; labelNames?: string[] } = {
    name,
    help,
  };
  if (labelNames) config.labelNames = labelNames;
  return new promClient.Gauge(config);
}

// Usage in any file:
export const httpRequestsTotal = getOrCreateCounter(
  'http_requests_total',
  'Total HTTP requests',
  ['method', 'route', 'status']
);
```

**Key Learnings:**

1. `prom-client` throws on duplicate registration by design -- it's a safety
   check, not a bug
2. The `getOrCreate` pattern is idempotent: safe to call from any number of
   import paths
3. Five files needed this fix in one session: `server/metrics.ts`,
   `server/observability/performance-metrics.ts`,
   `server/metrics/variance-metrics.ts`, `server/lib/error-budget.ts`,
   `server/observability/lp-metrics.ts`
4. Integration tests are the primary trigger because Vitest runs setup files
   that import server modules in the same process

## 3. Evidence

- **Source Session:** 2026-02-17/18 -- commits 687a9a89, ee51ae96, faea6bba
  (integration test hardening chain)
- **Files Affected:** `server/metrics.ts`,
  `server/observability/performance-metrics.ts`,
  `server/metrics/variance-metrics.ts`, `server/lib/error-budget.ts`,
  `server/observability/lp-metrics.ts`, `tests/mocks/metrics-mock.ts`
- **Related:** REFL-007 (global mock pollution), REFL-001 (dynamic imports
  prevent side effects)
