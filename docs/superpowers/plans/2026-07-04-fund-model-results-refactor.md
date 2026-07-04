# Fund Model Results Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 2,101-line fund model results page into focused helpers,
hooks, and section components without changing URLs, payload contracts,
server-backed data semantics, evidence headers, or user-visible workflows.

**Architecture:** Treat this as a behavior-preserving refactor lane only after a
fresh current-main intake confirms refactor work is the right next lane. Move
pure helpers first, presentational components second, and polling/fetch hooks
last. Keep `client/src/pages/fund-model-results.tsx` as the route shell and do
not introduce API, schema, database, or dependency changes.

**Tech Stack:** React 18, TypeScript, Vite, Wouter, TanStack Query cache
helpers, Vitest, Testing Library, Tailwind, shadcn/ui, shared Zod contract
types.

## Global Constraints

- Execute this plan only after live current-main intake; do not launch from
  `.omx/plans/prd-next-development-goal-current-main-rebaseline.md`.
- Execute on a dedicated branch created off freshly pulled `main`
  (`feat/fund-model-results-refactor`); never commit onto an existing feature
  branch. Do not run this plan while another lane has uncommitted or in-flight
  work in the same checkout; wait for it to land or use a separate git worktree.
- The page source is authoritative for all moved code. Embedded snippets in this
  plan are illustrative: move code together with its comments (for example the
  provenance-authority note on `sectionEvidence` and the GP-economics /
  waterfall config-backed notes on the evidence helpers), and diff each moved
  body against the page after extraction.
- Refactor only: no URL changes, no request or response shape changes, no schema
  changes, no database changes, no new dependencies.
- Preserve server-backed-only results data. Do not add sessionStorage reads,
  fabricated defaults, wizard data fallbacks, or mock-derived production data.
- Preserve scenario comparison request validation, comparison parsing with
  `FundScenarioComparisonV1Schema.parse`, evidence header provenance, stale
  evidence copy, polling backoff behavior, and recalculation refresh behavior.
- Keep `client/src/pages/fund-model-results.tsx` as the default export consumed
  by `tests/unit/pages/fund-model-results.test.tsx`.
- Use PowerShell commands on Windows. Prefix Vitest commands with
  `$env:TZ='UTC';`.
- Run focused tests before edits and after each task. Run `npm run lint` and
  `npm run check` before final completion.
- Preserve unrelated dirt. If unrelated files appear during execution, list them
  in the final report and do not stage or normalize them.

---

## Scope Check

This plan covers one subsystem: `client/src/pages/fund-model-results.tsx`.

It does not execute the LP metric-run decomposition, allocations decomposition,
variance response cleanup, quarantine governance cleanup, or schema
compatibility work. Those are separate subsystems and need their own
PRD/test-spec or plan.

If fresh current-main intake says product/platform leverage is the lane, stop
this plan and plan the LP metric-run surface instead.

## File Structure

Target file ownership after the refactor:

- Modify: `client/src/pages/fund-model-results.tsx`
  - Route shell only: route param parsing, hook composition, terminal state
    branching, final page assembly.
- Create: `client/src/pages/fund-model-results/types.ts`
  - Shared local state types currently embedded in the page.
- Create: `client/src/pages/fund-model-results/formatters.ts`
  - Pure formatting and lifecycle status helpers.
- Create: `client/src/pages/fund-model-results/evidence.ts`
  - Pure reason-copy, provenance, evidence-header, scorecard-source, and
    lifecycle diagnostic helpers.
- Create: `client/src/pages/fund-model-results/FadeInSection.tsx`
  - IntersectionObserver fade-in wrapper.
- Create: `client/src/pages/fund-model-results/SectionRenderer.tsx`
  - Generic section availability renderer.
- Create: `client/src/pages/fund-model-results/states.tsx`
  - Loading, latest-route error, and generic error states.
- Create: `client/src/pages/fund-model-results/lifecycle-cards.tsx`
  - Config diff, lifecycle status, recalculate, publish history, and publish
    comparison cards.
- Create: `client/src/pages/fund-model-results/result-section-cards.tsx`
  - Overview, waterfall, economics, and shared fact-tile rendering.
- Create: `client/src/pages/fund-model-results/scenario-section.tsx`
  - Scenario analysis card and scenario comparison panel.
- Create: `client/src/pages/fund-model-results/results-hooks.ts`
  - Results, lifecycle history, publish comparison, scenario comparison, and
    recalculate hooks.
- Never create an `index.ts`/`index.tsx` in
  `client/src/pages/fund-model-results/`: the app lazy-imports the page
  extensionless (`import('@/pages/fund-model-results')` in
  `client/src/app/app-routes.tsx`), and resolution must keep landing on the
  `.tsx` page file, not a directory index.
- Test: `tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx`
  - Pure helper coverage that fails before helper extraction and protects the
    extracted modules after the move.
  - Must be named `.test.tsx`: the client Vitest project includes only
    `tests/unit/**/*.test.tsx` (`vitest.config.mjs`); a `.test.ts` file under
    `tests/unit/` is claimed by the server project and is silently skipped under
    `--project=client`.
- Existing tests remain primary behavior locks:
  - `tests/unit/pages/fund-model-results.test.tsx`
  - `tests/integration/wizard-to-results-e2e.test.ts`
  - `tests/integration/fund-results-comparison-route.test.ts`
  - `tests/unit/contract/fund-results-route.test.ts`
  - `tests/unit/contract/fund-results-comparison.test.ts`
  - `tests/unit/components/results/EvidenceHeader.test.tsx`
  - `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`
  - `tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx`
  - `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`

---

### Task 1: Live Preflight And Behavior Baseline

**Files:**

- Read: `.omx/plans/prd-next-development-goal-current-main-rebaseline.md`
- Read: `.omx/plans/priority-development-queue-20260508.md`
- Read: `.omx/plans/prd-professional-web-app-recovery-20260513.md`
- Read: `client/src/pages/fund-model-results.tsx`
- Test: `tests/unit/pages/fund-model-results.test.tsx`

**Interfaces:**

- Consumes: current checkout and existing tests.
- Produces: evidence that execution is allowed and a green baseline before any
  refactor edit.

- [ ] **Step 1: Confirm checkout and create the working branch**

Run:

```powershell
git status --short --branch
git fetch origin main
git switch -c feat/fund-model-results-refactor origin/main
git rev-parse HEAD
git log -1 --oneline
```

Expected:

- If `git status` shows uncommitted or in-flight work from another lane, stop:
  wait for that lane to land or move this plan to a separate git worktree before
  creating the branch.
- The new branch is created off freshly fetched `origin/main`; branch and HEAD
  are recorded in the task notes.
- Any unrelated dirty files are listed and left untouched.

- [ ] **Step 2: Confirm this is not launching from the retired rebaseline
      handoff**

Run:

```powershell
Select-String -LiteralPath '.omx/plans/prd-next-development-goal-current-main-rebaseline.md' -Pattern 'status:|superseded_by|Do not launch|RETIRED' -Context 1,2
Select-String -LiteralPath '.omx/plans/priority-development-queue-20260508.md' -Pattern 'Queue verdict|exhausted|fresh priority intake|current `main`' -Context 1,2
Select-String -LiteralPath '.omx/plans/prd-professional-web-app-recovery-20260513.md' -Pattern '^Status:' -Context 0,1
gh issue list --state open --limit 20
```

Expected:

- The old rebaseline plan reports `status: RETIRED`.
- The queue reports it is exhausted and calls for fresh current-main intake.
- The recovery PRD status and the open GitHub issues are recorded. Retirement of
  the old queue is only negative evidence: if the recovery PRD still claims the
  active execution lane, or an open PRD issue names a different next lane, stop
  before code edits and report that this plan is gated.
- If fresh intake has not been done, stop before code edits and report that this
  plan is ready but gated.

- [ ] **Step 3: Recount the local target and evidence metrics**

Run:

```powershell
(Get-Content -LiteralPath 'client/src/pages/fund-model-results.tsx').Count
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results.test.tsx
```

Expected:

- Line count is recorded.
- Focused page test passes before any refactor edit.

- [ ] **Step 4: Commit nothing**

Run:

```powershell
git diff --name-only
```

Expected:

- No tracked diff yet.

---

### Task 2: Extract Pure Types, Formatters, And Evidence Helpers

**Files:**

- Create: `client/src/pages/fund-model-results/types.ts`
- Create: `client/src/pages/fund-model-results/formatters.ts`
- Create: `client/src/pages/fund-model-results/evidence.ts`
- Create: `tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx`
- Modify: `client/src/pages/fund-model-results.tsx`

**Interfaces:**

- Consumes: current local types and pure helper functions from
  `client/src/pages/fund-model-results.tsx`.
- Produces:
  - `FetchState`
  - `LifecycleHistoryState`
  - `RecalculateState`
  - `ResultsComparisonState`
  - `ScenarioComparisonState`
  - `LifecycleStatus`
  - `FetchOptions`
  - `LifecyclePollingKey`
  - `formatLifecycleStatus(status)`
  - `formatHistoryRunStatus(status)`
  - `historyBadgeClasses(status)`
  - `formatComparisonMetricValue(metric, value)`
  - `formatComparisonDelta(delta)`
  - `formatDriftCapabilityReason(delta)`
  - `formatDateOrFallback(value, fallback?)`
  - `formatCompactMoney(value)`
  - `formatNullablePercent(value)`
  - `formatMultiple(value)`
  - `hasStaleEvidence(lifecycle)`
  - `diagnosticAlertClasses(tone)`
  - `reasonCopyFor(section)`
  - `sectionEvidence(lifecycle, section)`
  - `evidenceFromLifecycle(lifecycle)`
  - `sectionBackedEvidence(lifecycle, section)`
  - `configBackedEvidence(lifecycle, section)`
  - `deriveScorecardSources(payload)`
  - `mixedScorecardEvidence(lifecycle, section)`
  - `getLifecycleDiagnostic(lifecycle)`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx`
(the `.tsx` extension is required for the client Vitest project to pick the file
up):

```typescript
import { describe, expect, it } from 'vitest';
import {
  FundStateReadV1Schema,
  type FundStateReadV1,
} from '../../../../shared/contracts/fund-state-read-v1.contract';
import type { MetricDelta } from '../../../../shared/contracts/fund-results-comparison-v1.contract';
import {
  formatComparisonDelta,
  formatComparisonMetricValue,
  formatDateOrFallback,
  formatDriftCapabilityReason,
  formatLifecycleStatus,
  hasStaleEvidence,
} from '../../../../client/src/pages/fund-model-results/formatters';
import {
  evidenceFromLifecycle,
  mixedScorecardEvidence,
  reasonCopyFor,
  sectionBackedEvidence,
} from '../../../../client/src/pages/fund-model-results/evidence';
import type { EvidenceHeaderLifecycle } from '../../../../client/src/components/results/EvidenceHeader';

interface LifecycleOverrides {
  configState?: Partial<FundStateReadV1['configState']>;
  calculationState?: Partial<FundStateReadV1['calculationState']>;
}

// Parse through the real strict contract schema so a contract-invalid fixture
// fails loudly here instead of silently passing helper tests (see PR #993).
function lifecycle(overrides: LifecycleOverrides = {}): FundStateReadV1 {
  return FundStateReadV1Schema.parse({
    fundId: 123,
    configState: {
      latestVersion: 3,
      draftVersion: 3,
      publishedVersion: 2,
      hasDraft: true,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: '2026-03-20T11:00:00.000Z',
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
      ...overrides.configState,
    },
    calculationState: {
      status: 'ready',
      configVersion: 2,
      runId: 10,
      correlationId: null,
      dispatchState: null,
      availableSnapshotTypes: ['fund_state', 'fund_snapshots'],
      expectedSnapshotTypes: ['fund_state', 'fund_snapshots'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
      ...overrides.calculationState,
    },
    legacy: { engineResultsPresent: false },
  });
}

describe('fund model results formatters', () => {
  it('keeps lifecycle labels stable', () => {
    expect(formatLifecycleStatus('not_requested')).toBe('Not requested');
    expect(formatLifecycleStatus('submitted')).toBe('Submitted');
    expect(formatLifecycleStatus('calculating')).toBe('Calculating');
    expect(formatLifecycleStatus('ready')).toBe('Ready');
    expect(formatLifecycleStatus('failed')).toBe('Failed');
  });

  it('formats comparison metric values and deltas without changing copy', () => {
    const delta: MetricDelta = {
      metric: 'fundSize',
      displayName: 'Fund Size',
      currentValue: 100_000_000,
      previousValue: 80_000_000,
      absoluteDelta: 20_000_000,
      percentageDelta: 25,
      driftCapable: true,
      driftReason: 'stable',
    };

    expect(formatComparisonMetricValue('fundSize', 100_000_000)).toBe('$100M');
    expect(formatComparisonDelta(delta)).toBe('+$20M (+25.0%)');
    expect(
      formatDriftCapabilityReason({ ...delta, driftReason: 'zero_previous' })
    ).toBe('Previous value is zero, so percentage drift is unstable.');
  });

  it('keeps fallback date copy stable for unavailable values', () => {
    expect(formatDateOrFallback(null)).toBe('Not available');
    expect(formatDateOrFallback(null, 'Not published')).toBe('Not published');
  });

  it('detects stale evidence when calculation config is behind published config', () => {
    expect(hasStaleEvidence(lifecycle())).toBe(false);
    expect(
      hasStaleEvidence(
        lifecycle({
          configState: {
            latestVersion: 4,
            draftVersion: 4,
            publishedVersion: 4,
            publishedAt: '2026-03-21T12:00:00.000Z',
          },
          calculationState: { configVersion: 2 },
        })
      )
    ).toBe(true);
  });
});

describe('fund model results evidence helpers', () => {
  it('keeps reason-code copy stable', () => {
    expect(reasonCopyFor({ reasonCode: 'NO_PUBLISHED_CONFIG' })).toBe(
      'Publish your fund configuration to see this section.'
    );
    expect(reasonCopyFor({ reason: 'Server reason' })).toBe('Server reason');
    expect(reasonCopyFor({})).toBe('Not available');
  });

  it('derives lifecycle evidence from the server lifecycle envelope', () => {
    expect(evidenceFromLifecycle(lifecycle())).toEqual({
      status: 'ready',
      configVersion: 2,
      runId: 10,
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      publishedVersion: 2,
      source: '/api/funds/:id/results',
    });
  });

  it('preserves section-backed evidence semantics', () => {
    const base: EvidenceHeaderLifecycle = evidenceFromLifecycle(lifecycle());
    expect(
      sectionBackedEvidence(base, {
        status: 'available',
        configVersion: 7,
        calculatedAt: '2026-04-01T00:00:00.000Z',
        source: 'fund_snapshots',
      })
    ).toEqual({
      status: 'ready',
      provenanceLevel: 'section_backed_result',
      configVersion: 7,
      runId: null,
      lastCalculatedAt: '2026-04-01T00:00:00.000Z',
      publishedVersion: 2,
      source: 'fund_snapshots',
    });
  });

  it('labels mixed scorecard evidence from actual field sources', () => {
    const base: EvidenceHeaderLifecycle = evidenceFromLifecycle(lifecycle());
    expect(
      mixedScorecardEvidence(base, {
        status: 'available',
        payload: {
          fundSize: { value: 100_000_000, source: 'funds' },
          reserveRatio: { value: 0.4, source: 'fund_snapshots' },
        },
      })
    )?.toMatchObject({
      provenanceLevel: 'mixed_scorecard_sources',
      sourceLabel: 'funds / fund_snapshots',
    });
  });
});
```

- [ ] **Step 2: Run the helper tests to verify the modules are missing**

Run:

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx
```

Expected:

- FAIL with module resolution errors for
  `client/src/pages/fund-model-results/formatters` and
  `client/src/pages/fund-model-results/evidence`.
- If Vitest instead reports that no test files were found, stop: the file is not
  being picked up by the client project, and continuing would leave every later
  "green" vacuous.

- [ ] **Step 3: Create local shared types**

Create `client/src/pages/fund-model-results/types.ts` by moving the existing
type declarations from `client/src/pages/fund-model-results.tsx`:

```typescript
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { FundScenarioComparisonV1 } from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { FundLifecycleHistoryV1 } from '@shared/contracts/fund-lifecycle-history-v1.contract';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';

export type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'data'; results: FundResultsReadV1 };

export type LifecycleHistoryState =
  | { kind: 'loading'; history: FundLifecycleHistoryV1 | null }
  | { kind: 'error'; message: string; history: FundLifecycleHistoryV1 | null }
  | { kind: 'data'; history: FundLifecycleHistoryV1 };

export type RecalculateState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export type ResultsComparisonState =
  | { kind: 'loading'; comparison: FundResultsComparisonV1 | null }
  | {
      kind: 'error';
      message: string;
      comparison: FundResultsComparisonV1 | null;
    }
  | { kind: 'data'; comparison: FundResultsComparisonV1 };

export interface ScenarioComparisonBatchResult {
  comparisons: FundScenarioComparisonV1[];
  failedScenarioSetIds: string[];
}

export type ScenarioComparisonState =
  | {
      kind: 'idle';
      comparisons: FundScenarioComparisonV1[];
      failedScenarioSetIds: string[];
    }
  | {
      kind: 'loading';
      comparisons: FundScenarioComparisonV1[];
      failedScenarioSetIds: string[];
    }
  | {
      kind: 'error';
      message: string;
      comparisons: FundScenarioComparisonV1[];
      failedScenarioSetIds: string[];
    }
  | {
      kind: 'data';
      comparisons: FundScenarioComparisonV1[];
      failedScenarioSetIds: string[];
    };

export type LifecycleStatus = FundStateReadV1['calculationState']['status'];

export interface FetchOptions {
  initial?: boolean;
  background?: boolean;
  resetBackoff?: boolean;
}

export interface LifecyclePollingKey {
  fundId: string;
  status: LifecycleStatus;
  runId: number | null;
  configVersion: number | null;
}

export interface SectionLike {
  status: string;
  reason?: string | undefined;
  reasonCode?: string | undefined;
  payload?: unknown | undefined;
  legacyEvidence?: boolean | undefined;
  [key: string]: unknown;
}
```

- [ ] **Step 4: Create formatters module**

Create `client/src/pages/fund-model-results/formatters.ts` by moving the
existing formatter and lifecycle helpers from the page:

```typescript
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { MetricDelta } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { LifecycleStatus } from './types';

export function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function percentPoints(value: number) {
  return `${value}%`;
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNullablePercent(value: number | null) {
  return value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

export function formatMultiple(value: number) {
  return `${value.toFixed(2)}x`;
}

export function formatDateOrFallback(
  value: string | null,
  fallback = 'Not available'
) {
  return value ? new Date(value).toLocaleDateString() : fallback;
}

export function formatLifecycleStatus(
  status: FundStateReadV1['calculationState']['status']
) {
  switch (status) {
    case 'not_requested':
      return 'Not requested';
    case 'submitted':
      return 'Submitted';
    case 'calculating':
      return 'Calculating';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function formatHistoryRunStatus(status: LifecycleStatus | null) {
  if (!status) return 'Not started';
  return formatLifecycleStatus(status);
}

export function historyBadgeClasses(status: LifecycleStatus | null) {
  switch (status) {
    case 'ready':
      return 'bg-success-light text-success-dark border-success/30';
    case 'failed':
      return 'bg-error-light text-error-dark border-error/30';
    case 'submitted':
    case 'calculating':
      return 'bg-warning-light text-warning-dark border-warning/30';
    default:
      return 'bg-beige-100 text-charcoal-600 border-beige-200';
  }
}

export function formatComparisonMetricValue(
  metric: MetricDelta['metric'],
  value: number | null
) {
  if (value == null) return 'Not available';

  switch (metric) {
    case 'fundSize':
      return `$${(value / 1_000_000).toFixed(0)}M`;
    case 'reserveRatio':
    case 'avgConfidence':
      return `${(value * 100).toFixed(1)}%`;
    case 'yearsToFullDeploy':
      return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} yrs`;
    default:
      return String(value);
  }
}

export function formatComparisonDelta(delta: MetricDelta) {
  if (delta.absoluteDelta == null) return 'No delta available';

  const sign =
    delta.absoluteDelta > 0 ? '+' : delta.absoluteDelta < 0 ? '-' : '';
  const magnitude = formatComparisonMetricValue(
    delta.metric,
    Math.abs(delta.absoluteDelta)
  );

  if (delta.percentageDelta == null) {
    return `${sign}${magnitude}`;
  }

  const percentSign = delta.percentageDelta > 0 ? '+' : '';
  return `${sign}${magnitude} (${percentSign}${delta.percentageDelta.toFixed(1)}%)`;
}

export function formatDriftCapabilityReason(delta: MetricDelta) {
  switch (delta.driftReason) {
    case 'missing_both':
      return 'Current and previous values are unavailable.';
    case 'missing_current':
      return 'Current value is unavailable.';
    case 'missing_previous':
      return 'Previous value is unavailable.';
    case 'zero_previous':
      return 'Previous value is zero, so percentage drift is unstable.';
    case 'stable':
    default:
      return 'Drift is stable.';
  }
}

export function hasStaleEvidence(lifecycle: FundStateReadV1) {
  const publishedVersion = lifecycle.configState.publishedVersion;
  const calculationVersion = lifecycle.calculationState.configVersion;
  return (
    publishedVersion != null &&
    calculationVersion != null &&
    calculationVersion < publishedVersion
  );
}

export function diagnosticAlertClasses(
  tone: 'neutral' | 'warning' | 'danger' | 'success'
) {
  switch (tone) {
    case 'danger':
      return 'border-error/30 bg-error-light';
    case 'warning':
      return 'border-warning/30 bg-warning-light';
    case 'success':
      return 'border-success/30 bg-success-light';
    default:
      return 'border-beige-200 bg-beige-50';
  }
}
```

- [ ] **Step 5: Create evidence module**

Create `client/src/pages/fund-model-results/evidence.ts` by moving the existing
reason/evidence/diagnostic helpers from the page:

```typescript
import type { EvidenceHeaderLifecycle } from '@/components/results/EvidenceHeader';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import { hasStaleEvidence } from './formatters';
import type { SectionLike } from './types';

export const REASON_COPY: Record<string, string> = {
  NO_PUBLISHED_CONFIG: 'Publish your fund configuration to see this section.',
  CALCULATION_PENDING: 'Results are being calculated. Check back shortly.',
  STALE_EVIDENCE:
    'A newer configuration was published. Request recalculation to update.',
  INVALID_PUBLISHED_CONFIG:
    'The published configuration has validation issues.',
  NO_AUTHORITATIVE_SOURCE: 'This section is not yet available for your fund.',
  SCENARIOS_NONE_EXIST:
    'Create a scenario set to compare alternate fund economics.',
  SCENARIOS_NONE_CALCULATED:
    'Calculate a scenario set to show scenario results here.',
  SCENARIOS_LOAD_FAILED: 'Scenario results could not be loaded.',
  ECONOMICS_DISABLED:
    'GP economics is currently disabled for this environment.',
  ECONOMICS_NOT_CONFIGURED:
    'Publish economics assumptions to see GP economics.',
  ECONOMICS_SNAPSHOT_PENDING:
    'Economics is configured and waiting for a calculation snapshot.',
  ECONOMICS_INPUT_INVALID:
    'The published economics assumptions have validation issues.',
  ECONOMICS_ENGINE_FAILED:
    'The economics engine failed before producing a valid result.',
  ECONOMICS_INVARIANT_FAILED:
    'The economics engine found a reconciliation issue.',
  ECONOMICS_STALE_CONFIG_VERSION:
    'Economics results belong to an older published configuration. Recalculate to update.',
};

export function reasonCopyFor(section: { [key: string]: unknown }): string {
  const code =
    typeof section['reasonCode'] === 'string'
      ? section['reasonCode']
      : undefined;
  const reason =
    typeof section['reason'] === 'string' ? section['reason'] : undefined;
  if (code && REASON_COPY[code]) {
    return REASON_COPY[code];
  }
  return reason ?? 'Not available';
}

export function getSectionSource(section: SectionLike) {
  const source = section['source'];
  return typeof source === 'string' && source.trim().length > 0 ? source : null;
}

export function sectionNumber(
  section: SectionLike,
  key: string
): number | null {
  const value = section[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sectionString(
  section: SectionLike,
  key: string
): string | null {
  const value = section[key];
  return typeof value === 'string' ? value : null;
}

export function sectionEvidence(
  lifecycle: EvidenceHeaderLifecycle | undefined,
  section: SectionLike
): EvidenceHeaderLifecycle | null {
  if (!lifecycle) return null;
  if (lifecycle.provenanceLevel != null) return lifecycle;
  return {
    ...lifecycle,
    source: getSectionSource(section) ?? lifecycle.source ?? null,
  };
}

export function evidenceFromLifecycle(
  lifecycle: FundStateReadV1
): EvidenceHeaderLifecycle {
  return {
    status: lifecycle.calculationState.status,
    configVersion: lifecycle.calculationState.configVersion,
    runId: lifecycle.calculationState.runId,
    lastCalculatedAt: lifecycle.calculationState.lastCalculatedAt,
    publishedVersion: lifecycle.configState.publishedVersion,
    source: '/api/funds/:id/results',
  };
}

export function sectionBackedEvidence(
  lifecycle: EvidenceHeaderLifecycle,
  section: SectionLike
): EvidenceHeaderLifecycle | undefined {
  if (section.status !== 'available') return undefined;
  return {
    status: lifecycle.status,
    provenanceLevel: 'section_backed_result',
    configVersion: sectionNumber(section, 'configVersion'),
    runId: null,
    lastCalculatedAt: sectionString(section, 'calculatedAt'),
    publishedVersion: lifecycle.publishedVersion ?? null,
    source: getSectionSource(section) ?? 'fund_snapshots',
  };
}

export function configBackedEvidence(
  lifecycle: EvidenceHeaderLifecycle,
  section: SectionLike
): EvidenceHeaderLifecycle | undefined {
  if (section.status !== 'available') return undefined;
  return {
    status: lifecycle.status,
    provenanceLevel: 'config_backed_setup',
    configVersion: sectionNumber(section, 'configVersion'),
    runId: null,
    lastCalculatedAt: sectionString(section, 'publishedAt'),
    publishedVersion: lifecycle.publishedVersion ?? null,
    source: getSectionSource(section) ?? 'fund_config',
  };
}

export function deriveScorecardSources(payload: unknown): string[] {
  if (payload == null || typeof payload !== 'object') return ['funds'];
  const seen: string[] = [];
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (value != null && typeof value === 'object' && 'source' in value) {
      const source = (value as { source?: unknown }).source;
      if (
        typeof source === 'string' &&
        source.length > 0 &&
        !seen.includes(source)
      ) {
        seen.push(source);
      }
    }
  }
  return seen.length > 0 ? seen : ['funds'];
}

export function mixedScorecardEvidence(
  lifecycle: EvidenceHeaderLifecycle,
  section: SectionLike
): EvidenceHeaderLifecycle | undefined {
  if (section.status !== 'available') return undefined;
  return {
    status: lifecycle.status,
    provenanceLevel: 'mixed_scorecard_sources',
    configVersion: null,
    runId: null,
    lastCalculatedAt: null,
    publishedVersion: null,
    source: null,
    sourceLabel: deriveScorecardSources(section.payload).join(' / '),
  };
}

export function getLifecycleDiagnostic(lifecycle: FundStateReadV1) {
  const { configState, calculationState } = lifecycle;
  const publishedVersion =
    configState.publishedVersion != null
      ? `v${configState.publishedVersion}`
      : 'an unpublished draft';
  const runLabel =
    calculationState.runId != null
      ? `run ${calculationState.runId}`
      : 'the next calculation run';

  if (!configState.hasPublished) {
    return {
      tone: 'neutral' as const,
      title: 'No published configuration yet',
      description:
        'This fund does not have a published configuration yet, so authoritative calculations have not started. Publish a configuration before relying on lifecycle-backed results.',
    };
  }

  if (calculationState.status === 'failed') {
    return {
      tone: 'danger' as const,
      title:
        'Published configuration exists, but the latest calculation failed',
      description: `${publishedVersion} is published, but ${runLabel} did not complete successfully. Review the latest calculation error and retry once the issue is resolved.`,
    };
  }

  if (
    calculationState.status === 'submitted' ||
    calculationState.status === 'calculating'
  ) {
    return {
      tone: 'warning' as const,
      title: 'Calculation is in progress',
      description: `${publishedVersion} is currently being processed under ${runLabel}. The page will keep polling the results endpoint until the lifecycle reaches a terminal state.`,
    };
  }

  if (hasStaleEvidence(lifecycle)) {
    return {
      tone: 'warning' as const,
      title: 'Published configuration is ahead of the current calculation',
      description: `The latest publish is ${publishedVersion}, but the current evidence is still tied to v${calculationState.configVersion}. Recalculate to bring the displayed results back in sync.`,
    };
  }

  if (calculationState.status === 'ready') {
    return {
      tone: 'success' as const,
      title: 'Results are current',
      description: `${publishedVersion} has a completed calculation run, and the results page is showing current server-backed evidence for that publish.`,
    };
  }

  return {
    tone: 'neutral' as const,
    title: 'Calculation has not been requested',
    description: `${publishedVersion} is published, but no calculation run has been requested yet.`,
  };
}
```

- [ ] **Step 6: Replace local definitions in the page with imports**

Modify the top of `client/src/pages/fund-model-results.tsx` so it imports from
the new modules. Remove the duplicate local type, formatter, and evidence helper
declarations after imports compile.

```typescript
import {
  configBackedEvidence,
  evidenceFromLifecycle,
  mixedScorecardEvidence,
  sectionBackedEvidence,
} from './fund-model-results/evidence';
import type { LifecycleStatus } from './fund-model-results/types';
```

Also import any formatter still used by remaining local JSX components:

```typescript
import {
  capitalize,
  diagnosticAlertClasses,
  formatCompactMoney,
  formatComparisonDelta,
  formatComparisonMetricValue,
  formatDateOrFallback,
  formatDriftCapabilityReason,
  formatHistoryRunStatus,
  formatLifecycleStatus,
  formatMultiple,
  formatNullablePercent,
  hasStaleEvidence,
  percent,
  percentPoints,
} from './fund-model-results/formatters';
```

- [ ] **Step 7: Run helper and page tests**

Run:

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx tests/unit/pages/fund-model-results.test.tsx
```

Expected:

- PASS for both helper and page tests.
- If the page test fails, revert only this task's local imports/moves and fix
  the extraction before continuing.

- [ ] **Step 8: Commit Task 2**

Run:

```powershell
git add client/src/pages/fund-model-results.tsx client/src/pages/fund-model-results/types.ts client/src/pages/fund-model-results/formatters.ts client/src/pages/fund-model-results/evidence.ts tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx
git commit -m "refactor: make fund results evidence helpers separately testable" -m "The results page was too large to review safely, so pure formatting and evidence helpers now live behind focused tests before JSX and hook extraction begins." -m "Constraint: Behavior-preserving refactor only; no route, payload, schema, or API changes." -m "Confidence: medium" -m "Scope-risk: narrow" -m "Tested: npx vitest client fund-model-results helper and page tests" -m "Not-tested: Full client suite"
```

Expected:

- Commit succeeds.

---

### Task 3: Extract Fade-In And Terminal State Components

**Files:**

- Create: `client/src/pages/fund-model-results/FadeInSection.tsx`
- Create: `client/src/pages/fund-model-results/states.tsx`
- Modify: `client/src/pages/fund-model-results.tsx`
- Test: `tests/unit/pages/fund-model-results.test.tsx`

**Interfaces:**

- Consumes:
  - `LoadingState`
  - `LatestErrorState`
  - `ErrorState`
  - `FadeInSection`
- Produces exported components with unchanged props:
  - `FadeInSection({ children }: { children: React.ReactNode })`
  - `LoadingState()`
  - `LatestErrorState()`
  - `ErrorState({ message }: { message: string })`

- [ ] **Step 1: Move the fade-in wrapper unchanged**

Create `client/src/pages/fund-model-results/FadeInSection.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

export function FadeInSection({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useFadeInOnScroll();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Move terminal state components unchanged**

Create `client/src/pages/fund-model-results/states.tsx`:

```tsx
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-24 text-center" role="status">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-beige-100 rounded w-1/3 mx-auto" />
        <div className="h-4 bg-beige-100 rounded w-1/2 mx-auto" />
        <div className="h-32 bg-beige-100 rounded" />
        <div className="h-32 bg-beige-100 rounded" />
      </div>
    </div>
  );
}

export function LatestErrorState() {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Invalid results route</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">
          No fund ID specified. Please complete the modeling wizard to view
          results.
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Go to Fund Setup
      </Button>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Error loading results</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">
          {message}
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fund Setup
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Replace local component definitions with imports**

Modify `client/src/pages/fund-model-results.tsx` imports:

```typescript
import { FadeInSection } from './fund-model-results/FadeInSection';
import {
  ErrorState,
  LatestErrorState,
  LoadingState,
} from './fund-model-results/states';
```

Then remove the local `useFadeInOnScroll`, `FadeInSection`, `LoadingState`,
`LatestErrorState`, and `ErrorState` declarations from the page.

- [ ] **Step 4: Run focused page test**

Run:

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results.test.tsx
```

Expected:

- PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add client/src/pages/fund-model-results.tsx client/src/pages/fund-model-results/FadeInSection.tsx client/src/pages/fund-model-results/states.tsx
git commit -m "refactor: isolate fund results route state wrappers" -m "Terminal page states and the scroll fade wrapper are route-adjacent UI shells, so moving them out reduces page size without touching data semantics." -m "Constraint: Keep rendered copy, route fallback behavior, and wouter navigation unchanged." -m "Confidence: medium" -m "Scope-risk: narrow" -m "Tested: npx vitest client fund-model-results page test" -m "Not-tested: Full client suite"
```

Expected:

- Commit succeeds.

---

### Task 4: Extract Section Renderer And Presentational Result Cards

**Files:**

- Create: `client/src/pages/fund-model-results/SectionRenderer.tsx`
- Create: `client/src/pages/fund-model-results/result-section-cards.tsx`
- Create: `client/src/pages/fund-model-results/scenario-section.tsx`
- Create: `client/src/pages/fund-model-results/lifecycle-cards.tsx`
- Modify: `client/src/pages/fund-model-results.tsx`
- Test: `tests/unit/pages/fund-model-results.test.tsx`
- Test: `tests/unit/components/results/EvidenceHeader.test.tsx`
- Test: `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`
- Test:
  `tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx`
- Test: `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`

**Interfaces:**

- Consumes:
  - `SectionLike` from `types.ts`
  - evidence helpers from `evidence.ts`
  - formatter helpers from `formatters.ts`
  - existing shared contract payload types
- Produces:
  - `SectionRenderer(props)`
  - `OverviewCard({ payload })`
  - `WaterfallSetupCard({ payload })`
  - `EconomicsResultsCard({ payload })`
  - `ScenarioAnalysisCard({ fundId, payload, comparisonState })`
  - `ConfigDiffBanner({ lifecycle })`
  - `LifecycleStatusCard({ lifecycle, recalculateState, onRecalculate })`
  - `PublishHistoryCard({ historyState })`
  - `PublishComparisonCard({ comparisonState })`

- [ ] **Step 1: Move SectionRenderer unchanged**

Create `client/src/pages/fund-model-results/SectionRenderer.tsx`:

```tsx
import React from 'react';
import {
  EvidenceHeader,
  type EvidenceHeaderLifecycle,
} from '@/components/results/EvidenceHeader';
import { reasonCopyFor, sectionEvidence } from './evidence';
import type { SectionLike } from './types';

interface SectionRendererProps {
  title: string;
  section: SectionLike;
  renderPayload?: (payload: unknown) => React.ReactNode;
  evidenceLifecycle?: EvidenceHeaderLifecycle | undefined;
  evidenceTestId?: string;
}

export function SectionRenderer({
  title,
  section,
  renderPayload,
  evidenceLifecycle,
  evidenceTestId,
}: SectionRendererProps) {
  const evidence = sectionEvidence(evidenceLifecycle, section);

  if (section.status === 'available') {
    return (
      <div className="bg-white rounded-lg border border-beige-200 p-6">
        <div className="mb-4 space-y-2">
          <h2 className="text-lg font-medium text-charcoal">{title}</h2>
          {evidence && (
            <EvidenceHeader lifecycle={evidence} testId={evidenceTestId} />
          )}
        </div>
        {section.legacyEvidence && (
          <p className="text-xs text-charcoal-400 mb-2">
            Based on previous calculation (legacy data)
          </p>
        )}
        {renderPayload ? (
          renderPayload(section.payload)
        ) : (
          <pre className="text-sm text-charcoal-600 whitespace-pre-wrap font-mono">
            {JSON.stringify(section.payload, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  const statusLabel =
    section.status === 'failed'
      ? section.reasonCode === 'INVALID_PUBLISHED_CONFIG'
        ? 'Configuration issue'
        : 'Calculation failed'
      : section.status === 'pending'
        ? 'Pending'
        : '';
  const copy = reasonCopyFor(section);

  return (
    <div className="bg-beige-50 rounded-lg border border-beige-200 p-6">
      <div className="mb-2 space-y-2">
        <h2 className="text-lg font-medium text-charcoal-400">{title}</h2>
        {evidence && (
          <EvidenceHeader lifecycle={evidence} testId={evidenceTestId} />
        )}
      </div>
      <p className="text-sm text-charcoal-500 font-poppins">
        {statusLabel ? `${statusLabel}: ` : ''}
        {copy}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Move result section cards with unchanged bodies**

Create `client/src/pages/fund-model-results/result-section-cards.tsx`.

Move these existing function declarations from
`client/src/pages/fund-model-results.tsx` into the new file without editing
their JSX bodies:

- `OverviewCard`
- `WaterfallSetupCard`
- `EconomicsResultsCard`
- `EconomicsCashflowChart`
- `EconomicsJCurveChart`
- `EconomicsCarryTable`
- `FactTile`

Use this import header:

```tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';
import type { EconomicsResultV1 } from '@shared/contracts/economics-v1.contract';
import {
  capitalize,
  formatCompactMoney,
  formatMultiple,
  formatNullablePercent,
  percent,
  percentPoints,
} from './formatters';
```

Export exactly these symbols:

```typescript
export { FactTile, OverviewCard, WaterfallSetupCard, EconomicsResultsCard };
```

- [ ] **Step 3: Move scenario section with unchanged bodies**

Create `client/src/pages/fund-model-results/scenario-section.tsx`.

Move these existing function declarations from the page into the new file
without editing their JSX bodies:

- `ScenarioComparisonPanel`
- `ScenarioAnalysisCard`

Use this import header:

```tsx
import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  CrossSetScenarioComparisonTable,
  isComparableEconomicsComparison,
  ScenarioComparisonTable,
  ScenarioSetsSummary,
} from '@/components/fund-results';
import type { ScenariosSectionPayloadV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import type { ScenarioComparisonState } from './types';
```

Export exactly:

```typescript
export { ScenarioAnalysisCard, ScenarioComparisonPanel };
```

- [ ] **Step 4: Move lifecycle cards with unchanged bodies**

Create `client/src/pages/fund-model-results/lifecycle-cards.tsx`.

Move these existing function declarations from the page into the new file
without editing their JSX bodies:

- `renderRunSummary`
- `ConfigDiffBanner`
- `PublishHistoryCard`
- `PublishComparisonCard`
- `RecalcButton`
- `LifecycleStatusCard`

Use this import header:

```tsx
import { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { PublishedVersionSummary } from '@shared/contracts/fund-results-comparison-v1.contract';
import { getLifecycleDiagnostic } from './evidence';
import { FactTile } from './result-section-cards';
import {
  diagnosticAlertClasses,
  formatComparisonDelta,
  formatComparisonMetricValue,
  formatDateOrFallback,
  formatDriftCapabilityReason,
  formatHistoryRunStatus,
  formatLifecycleStatus,
  hasStaleEvidence,
  historyBadgeClasses,
} from './formatters';
import type { LifecycleHistoryState, RecalculateState } from './types';
```

Export exactly:

```typescript
export {
  ConfigDiffBanner,
  LifecycleStatusCard,
  PublishComparisonCard,
  PublishHistoryCard,
};
```

- [ ] **Step 5: Replace page-local component definitions with imports**

Modify `client/src/pages/fund-model-results.tsx` imports:

```typescript
import {
  ConfigDiffBanner,
  LifecycleStatusCard,
  PublishComparisonCard,
  PublishHistoryCard,
} from './fund-model-results/lifecycle-cards';
import {
  EconomicsResultsCard,
  OverviewCard,
  WaterfallSetupCard,
} from './fund-model-results/result-section-cards';
import { ScenarioAnalysisCard } from './fund-model-results/scenario-section';
import { SectionRenderer } from './fund-model-results/SectionRenderer';
```

Then remove the moved local declarations from the page, and prune any formatter
imports added in Task 2 Step 6 that the route shell no longer references after
this move. Stale imports will fight the lint auto-fix hook and fail the
pre-commit lint on this task's commit; confirm with `npm run lint` before
committing.

- [ ] **Step 6: Run section and page tests**

Run:

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results.test.tsx tests/unit/components/results/EvidenceHeader.test.tsx tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx
```

Expected:

- PASS for all listed tests.
- No copy changes in snapshot-free assertions unless the existing tests prove
  the change.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add client/src/pages/fund-model-results.tsx client/src/pages/fund-model-results/SectionRenderer.tsx client/src/pages/fund-model-results/result-section-cards.tsx client/src/pages/fund-model-results/scenario-section.tsx client/src/pages/fund-model-results/lifecycle-cards.tsx
git commit -m "refactor: split fund results presentation from route shell" -m "The route shell should compose server-backed results, while section cards own their rendering details. This keeps evidence and section copy reviewable without changing contracts." -m "Constraint: Preserve rendered copy, evidence test ids, scenario comparison rendering, and lifecycle card semantics." -m "Confidence: medium" -m "Scope-risk: moderate" -m "Tested: npx vitest client fund-model-results page plus evidence and fund-results component tests" -m "Not-tested: Full client suite"
```

Expected:

- Commit succeeds.

---

### Task 5: Extract Fetching, Polling, Scenario Comparison, And Recalculate Hooks Last

**Files:**

- Create: `client/src/pages/fund-model-results/results-hooks.ts`
- Modify: `client/src/pages/fund-model-results.tsx`
- Test: `tests/unit/pages/fund-model-results.test.tsx`
- Test: `tests/integration/fund-results-comparison-route.test.ts`
- Test: `tests/unit/contract/fund-results-route.test.ts`
- Test: `tests/unit/contract/fund-results-comparison.test.ts`

**Interfaces:**

- Consumes:
  - `FetchState`, `FetchOptions`, `LifecycleHistoryState`,
    `LifecyclePollingKey`, `LifecycleStatus`, `RecalculateState`,
    `ResultsComparisonState`, `ScenarioComparisonBatchResult`,
    `ScenarioComparisonState`
  - `apiRequest`, `queryClient`
  - `FundScenarioComparisonV1Schema`
- Produces:
  - `isActiveCalculationStatus(status: LifecycleStatus): boolean`
  - `isTerminalCalculationStatus(status: LifecycleStatus): boolean`
  - `useFundResults(fundId: string | null)`
  - `useFundLifecycleHistory(fundId: string | null)`
  - `useFundResultsComparison(fundId: string | null)`
  - `useFundScenarioComparisons(fundId: string | null, scenarioSetIds: readonly string[])`
  - `scenarioSetIdsFromFetchState(fetchState: FetchState): string[]`
  - `useRecalculatePublished(fundId: string | null, onSuccess: () => void)`

- [ ] **Step 1: Create hooks module by moving hook code unchanged**

Create `client/src/pages/fund-model-results/results-hooks.ts` with this import
header:

```typescript
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  FundScenarioComparisonV1Schema,
  type FundScenarioComparisonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type { FundLifecycleHistoryV1 } from '@shared/contracts/fund-lifecycle-history-v1.contract';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type {
  FetchOptions,
  FetchState,
  LifecycleHistoryState,
  LifecyclePollingKey,
  LifecycleStatus,
  RecalculateState,
  ResultsComparisonState,
  ScenarioComparisonBatchResult,
  ScenarioComparisonState,
} from './types';
```

Move these existing declarations from `client/src/pages/fund-model-results.tsx`
into `results-hooks.ts` without editing behavior:

- `RESULTS_BACKOFF_MS`
- `isActiveCalculationStatus`
- `isTerminalCalculationStatus`
- `useFundResults`
- `useFundLifecycleHistory`
- `useFundResultsComparison`
- `ScenarioComparisonFetchRequest`
- `FUND_ID_PATH_SEGMENT_PATTERN`
- `SCENARIO_SET_ID_PATH_SEGMENT_PATTERN`
- `SCENARIO_COMPARISON_API_ROOT`
- `scenarioComparisonIdsFromKey`
- `isSafeScenarioComparisonRequest`
- `createScenarioComparisonFetchRequest`
- `scenarioComparisonQueryKey`
- `scenarioComparisonQueryPrefix`
- `scenarioComparisonApiPath`
- `fetchScenarioComparisonForSet`
- `fetchScenarioComparisonBatch`
- `scenarioComparisonErrorMessage`
- `clearScenarioComparisonAbort`
- `useFundScenarioComparisons`
- `scenarioSetIdsFromFetchState`
- `useRecalculatePublished`

Export only:

```typescript
export {
  isActiveCalculationStatus,
  isTerminalCalculationStatus,
  scenarioSetIdsFromFetchState,
  useFundLifecycleHistory,
  useFundResults,
  useFundResultsComparison,
  useFundScenarioComparisons,
  useRecalculatePublished,
};
```

- [ ] **Step 2: Replace page-local hook declarations with imports**

Modify `client/src/pages/fund-model-results.tsx`:

```typescript
import {
  isActiveCalculationStatus,
  isTerminalCalculationStatus,
  scenarioSetIdsFromFetchState,
  useFundLifecycleHistory,
  useFundResults,
  useFundResultsComparison,
  useFundScenarioComparisons,
  useRecalculatePublished,
} from './fund-model-results/results-hooks';
```

Remove the moved hook and scenario-comparison helper declarations from the page.

- [ ] **Step 3: Check that the route shell is now only composition**

Run:

```powershell
(Get-Content -LiteralPath 'client/src/pages/fund-model-results.tsx').Count
rg -n "function useFundResults|function useFundScenarioComparisons|function scenarioComparisonApiPath|function evidenceFromLifecycle|function SectionRenderer|function PublishComparisonCard" client/src/pages/fund-model-results.tsx
```

Expected:

- Line count is substantially lower than the baseline recorded in Task 1.
- `rg` finds no moved helper/hook/component function declarations in
  `client/src/pages/fund-model-results.tsx`.
- The page still exports `FundModelResultsPage` as default.

- [ ] **Step 4: Run focused behavior and contract tests**

Run:

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results.test.tsx tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server --project=client tests/integration/fund-results-comparison-route.test.ts tests/unit/contract/fund-results-route.test.ts tests/unit/contract/fund-results-comparison.test.ts
```

Expected:

- PASS for page/helper tests.
- PASS for fund results route and comparison contract tests.

- [ ] **Step 5: Commit Task 5**

Run:

```powershell
git add client/src/pages/fund-model-results.tsx client/src/pages/fund-model-results/results-hooks.ts
git commit -m "refactor: move fund results polling hooks behind route shell" -m "Fetching and polling are now isolated after pure helpers and presentation were already extracted, reducing risk around the active calculation and comparison refresh behavior." -m "Constraint: Preserve polling backoff, abort behavior, comparison parsing, query keys, and recalculation refresh fan-out." -m "Confidence: medium" -m "Scope-risk: moderate" -m "Tested: npx vitest client fund-model-results tests plus fund-results route and comparison contracts" -m "Not-tested: Full release gate"
```

Expected:

- Commit succeeds.

---

### Task 6: Final Verification, Review Diff, And Report Residual Risk

**Files:**

- Verify: `client/src/pages/fund-model-results.tsx`
- Verify: `client/src/pages/fund-model-results/*.ts`
- Verify: `client/src/pages/fund-model-results/*.tsx`
- Verify: `tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx`

**Interfaces:**

- Consumes: all previous task outputs.
- Produces: final proof that the refactor preserved behavior and left the route
  shell smaller and reviewable.

- [ ] **Step 1: Run the full focused fund-results verification set**

Run:

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-model-results.test.tsx tests/unit/pages/fund-model-results/evidence-and-formatters.test.tsx tests/unit/components/results/EvidenceHeader.test.tsx tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server --project=client tests/integration/wizard-to-results-e2e.test.ts tests/integration/fund-results-comparison-route.test.ts tests/unit/contract/fund-results-route.test.ts tests/unit/contract/fund-results-comparison.test.ts
```

Expected:

- PASS for every listed test file.

- [ ] **Step 2: Run static gates**

Run:

```powershell
npm run lint
npm run check
```

Expected:

- `npm run lint` exits 0.
- `npm run check` exits 0.

- [ ] **Step 3: Review diff boundaries**

Run:

```powershell
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD -- client/src/pages/fund-model-results.tsx
```

Expected:

- Diff touches only the planned fund-model-results files and the helper test.
- No API, schema, migration, LP-reporting, allocation, variance, package script,
  or generated file changes.
- The route shell still renders:
  - fund identity header
  - `ConfigDiffBanner`
  - `LifecycleStatusCard`
  - `PublishHistoryCard`
  - `PublishComparisonCard`
  - `QuarterlyReviewTrace`
  - all six `SectionRenderer` sections

- [ ] **Step 4: Commit final verification note if needed**

If Task 6 required test-only or import-order fixes, commit them:

```powershell
git add client/src/pages/fund-model-results.tsx client/src/pages/fund-model-results tests/unit/pages/fund-model-results
git commit -m "test: lock fund results refactor boundaries" -m "Focused tests and import cleanup document the new module boundaries after the mechanical route split." -m "Constraint: Test-only or import-only changes after behavior-preserving extraction." -m "Confidence: medium" -m "Scope-risk: narrow" -m "Tested: focused fund-results verification set, npm run lint, npm run check" -m "Not-tested: npm run release:check"
```

Expected:

- Commit succeeds only if there is a real final diff.
- If no final diff exists, do not create an empty commit.

- [ ] **Step 5: Open the integration PR**

Run:

```powershell
git push -u origin feat/fund-model-results-refactor
gh pr create --title "refactor(client): decompose fund model results route shell" --body "Behavior-preserving decomposition of client/src/pages/fund-model-results.tsx per docs/superpowers/plans/2026-07-04-fund-model-results-refactor.md. No URL, payload, schema, or dependency changes."
gh pr merge --squash --auto
```

Expected:

- Direct push to `main` is rejected by branch protection; integration is PR plus
  squash auto-merge.
- The PR waits for the full CI run (roughly 7-10 minutes); the ~1 minute
  docs-only gate is not acceptable evidence.

- [ ] **Step 6: Final report**

Report:

- Changed files.
- Simplifications made.
- Focused test commands and pass/fail results.
- `npm run lint` and `npm run check` results.
- PR URL and the full CI run ID (the ~7-10 minute run, never the ~1 minute
  docs-only gate).
- Remaining risks:
  - `npm run release:check` not required unless this refactor is bundled with
    release proof.
  - No browser screenshot required unless visual layout changes are made.
  - LP metric-run, allocations, variance, quarantine, and schema lanes are
    intentionally out of scope.

---

## Self-Review

Spec coverage:

- Fresh current-main gate: Task 1, including positive-lane evidence from the
  recovery PRD and open GitHub issues, not just retirement of the old queue.
- Branch isolation and PR integration: Task 1 Step 1 and Task 6 Step 5.
- Behavior-preserving refactor only: Global Constraints and every task.
- First lane proof gates strengthened: Tasks 1, 2, 5, and 6.
- Hooks/polling/recalculate last: Task 5.
- Exact tests and static gates: Tasks 1 through 6.
- No broad architecture sweep: Scope Check.

Placeholder scan:

- Placeholder marker scan passed.
- No unspecified edge-case work.
- Every task has exact files and exact commands.

Type consistency:

- `SectionLike` is defined in Task 2 and consumed by `evidence.ts` and
  `SectionRenderer.tsx`.
- `LifecycleStatus` is defined in Task 2 and consumed by `formatters.ts`,
  `results-hooks.ts`, and the route shell.
- `ScenarioComparisonState` is defined in Task 2 and consumed by
  `scenario-section.tsx` and `results-hooks.ts`.

Execution recommendation:

- Proceed only if Task 1 confirms the refactor-only lane is still valid after
  fresh current-main intake.
- If Task 1 fails that gate, stop and create a separate plan for the newly
  selected lane.
