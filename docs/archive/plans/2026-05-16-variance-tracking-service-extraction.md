# Variance Tracking Service Extraction Implementation Plan

> Archived superseded plan. Do not execute this checklist as current guidance.
> It reflects an earlier branch state before alert and calculation service
> extraction had landed. Use current code and newer active plans instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the next refactor target by splitting the backend variance
tracking service into focused modules without changing API behavior.

**Architecture:** Keep `server/services/variance-tracking.ts` as the public
facade for existing route, test, and automation imports. Complete the
already-started `BaselineService` extraction, then extract
`AlertManagementService` plus shared alert helpers into
`server/services/variance-tracking/`. Leave `VarianceCalculationService` in the
facade for this PR so the diff stays reviewable.

**Tech Stack:** TypeScript, Node/Express, Drizzle ORM, Vitest, existing variance
metrics/logging helpers.

---

## Scope

This plan covers one backend-only refactor PR.

In scope:

- Preserve current imports from `server/services/variance-tracking`.
- Finish and verify the existing local `BaselineService` extraction.
- Extract alert helper functions and `AlertManagementService`.
- Keep tests behavior-focused and focused on existing public contracts.

Out of scope:

- Refactoring `client/src/pages/variance-tracking.tsx`.
- Refactoring `server/services/metrics-aggregator.ts`.
- Extracting `VarianceCalculationService`; that is the next follow-up once alert
  extraction is green.
- Changing API response shapes, alert semantics, baseline default rules, DB
  schema, or queue behavior.

## Resume Status - 2026-05-16

Baseline extraction is complete and pushed on branch
`refactor/variance-baseline-service-extraction`.

Current committed baseline:

```text
ea65b1e4 Separate variance baseline service
```

That commit changed:

- `server/services/variance-tracking.ts`
- `server/services/variance-tracking/baseline-service.ts`
- `server/services/variance-tracking/db-error-helpers.ts`

Verification recorded in `ea65b1e4`:

- `npm test -- tests/unit/services/variance-tracking.test.ts` (90 passed)
- `npm test -- tests/unit/services/baseline-idempotency.test.ts tests/unit/services/system-actor.test.ts tests/unit/services/metrics-attribution.test.ts tests/unit/services/variance-alert-automation.test.ts`
  (53 passed)
- `npm test -- tests/unit/api/variance-tracking-api.test.ts` (61 passed)
- `npm run lint`
- `npm run check` (0 TypeScript errors)
- `npm run build`

Current next planning target:

- Start at **Task 4: Extract Shared Alert Helpers**.
- Then execute **Task 5: Extract AlertManagementService**.
- Treat **Task 6: Final Verification** as mandatory before pushing.

Do not redo the baseline extraction unless a rebase changes
`server/services/variance-tracking.ts` or
`server/services/variance-tracking/baseline-service.ts`.

## Current Starting Point

The committed branch now contains the baseline extraction. The working tree
should remain clean except for unrelated local files such as
`.claude/discovery.md` and this plan document.

Do not overwrite local dirty files. If unrelated dirty files appear, leave them
unstaged and out of refactor commits.

Existing service boundaries:

- `server/services/variance-tracking/baseline-service.ts`: `BaselineService`
- `server/services/variance-tracking.ts:161`: `VarianceCalculationService`
- `server/services/variance-tracking.ts:1203`: `AlertManagementService`
- `server/services/variance-tracking.ts:1766`: `VarianceTrackingService`
- `server/services/variance-tracking.ts:1888`: `varianceTrackingService`
- `server/services/variance-tracking.ts:1900`: `getAttributedKPIs`

Primary consumers to keep stable:

- `server/routes/variance.ts`
- `server/services/variance-alert-automation.ts`
- `tests/unit/services/variance-tracking.test.ts`
- `tests/unit/api/variance-tracking-api.test.ts`
- `tests/unit/services/variance-alert-automation.test.ts`

## File Structure

Modify:

- `server/services/variance-tracking.ts` - public facade plus remaining
  calculation service and coordinator.
- `tests/unit/services/variance-tracking.test.ts` - add a small public-boundary
  regression test if not already present after the current extraction.

Keep:

- `server/services/variance-tracking/baseline-service.ts` - extracted baseline
  creation and management.
- `server/services/variance-tracking/db-error-helpers.ts` - shared DB error
  guard.

Create:

- `server/services/variance-tracking/alert-helpers.ts` - shared alert helper
  types and small pure helpers used by calculation and alert management.
- `server/services/variance-tracking/alert-management-service.ts` - alert rule,
  incident, acknowledgement, resolution, and active-alert query behavior.

Do not modify:

- `client/src/pages/variance-tracking.tsx`
- `server/services/metrics-aggregator.ts`
- `.claude/discovery.md`

## Task 1: Preflight And Behavior Lock

**Files:**

- Read: `server/services/variance-tracking.ts`
- Read: `server/services/variance-tracking/baseline-service.ts`
- Read: `tests/unit/services/variance-tracking.test.ts`
- Modify: none

- [x] **Step 1: Confirm only intended files are dirty**

Run:

```powershell
git status --short
```

Expected relevant output after resume:

```text
 M .claude/discovery.md
?? docs/superpowers/plans/2026-05-16-variance-tracking-service-extraction.md
```

If additional dirty files appear, inspect them before editing. Do not stage or
change unrelated files.

- [x] **Step 2: Run the targeted regression suite before further refactor
      edits**

Run:

```powershell
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
```

Expected: all targeted tests pass. This was completed for the baseline commit;
rerun before alert extraction if the branch has been rebased or if variance
service files changed since `ea65b1e4`.

- [x] **Step 3: Run TypeScript check before further refactor edits**

Run:

```powershell
npm run check
```

Expected: TypeScript baseline check passes. Completed in `ea65b1e4`; rerun
before alert extraction if branch history changed.

## Task 2: Add A Public Boundary Regression

**Files:**

- Modify: `tests/unit/services/variance-tracking.test.ts`

The existing tests already import and instantiate `BaselineService`,
`VarianceCalculationService`, `AlertManagementService`, and
`VarianceTrackingService`. The existing
`should provide access to all sub-services` test at
`tests/unit/services/variance-tracking.test.ts:2375` already locks the facade
well enough for the alert extraction. Add the explicit test below only if that
test is removed or weakened during execution.

- [ ] **Step 1: Add this test inside the existing
      `describe('VarianceTrackingService'...)` integration area if needed**

Add near the existing `service integration` tests:

```typescript
it('keeps the public variance tracking facade stable', () => {
  expect(BaselineService).toBeTypeOf('function');
  expect(VarianceCalculationService).toBeTypeOf('function');
  expect(AlertManagementService).toBeTypeOf('function');
  expect(VarianceTrackingService).toBeTypeOf('function');

  expect(service.baselines).toBeInstanceOf(BaselineService);
  expect(service.calculations).toBeInstanceOf(VarianceCalculationService);
  expect(service.alerts).toBeInstanceOf(AlertManagementService);
});
```

- [ ] **Step 2: Run the focused test file**

Run:

```powershell
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts
```

Expected: pass. If it fails, the facade is already unstable; fix the public
exports before moving code.

- [ ] **Step 3: Commit only the test if it was added cleanly**

Run:

```powershell
git add tests/unit/services/variance-tracking.test.ts
git commit -m "Lock variance tracking service facade"
```

Use a Lore commit body if this repo branch is being committed locally during
execution:

```text
Lock variance tracking service facade

The next refactor moves service classes into focused modules, so this adds a
small regression around the public facade consumed by routes, automation, and
existing tests.

Constraint: Preserve imports from server/services/variance-tracking during extraction
Confidence: high
Scope-risk: narrow
Tested: npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts
```

## Task 3: Stabilize The Existing BaselineService Extraction

**Files:**

- Modify: `server/services/variance-tracking.ts`
- Modify: `server/services/variance-tracking/baseline-service.ts`
- Modify: `server/services/variance-tracking/db-error-helpers.ts`

- [x] **Step 1: Confirm the facade imports and re-exports `BaselineService`**

`server/services/variance-tracking.ts` should include this import/export shape:

```typescript
import { BaselineService } from './variance-tracking/baseline-service';

export { BaselineService };
export type { BaselineCreationMode } from './variance-tracking/baseline-service';
```

- [x] **Step 2: Confirm `baseline-service.ts` owns baseline-only imports**

`server/services/variance-tracking/baseline-service.ts` should own these imports
because baseline logic uses them directly:

```typescript
import { db } from '../../db';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  fundBaselines,
  fundMetrics,
  portfolioCompanies,
  investments,
  fundSnapshots,
  calcRuns,
  users,
} from '@shared/schema';
import type { FundBaseline, InsertFundBaseline } from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  recordBaselineOperation,
  recordSystemError,
} from '../../metrics/variance-metrics';
import {
  SYSTEM_ACTOR_ID,
  SYSTEM_ACTOR_USERNAME,
} from '@shared/constants/system-actor';
import { logger } from '../../lib/logger';
import { isUniqueConstraintViolation } from './db-error-helpers';
```

- [x] **Step 3: Confirm `db-error-helpers.ts` has the shared unique-constraint
      guard**

`server/services/variance-tracking/db-error-helpers.ts` should contain:

```typescript
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
  };
  return (
    candidate.code === '23505' ||
    String(candidate.constraint ?? '').includes('unique') ||
    String(candidate.message ?? '')
      .toLowerCase()
      .includes('unique')
  );
}
```

If the existing helper is stricter but already passes tests, keep it. Do not
widen behavior unless tests require it.

- [x] **Step 4: Remove baseline-only imports from the facade**

After the baseline class is fully moved, `server/services/variance-tracking.ts`
should no longer import these symbols unless another remaining class uses them:

```typescript
investments;
calcRuns;
users;
InsertFundBaseline;
recordBaselineOperation;
logger;
SYSTEM_ACTOR_USERNAME;
```

Use `npm run check` after cleanup to catch unused or missing imports.

- [x] **Step 5: Run targeted verification**

Run:

```powershell
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
npm run check
```

Expected: all targeted tests and TypeScript check pass.

- [x] **Step 6: Commit the baseline extraction stabilization**

Run:

```powershell
git add server/services/variance-tracking.ts server/services/variance-tracking/baseline-service.ts server/services/variance-tracking/db-error-helpers.ts
git commit -m "Separate variance baseline service"
```

Use this commit body:

```text
Separate variance baseline service

Baseline creation and defaulting are already large enough to obscure the
calculation and alert responsibilities in the variance tracking facade. This
keeps the public facade stable while moving baseline-specific imports and
helpers into a focused module.

Constraint: Preserve server/services/variance-tracking imports for routes and tests
Rejected: Extract every variance service at once | review surface would be too broad
Confidence: high
Scope-risk: narrow
Tested: npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
Tested: npm run check
```

## Task 4: Extract Shared Alert Helpers

**Files:**

- Create: `server/services/variance-tracking/alert-helpers.ts`
- Modify: `server/services/variance-tracking.ts`

These helpers are shared because `VarianceCalculationService` uses
triggered-alert data while `AlertManagementService` uses decimal/query/config
helpers.

- [ ] **Step 1: Create `alert-helpers.ts`**

Create `server/services/variance-tracking/alert-helpers.ts` with:

```typescript
import { Decimal } from '@shared/lib/decimal-utils';
import type { PerformanceAlert } from '@shared/schema';

export interface TriggeredAlertData {
  ruleId: string;
  ruleName?: string;
  metricName: string;
  thresholdValue: number;
  actualValue: number | null;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
}

function isTriggeredAlertSeverity(
  value: unknown
): value is TriggeredAlertData['severity'] {
  return (
    value === 'info' ||
    value === 'warning' ||
    value === 'critical' ||
    value === 'urgent'
  );
}

export function normalizeTriggeredAlertSeverity(
  value: unknown
): TriggeredAlertData['severity'] {
  return isTriggeredAlertSeverity(value) ? value : 'warning';
}

export function hasReturningQuery(
  value: unknown
): value is { returning: () => Promise<PerformanceAlert[]> } {
  return (
    value != null &&
    typeof value === 'object' &&
    'returning' in value &&
    typeof (value as { returning?: unknown }).returning === 'function'
  );
}

export function hasExecuteQuery(
  value: unknown
): value is { execute: () => Promise<PerformanceAlert[]> } {
  return (
    value != null &&
    typeof value === 'object' &&
    'execute' in value &&
    typeof (value as { execute?: unknown }).execute === 'function'
  );
}

export function toNullableDecimalString(
  value: Decimal | string | number | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value instanceof Decimal ? value.toString() : String(value);
}

export function isEmptyConfigPayload(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}
```

- [ ] **Step 2: Replace helper definitions in the facade with imports**

In `server/services/variance-tracking.ts`, remove the local definitions for:

```text
TriggeredAlertData
isTriggeredAlertSeverity
normalizeTriggeredAlertSeverity
hasReturningQuery
hasExecuteQuery
toNullableDecimalString
isEmptyConfigPayload
```

Add this import near the other local service imports:

```typescript
import {
  normalizeTriggeredAlertSeverity,
  type TriggeredAlertData,
} from './variance-tracking/alert-helpers';
```

Do not import `hasReturningQuery`, `hasExecuteQuery`, `toNullableDecimalString`,
or `isEmptyConfigPayload` into the facade after this task; those will be used by
the extracted alert-management module in Task 5.

- [ ] **Step 3: Run the focused service tests**

Run:

```powershell
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts
```

Expected: pass.

## Task 5: Extract AlertManagementService

**Files:**

- Create: `server/services/variance-tracking/alert-management-service.ts`
- Modify: `server/services/variance-tracking.ts`

- [ ] **Step 1: Create the new alert management module with its import block**

Create `server/services/variance-tracking/alert-management-service.ts` with this
import block first:

```typescript
import { db } from '../../db';
import {
  alertEvaluationExecutions,
  alertRules,
  fundBaselines,
  performanceAlerts,
} from '@shared/schema';
import type {
  AlertRule,
  FundBaseline,
  InsertAlertRule,
  InsertPerformanceAlert,
  PerformanceAlert,
} from '@shared/schema';
import { and, desc, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import {
  normalizeAlertMetricName,
  OPEN_INCIDENT_STATUSES,
  toNullableNumber,
} from '../variance-alert-evaluation';
import type {
  AlertQueryStatus,
  SupportedAlertMetricValue,
} from '../variance-alert-evaluation';
import { toDecimal } from '@shared/lib/decimal-utils';
import { SYSTEM_ACTOR_ID } from '@shared/constants/system-actor';
import {
  recordAlertAction,
  recordAlertGenerated,
} from '../../metrics/variance-metrics';
import { isUniqueConstraintViolation } from './db-error-helpers';
import {
  hasExecuteQuery,
  hasReturningQuery,
  isEmptyConfigPayload,
  toNullableDecimalString,
} from './alert-helpers';
```

- [ ] **Step 2: Move the alert class unchanged**

Move the complete `AlertManagementService` class from
`server/services/variance-tracking.ts:1203-1761` into
`server/services/variance-tracking/alert-management-service.ts` below the
imports.

The moved class must still start with:

```typescript
/**
 * Alert management service
 */
export class AlertManagementService {
```

The moved class must still include these public methods:

```typescript
async createAlertRule(params: {
async createAlert(params: {
async upsertTriggeredAlertIncident(params: {
async acknowledgeAlert(alertId: string, userId: number, notes?: string): Promise<void> {
async resolveAlert(alertId: string, userId: number, notes?: string): Promise<void> {
async resolveSupersededBaselineAlerts(params: {
async getActiveAlerts(
```

The private method must move with the class:

```typescript
private buildIncidentDescription(
```

- [ ] **Step 3: Import and re-export `AlertManagementService` from the facade**

In `server/services/variance-tracking.ts`, add:

```typescript
import { AlertManagementService } from './variance-tracking/alert-management-service';
```

Change the export section to:

```typescript
export { BaselineService };
export { AlertManagementService };
export type { BaselineCreationMode } from './variance-tracking/baseline-service';
```

Keep the constructor behavior unchanged:

```typescript
  constructor() {
    this.baselines = new BaselineService();
    this.calculations = new VarianceCalculationService();
    this.alerts = new AlertManagementService();
    this.alertEvaluation = new VarianceAlertEvaluationService(
      this.baselines,
      this.calculations,
      this.alerts
    );
  }
```

- [ ] **Step 4: Remove alert-only imports from the facade**

After the class move, remove these imports from
`server/services/variance-tracking.ts` unless `VarianceCalculationService`,
`VarianceTrackingService`, or `getAttributedKPIs` still uses them:

```text
alertEvaluationExecutions
AlertRule
InsertAlertRule
InsertPerformanceAlert
AlertQueryStatus
SupportedAlertMetricValue
OPEN_INCIDENT_STATUSES
toNullableNumber
recordAlertGenerated
recordAlertAction
isUniqueConstraintViolation
```

Keep these imports in the facade if still used by `VarianceCalculationService`:

```text
performanceAlerts
alertRules
buildAlertRuleEvaluation
normalizeAlertMetricName
```

- [ ] **Step 5: Run TypeScript check immediately**

Run:

```powershell
npm run check
```

Expected: pass. If it fails with missing imports, add the missing import only in
the module that directly uses the symbol.

- [ ] **Step 6: Run targeted variance tests**

Run:

```powershell
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit the alert extraction**

Run:

```powershell
git add server/services/variance-tracking.ts server/services/variance-tracking/alert-helpers.ts server/services/variance-tracking/alert-management-service.ts tests/unit/services/variance-tracking.test.ts
git commit -m "Separate variance alert management"
```

Use this commit body:

```text
Separate variance alert management

Alert rule management and incident resolution were sharing one large facade with
calculation and coordinator code. This moves alert-specific behavior behind a
focused module while preserving the public variance tracking service contract.

Constraint: Routes and automation continue importing from server/services/variance-tracking
Rejected: Move VarianceCalculationService in the same commit | calculation logic is larger and should be reviewed separately
Confidence: high
Scope-risk: moderate
Directive: Do not import from the facade inside variance-tracking submodules; submodules should depend on shared helpers or sibling modules directly
Tested: npm run check
Tested: npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
```

## Task 6: Final Verification

**Files:**

- Read: all changed files
- Modify: only if verification fails

- [ ] **Step 1: Run lint**

Run:

```powershell
npm run lint
```

Expected: pass. If lint reports import ordering or unused symbols, fix the exact
file reported and rerun `npm run lint`.

- [ ] **Step 2: Run TypeScript check**

Run:

```powershell
npm run check
```

Expected: pass.

- [ ] **Step 3: Run targeted tests**

Run:

```powershell
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/variance-tracking.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
```

Expected: pass.

- [ ] **Step 4: Run full unit suite if test infrastructure or shared mocks
      changed**

Run this only if the refactor modified shared test mocks, global setup, or test
infrastructure:

```powershell
npm test
```

Expected: pass.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git diff --stat
git diff -- server/services/variance-tracking.ts server/services/variance-tracking tests/unit/services/variance-tracking.test.ts
```

Expected:

- `server/services/variance-tracking.ts` is shorter and remains the public
  facade.
- `baseline-service.ts` owns baseline behavior.
- `alert-management-service.ts` owns alert management behavior.
- `alert-helpers.ts` contains only small shared helpers.
- No client files changed.
- `.claude/discovery.md` remains unstaged unless intentionally handled
  separately.

## Task 7: Push Or Prepare PR

**Files:**

- Modify: none

- [ ] **Step 1: Confirm commit stack**

Run:

```powershell
git log --oneline -5
```

Expected: the latest commits include the test/facade lock, baseline extraction
stabilization, and alert extraction if each task committed separately.

- [ ] **Step 2: Push the branch**

Run:

```powershell
git push
```

Expected: branch pushes cleanly. If the remote rejects because the branch moved,
run `git fetch origin`, inspect divergence, and rebase only after confirming no
unrelated user work will be overwritten.

## Follow-Up Refactor Target

After this plan is complete and merged, the next refactor should extract
`VarianceCalculationService` into:

```text
server/services/variance-tracking/calculation-service.ts
```

Do that as a separate plan because it owns the largest calculation surface:

- snapshot computation
- variance report generation
- portfolio variance analysis
- reserve/pacing structured comparison helpers
- alert trigger detection inputs

The acceptance test for that follow-up should be the same facade-boundary test
plus the full existing `tests/unit/services/variance-tracking.test.ts` file.

## Self-Review

Spec coverage:

- Backend variance service extraction is covered by Tasks 1-6.
- Existing API/import compatibility is covered by Task 2 and targeted API tests.
- Dirty user files are protected by explicit do-not-modify and do-not-stage
  notes.
- Client and metrics aggregator refactors are intentionally excluded.

Placeholder scan:

- No `TBD`, `TODO`, or open-ended implementation placeholders are used as plan
  steps.
- Every code step has file paths, code snippets, and verification commands.

Type consistency:

- `BaselineService`, `AlertManagementService`, `VarianceCalculationService`,
  `VarianceTrackingService`, and `varianceTrackingService` remain exported from
  `server/services/variance-tracking`.
- `TriggeredAlertData` and `normalizeTriggeredAlertSeverity` move to
  `alert-helpers.ts` because calculation code still uses them.
- Alert-only helpers move with `AlertManagementService` consumers.
