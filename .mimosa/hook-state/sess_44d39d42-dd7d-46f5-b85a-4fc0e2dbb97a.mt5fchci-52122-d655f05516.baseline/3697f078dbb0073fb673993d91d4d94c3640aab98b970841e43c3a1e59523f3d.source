import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { ReserveIcDecisionRecordV1 } from '@shared/contracts/reserve-ic-decision-v1.contract';
import type { AllocationsResponse, AllocationScenarioDetail } from './types';

type PacketSourceKind = 'draft' | 'authoritative' | 'summary-only' | 'unavailable';

export interface ReserveIcPacketSource {
  source: 'live_allocations' | 'scenario' | 'published_results' | 'results_comparison';
  kind: PacketSourceKind;
  asOf: string | null;
  note: string;
}

export interface ReserveIcPacketCompanyRow {
  companyId: number;
  companyName: string;
  livePlannedReservesCents: number | null;
  scenarioPlannedReservesCents: number;
  deltaPlannedReservesCents: number | null;
  liveAllocationVersion: number | null;
  rationale: string | null;
  decisionRationale: string | null;
  recordedDecisionType: ReserveIcDecisionRecordV1['decisionType'] | null;
  recordedDecisionStatus: ReserveIcDecisionRecordV1['decisionStatus'] | null;
}

export interface ReserveIcPacketPublishedReserveSummary {
  status: 'available' | 'unavailable';
  totalAllocation: number | null;
  reserveRatio: number | null;
  avgConfidence: number | null;
  calculatedAt: string | null;
  note: string;
}

export interface ReserveIcPacketComparisonSummary {
  comparisonStatus: FundResultsComparisonV1['comparisonStatus'] | 'unavailable';
  metricDeltas: Array<{
    metric: string;
    displayName: string;
    absoluteDelta: number | null;
    percentageDelta: number | null;
  }>;
}

export interface ReserveIcPacket {
  fundId: number;
  scenarioId: string;
  packetCreatedAt: string;
  sources: ReserveIcPacketSource[];
  companyRows: ReserveIcPacketCompanyRow[];
  publishedReserve: ReserveIcPacketPublishedReserveSummary;
  comparison: ReserveIcPacketComparisonSummary;
}

export interface BuildReserveIcPacketInput {
  liveAllocations: AllocationsResponse;
  scenario: AllocationScenarioDetail;
  publishedResults: FundResultsReadV1 | null;
  comparison: FundResultsComparisonV1 | null;
  decisions?: ReserveIcDecisionRecordV1[];
  packetCreatedAt?: string;
}

function buildPublishedReserveSummary(
  publishedResults: FundResultsReadV1 | null
): ReserveIcPacketPublishedReserveSummary {
  const reserveSection = publishedResults?.sections.reserve;
  if (!reserveSection || reserveSection.status !== 'available') {
    return {
      status: 'unavailable',
      totalAllocation: null,
      reserveRatio: null,
      avgConfidence: null,
      calculatedAt: null,
      note:
        reserveSection?.reason ??
        'Published reserve evidence is unavailable for this fund/version.',
    };
  }

  return {
    status: 'available',
    totalAllocation: reserveSection.payload.totalAllocation,
    reserveRatio: reserveSection.payload.reserveRatio,
    avgConfidence: reserveSection.payload.avgConfidence,
    calculatedAt: reserveSection.calculatedAt,
    note:
      'Published reserve evidence is summary-level only; the current results contract does not expose stable company identifiers for line-by-line packet joins.',
  };
}

function buildComparisonSummary(
  comparison: FundResultsComparisonV1 | null
): ReserveIcPacketComparisonSummary {
  if (!comparison) {
    return {
      comparisonStatus: 'unavailable',
      metricDeltas: [],
    };
  }

  return {
    comparisonStatus: comparison.comparisonStatus,
    metricDeltas: comparison.metricDeltas.map((delta) => ({
      metric: delta.metric,
      displayName: delta.displayName,
      absoluteDelta: delta.absoluteDelta,
      percentageDelta: delta.percentageDelta,
    })),
  };
}

export function buildReserveIcPacket({
  liveAllocations,
  scenario,
  publishedResults,
  comparison,
  decisions = [],
  packetCreatedAt = new Date().toISOString(),
}: BuildReserveIcPacketInput): ReserveIcPacket {
  const liveByCompanyId = new Map(
    liveAllocations.companies.map((company) => [company.company_id, company])
  );
  const decisionByCompanyId = new Map(decisions.map((decision) => [decision.companyId, decision]));

  const publishedReserve = buildPublishedReserveSummary(publishedResults);

  const sources: ReserveIcPacketSource[] = [
    {
      source: 'live_allocations',
      kind: 'authoritative',
      asOf: liveAllocations.metadata.last_updated_at,
      note: 'Live reserve-planning workspace remains the authoritative draft surface.',
    },
    {
      source: 'scenario',
      kind: 'draft',
      asOf: scenario.updated_at,
      note: 'Saved allocation scenario draft with collaboration context and apply/sync history.',
    },
    {
      source: 'published_results',
      kind: publishedReserve.status === 'available' ? 'summary-only' : 'unavailable',
      asOf: publishedReserve.calculatedAt,
      note: publishedReserve.note,
    },
    {
      source: 'results_comparison',
      kind: comparison ? 'summary-only' : 'unavailable',
      asOf: comparison?.currentVersion?.publishedAt ?? null,
      note:
        comparison === null
          ? 'Publish comparison evidence is unavailable.'
          : 'Results comparison remains narrow, publish-to-publish supporting evidence only.',
    },
  ];

  const companyRows = scenario.snapshot_items.map((item) => {
    const live = liveByCompanyId.get(item.company_id) ?? null;
    const decision = decisionByCompanyId.get(item.company_id) ?? null;

    return {
      companyId: item.company_id,
      companyName: live?.company_name ?? `Company ${item.company_id}`,
      livePlannedReservesCents: live?.planned_reserves_cents ?? null,
      scenarioPlannedReservesCents: item.planned_reserves_cents,
      deltaPlannedReservesCents:
        live?.planned_reserves_cents != null
          ? item.planned_reserves_cents - live.planned_reserves_cents
          : null,
      liveAllocationVersion: live?.allocation_version ?? null,
      rationale: item.allocation_reason,
      decisionRationale: decision?.rationale ?? null,
      recordedDecisionType: decision?.decisionType ?? null,
      recordedDecisionStatus: decision?.decisionStatus ?? null,
    };
  });

  return {
    fundId: scenario.fund_id,
    scenarioId: scenario.id,
    packetCreatedAt,
    sources,
    companyRows,
    publishedReserve,
    comparison: buildComparisonSummary(comparison),
  };
}
