---
status: PROPOSED
last_updated: 2026-03-18
---

# ESLint Client Type Safety Plan

## Snapshot

Current client-heavy clusters on 2026-03-18:

- `client/src/components`: 402 warnings
- `client/src/lib`: 227 warnings
- `client/src/hooks`: 209 warnings
- `client/src/pages`: 142 warnings
- `client/src/core`: 58 warnings
- `client/src/utils`: 47 warnings

Top current files:

- `client/src/components/ui/recharts-bundle.tsx`: 42
- `client/src/lib/predictive-cache.ts`: 29
- `client/src/components/modeling-wizard/ModelingWizard.tsx`: 27
- `client/src/hooks/useCohortAnalysis.ts`: 25
- `client/src/pages/forecasting.tsx`: 25
- `client/src/lib/reserves-v11.ts`: 24
- `client/src/lib/path-utils.ts`: 23
- `client/src/core/reserves/adapter/toEngineGraduationRates.ts`: 22

Top rule families:

- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unsafe-return`

## Root Causes

### 1. Chart wrapper typing gaps

Patterns:

- generic chart data passed through untyped helpers
- wrapper components around Recharts expose `any`
- formatter and tooltip payloads not normalized

### 2. Wizard and forecasting state leakage

Patterns:

- machine context and route loader data treated as loose objects
- mutation results and server responses passed through without narrowing
- repeated local casts instead of typed view models

### 3. Reserve and modeling helper ambiguity

Patterns:

- shared reserve math adapters use index access without guards
- map-like objects and external schemas treated as structurally complete
- client and shared reserve helpers duplicate the same typing problems

### 4. Hook return-shape inconsistency

Patterns:

- hooks return partially typed objects
- `fetch().json()` results used directly in state setters
- async helper functions return inferred `any`

## Phase 1: Chart and Dashboard Adapter Cleanup

Target files:

- `client/src/components/ui/recharts-bundle.tsx`
- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/components/reports/reports.tsx`
- `client/src/components/performance/PerformanceDashboard.tsx`

Tasks:

- introduce typed chart datum interfaces
- type tooltip, legend, and formatter callbacks explicitly
- centralize Recharts wrapper prop types instead of repeating local casts

Expected payoff:

- high warning reduction in one concentrated adapter layer

## Phase 2: Wizard and Forecasting Cluster

Target files:

- `client/src/components/modeling-wizard/ModelingWizard.tsx`
- `client/src/hooks/useModelingWizard.ts`
- `client/src/machines/modeling-wizard.machine.ts`
- `client/src/pages/forecasting.tsx`
- related forecasting components consuming the same state

Tasks:

- define typed API response models for wizard and forecasting data
- make machine context and events explicit
- replace loose mutation payloads with typed wrappers
- remove `any` from wizard helper utilities first, then component call sites

Expected payoff:

- large reduction across components, hooks, and pages at once

## Phase 3: Reserve Math and Shared Client Helpers

Target files:

- `client/src/lib/reserves-v11.ts`
- `shared/lib/reserves-v11.ts`
- `client/src/core/reserves/adapter/toEngineGraduationRates.ts`
- `client/src/core/reserves/computeReservesFromGraduation.ts`
- `client/src/lib/path-utils.ts`

Tasks:

- introduce small type guards for schema-like input objects
- replace repeated index access with typed helper functions
- normalize return types for reserve adapters shared between client and shared
  code

Expected payoff:

- cuts repeated `no-unsafe-member-access` and `no-explicit-any` warnings in
  reserve paths

## Phase 4: Hook Boundary Cleanup

Target files:

- `client/src/hooks/useCohortAnalysis.ts`
- `client/src/hooks/useAgentStream.ts`
- `client/src/hooks/use-liquidity.ts`
- `client/src/lib/predictive-cache.ts`
- `client/src/utils/async-iteration.ts`

Tasks:

- parse `response.json()` into explicit interfaces
- type stream events and message envelopes
- normalize helper return values away from implicit `any`

Expected payoff:

- removes a large share of `no-unsafe-return`, `no-unsafe-argument`, and
  assignment warnings

## Implementation Rules

- Fix the adapter first, then the call sites.
- Use `unknown` plus guards instead of `any`.
- Prefer small reusable interfaces over deep local casts.
- Update shared helpers and client consumers together where the same unsafe
  pattern exists in both paths.

## Verification

Recommended commands per phase:

- `npx eslint client/src/components/ui/recharts-bundle.tsx client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `npx eslint client/src/components/modeling-wizard/ModelingWizard.tsx client/src/hooks/useModelingWizard.ts client/src/pages/forecasting.tsx`
- `npx eslint client/src/lib/reserves-v11.ts shared/lib/reserves-v11.ts client/src/core/reserves/adapter/toEngineGraduationRates.ts`
- `npx eslint client/src/hooks/useCohortAnalysis.ts client/src/hooks/useAgentStream.ts client/src/lib/predictive-cache.ts`

## Done Definition

- chart wrappers expose typed props and callbacks
- hooks no longer push parsed JSON directly into state without narrowing
- reserve-related helper layers use typed adapters instead of repeated index
  access
- client warning count falls materially without using broad suppressions
