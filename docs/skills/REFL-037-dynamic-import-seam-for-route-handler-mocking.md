---
id: REFL-037
title: Dynamic-Import Seam for Route-Handler Mocking
severity: medium
category: Test Infrastructure
discovered: 2026-04-08
tags:
  [
    test-infrastructure,
    vi-mock,
    route-handlers,
    dynamic-import,
    integration-tests,
    pattern,
  ]
error_codes: []
last_updated: 2026-04-08
---

# REFL-037: Dynamic-Import Seam for Route-Handler Mocking

## Pattern

Express route handlers in this codebase load their service and engine
dependencies via `await import('../services/...')` INSIDE the handler body
rather than via top-level static imports. The reason is not lazy loading or
bundle splitting - it is a deliberate test seam.

```typescript
// server/routes/sensitivity.ts (lines 63-65, 105-107, 147-149)
router.post('/funds/:id/sensitivity/one-way', async (req, res) => {
  // ... validate fundId + parse body ...

  const { sensitivityRunService } =
    await import('../services/sensitivity-run-service');
  const { oneWaySensitivityEngine, SensitivityEngineError } =
    await import('../services/one-way-sensitivity-engine');

  // ... use the service + engine ...
});
```

## Why It Matters

`vi.mock('../../server/services/sensitivity-run-service', ...)` substitutes the
module against the SAME specifier the handler uses for its dynamic import. At
call time, the handler resolves the specifier through Vitest's module graph and
gets the mock - not the real module - even though the route file itself was
loaded statically by the test
(`import sensitivityRouter from '../../server/routes/sensitivity'`).

If the handler used a top-level static import instead, the mock would have to
fire BEFORE the route module loads. With a dynamic import inside the handler,
the mock setup is decoupled from the import order entirely.

## Use Cases

- Unit tests that need to substitute a service mock per test case
  (`tests/unit/routes/sensitivity-routes-error-mapping.test.ts` is the
  table-driven exemplar)
- Integration tests that need to mock the entire service + engine layer while
  still exercising the real route + Express middleware stack
  (`tests/integration/sensitivity-routes.test.ts` is the Phase 4 example)
- Any future route module where the unit tests want fast, isolated substitution
  without spawning a full server process

## Apply This Pattern When

1. The route module imports a service / engine that you want to mock cleanly
2. You want unit tests to NOT depend on the real DB / Redis / external API
3. You want the SAME mock setup to work for both unit-layer error mapping tests
   and integration-layer end-to-end tests
4. You do NOT need top-level visibility of the imported symbols (e.g. for
   dependency injection containers, shared singletons, or eager initialization
   side effects)

## Do NOT Apply When

1. The imported module has eager initialization side effects that must run at
   server boot (e.g. registering Pino transports, connecting to a message
   broker). Those need top-level imports so the side effects fire when the route
   module loads.
2. The route handler is performance-critical and the dynamic import overhead is
   measurable (Node caches the resolved module so subsequent calls are cheap,
   but the FIRST call pays a microtask + module-graph lookup cost).
3. The imported symbol is a TypeScript type that you need at the type level.
   `await import` resolves at runtime; types should still be imported via
   `import type { ... }` at the top of the file.

## Phase 4 (M8) Implementation Reference

- `server/routes/sensitivity.ts` - the canonical example (5 routes, all use the
  same pattern)
- `tests/unit/routes/sensitivity-routes-error-mapping.test.ts` - unit-layer
  table-driven STATUS_BY_CODE pin
- `tests/integration/sensitivity-routes.test.ts` - integration-layer end-to-end
  shape proof (added in Phase 4 of M8 - 2026-04-08)

## Anti-Pattern (do not do this)

```typescript
// BAD: top-level static imports defeat the dynamic-import seam
import { sensitivityRunService } from '../services/sensitivity-run-service';
import { oneWaySensitivityEngine } from '../services/one-way-sensitivity-engine';

router.post('/funds/:id/sensitivity/one-way', async (req, res) => {
  // ... uses sensitivityRunService and oneWaySensitivityEngine ...
});
```

The static import path forces every test that touches the route to either (a)
install a global vi.mock at the top of the test file BEFORE the import statement
(works but is brittle - import order matters), or (b) skip the mock entirely and
stand up real dependencies (slow + flaky).

## Sibling Patterns

- `STATUS_BY_CODE` mapping at `server/routes/sensitivity.ts:34-41` -
  comment-anchored to the unit test that pins it. Adding a new error code
  requires adding a row HERE AND in the test file. The dynamic-import seam is
  what makes the unit test fast enough to be the single source of truth for the
  mapping.
- `tests/integration/backtesting-api.test.ts` - earlier example of the same
  pattern in the backtesting routes (different file but same seam shape).

## Related REFLs

- REFL-007 (Global vi.mock pollutes all tests) - the dynamic-import seam scopes
  mocks per-test-file, avoiding the cross-file pollution that REFL-007 warns
  about.
- REFL-036 (Silent test discovery loss from **tests** dirs) - tests that use
  this pattern still need to live under `tests/unit/` or `tests/integration/`,
  never under `__tests__/`, regardless of how cleverly they mock.
