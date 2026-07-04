/**
 * Shared local state types for the fund model results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/types
 */

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
  | { kind: 'error'; message: string; comparison: FundResultsComparisonV1 | null }
  | { kind: 'data'; comparison: FundResultsComparisonV1 };

export interface ScenarioComparisonBatchResult {
  comparisons: FundScenarioComparisonV1[];
  failedScenarioSetIds: string[];
}

export type ScenarioComparisonState =
  | { kind: 'idle'; comparisons: FundScenarioComparisonV1[]; failedScenarioSetIds: string[] }
  | { kind: 'loading'; comparisons: FundScenarioComparisonV1[]; failedScenarioSetIds: string[] }
  | {
      kind: 'error';
      message: string;
      comparisons: FundScenarioComparisonV1[];
      failedScenarioSetIds: string[];
    }
  | { kind: 'data'; comparisons: FundScenarioComparisonV1[]; failedScenarioSetIds: string[] };

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

// Accept the Zod-inferred union types: each section is a discriminated union
// of available/unavailable/pending/failed variants with different shapes
export interface SectionLike {
  status: string;
  reason?: string | undefined;
  reasonCode?: string | undefined;
  payload?: unknown | undefined;
  legacyEvidence?: boolean | undefined;
  [key: string]: unknown;
}
