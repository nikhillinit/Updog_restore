import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import type {
  AnalysisDraftV1,
  AnalysisPeriod,
  AnalysisReferenceV1,
} from '@shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import {
  InternalLpEconomicsRunReceiptV1Schema,
  type InternalLpEconomicsRunReceiptV1,
} from '@shared/contracts/internal-economics/lp-economics-run-receipt-v1.contract';
import { apiRequest } from '@/lib/queryClient';

export type InternalEconomicsPinSourceKind = 'draft' | 'reference';

export interface InternalEconomicsPin {
  sourceKind: InternalEconomicsPinSourceKind;
  sourceId: number;
  runId: number;
  period: AnalysisPeriod;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  knowledgeCutoff: string;
  analysisFactsSnapshotId: number;
  mixedBasisAtSave: boolean;
}

export interface InternalEconomicsCandidateGroup {
  runId: number;
  pins: InternalEconomicsPin[];
  primaryPin: InternalEconomicsPin;
}

export interface InternalEconomicsSelection {
  baselineRunId: number | null;
  currentRunId: number | null;
}

export type InternalEconomicsSelectionSlot = 'baseline' | 'current';
export type InternalEconomicsSlot =
  | { state: 'empty'; runId: null; receipt: null; error: null }
  | { state: 'pending'; runId: number; receipt: null; error: null }
  | { state: 'ready'; runId: number; receipt: InternalLpEconomicsRunReceiptV1; error: null }
  | { state: 'error'; runId: number; receipt: null; error: Error };

export type InternalEconomicsReceiptSlot = InternalEconomicsSlot;

export interface InternalEconomicsResult {
  baseline: InternalEconomicsSlot;
  current: InternalEconomicsSlot;
}

export const internalEconomicsReceiptQueryKey = (fundId: number, runId: number) =>
  ['internal-economics', 'receipt', fundId, runId] as const;

function compareDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

export function compareInternalEconomicsPins(
  left: InternalEconomicsPin,
  right: InternalEconomicsPin
): number {
  return (
    compareDescending(left.period.periodEnd, right.period.periodEnd) ||
    compareDescending(left.period.periodStart, right.period.periodStart) ||
    (left.sourceKind === right.sourceKind ? 0 : left.sourceKind === 'draft' ? -1 : 1) ||
    compareDescending(left.createdAt, right.createdAt) ||
    right.sourceId - left.sourceId
  );
}

export function projectInternalEconomicsPins(
  drafts: readonly AnalysisDraftV1[],
  references: readonly AnalysisReferenceV1[]
): InternalEconomicsPin[] {
  const draftPins = drafts.flatMap((draft): InternalEconomicsPin[] => {
    const runId = draft.basis.economicsReferenceId;
    if (draft.savedAt !== null || runId === null) return [];

    return [
      {
        sourceKind: 'draft',
        sourceId: draft.draftId,
        runId,
        period: draft.period,
        periodStart: draft.period.periodStart,
        periodEnd: draft.period.periodEnd,
        createdAt: draft.createdAt,
        knowledgeCutoff: draft.basis.knowledgeCutoff,
        analysisFactsSnapshotId: draft.basis.financialFactsSnapshotId,
        mixedBasisAtSave: false,
      },
    ];
  });
  const referencePins = references.flatMap((reference): InternalEconomicsPin[] => {
    const runId = reference.basis.economicsReferenceId;
    if (runId === null) return [];

    return [
      {
        sourceKind: 'reference',
        sourceId: reference.referenceId,
        runId,
        period: reference.period,
        periodStart: reference.period.periodStart,
        periodEnd: reference.period.periodEnd,
        createdAt: reference.createdAt,
        knowledgeCutoff: reference.basis.knowledgeCutoff,
        analysisFactsSnapshotId: reference.basis.financialFactsSnapshotId,
        mixedBasisAtSave: reference.mixedBasisAtSave,
      },
    ];
  });

  return [...draftPins, ...referencePins].sort(compareInternalEconomicsPins);
}

export function groupInternalEconomicsPins(
  pins: readonly InternalEconomicsPin[]
): InternalEconomicsCandidateGroup[] {
  const pinsByRun = new Map<number, InternalEconomicsPin[]>();
  for (const pin of pins) {
    const groupPins = pinsByRun.get(pin.runId) ?? [];
    groupPins.push(pin);
    pinsByRun.set(pin.runId, groupPins);
  }

  return Array.from(pinsByRun, ([runId, unsortedPins]) => {
    const sortedPins = [...unsortedPins].sort(compareInternalEconomicsPins);
    const primaryPin = sortedPins[0];
    if (!primaryPin) throw new Error(`Economics run ${runId} has no analysis pins.`);
    return { runId, pins: sortedPins, primaryPin };
  }).sort(
    (left, right) =>
      compareInternalEconomicsPins(left.primaryPin, right.primaryPin) || right.runId - left.runId
  );
}

export function defaultInternalEconomicsSelection(
  groups: readonly InternalEconomicsCandidateGroup[]
): InternalEconomicsSelection {
  const current = groups[0];
  if (!current) return { baselineRunId: null, currentRunId: null };

  const baseline =
    groups.slice(1).find((group) => {
      const candidatePeriod = group.primaryPin.period;
      const currentPeriod = current.primaryPin.period;
      return (
        candidatePeriod.periodEnd < currentPeriod.periodEnd ||
        (candidatePeriod.periodEnd === currentPeriod.periodEnd &&
          candidatePeriod.periodStart < currentPeriod.periodStart)
      );
    }) ?? groups[1];

  return {
    baselineRunId: baseline?.runId ?? null,
    currentRunId: current.runId,
  };
}

export function selectInternalEconomicsRun(
  selection: InternalEconomicsSelection,
  slot: InternalEconomicsSelectionSlot,
  runId: number | null
): InternalEconomicsSelection {
  if (slot === 'baseline') {
    if (runId !== null && runId === selection.currentRunId) {
      return { baselineRunId: runId, currentRunId: selection.baselineRunId };
    }
    return { ...selection, baselineRunId: runId };
  }

  if (runId !== null && runId === selection.baselineRunId) {
    return { baselineRunId: selection.currentRunId, currentRunId: runId };
  }
  return { ...selection, currentRunId: runId };
}

function toReceiptSlot(
  runId: number | null,
  query: UseQueryResult<InternalLpEconomicsRunReceiptV1, Error> | undefined
): InternalEconomicsSlot {
  if (runId === null) return { state: 'empty', runId: null, receipt: null, error: null };
  if (query?.data) return { state: 'ready', runId, receipt: query.data, error: null };
  if (query?.error) return { state: 'error', runId, receipt: null, error: query.error };
  return { state: 'pending', runId, receipt: null, error: null };
}

export function useInternalEconomics(
  fundId: number | undefined,
  selectedRunIds: readonly [number | null, number | null]
): InternalEconomicsResult {
  const isValidFundId = fundId !== undefined && Number.isSafeInteger(fundId) && fundId > 0;
  const uniqueRunIds = Array.from(
    new Set(
      selectedRunIds.filter(
        (runId): runId is number =>
          runId !== null && Number.isSafeInteger(runId) && runId > 0
      )
    )
  ).slice(0, 2);

  const queries = useQueries({
    queries: uniqueRunIds.map((runId) => ({
      queryKey: internalEconomicsReceiptQueryKey(fundId ?? 0, runId),
      enabled: isValidFundId,
      queryFn: async () => {
        const rawReceipt = await apiRequest<unknown>(
          'GET',
          `/api/funds/${fundId}/internal-economics/runs/${runId}`
        );
        const receipt = InternalLpEconomicsRunReceiptV1Schema.parse(rawReceipt);
        if (receipt.fundId !== fundId || receipt.runId !== runId) {
          throw new Error('Economics receipt identity does not match the selected fund and run.');
        }
        return receipt;
      },
    })),
  });
  const queryByRunId = new Map(
    uniqueRunIds.map((runId, index) => [
      runId,
      queries[index] as UseQueryResult<InternalLpEconomicsRunReceiptV1, Error>,
    ])
  );

  return {
    baseline: toReceiptSlot(selectedRunIds[0], queryByRunId.get(selectedRunIds[0] ?? -1)),
    current: toReceiptSlot(selectedRunIds[1], queryByRunId.get(selectedRunIds[1] ?? -1)),
  };
}
