import { describe, expect, it } from 'vitest';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { ReserveIcDecisionRecordV1 } from '@shared/contracts/reserve-ic-decision-v1.contract';
import { buildReserveIcPacket } from '../../../../client/src/components/portfolio/tabs/reserve-ic-packet';
import type {
  AllocationScenarioDetail,
  AllocationsResponse,
} from '../../../../client/src/components/portfolio/tabs/types';

const liveAllocations: AllocationsResponse = {
  companies: [
    {
      company_id: 1,
      company_name: 'Atlas Bio',
      sector: 'Bio',
      stage: 'Series A',
      status: 'active',
      invested_amount_cents: 125_000_000,
      deployed_reserves_cents: 25_000_000,
      planned_reserves_cents: 150_000_000,
      allocation_cap_cents: 225_000_000,
      allocation_reason: 'Current live baseline',
      allocation_version: 9,
      last_allocation_at: '2026-04-01T12:00:00.000Z',
    },
    {
      company_id: 2,
      company_name: 'Comet AI',
      sector: 'AI',
      stage: 'Seed',
      status: 'active',
      invested_amount_cents: 50_000_000,
      deployed_reserves_cents: 0,
      planned_reserves_cents: 80_000_000,
      allocation_cap_cents: null,
      allocation_reason: null,
      allocation_version: 9,
      last_allocation_at: '2026-04-01T12:00:00.000Z',
    },
  ],
  metadata: {
    total_planned_cents: 230_000_000,
    total_deployed_cents: 25_000_000,
    companies_count: 2,
    last_updated_at: '2026-04-01T12:00:00.000Z',
  },
};

const scenario: AllocationScenarioDetail = {
  id: '00000000-0000-0000-0000-000000000101',
  fund_id: 7,
  name: 'IC packet candidate',
  notes: 'Discuss at next IC.',
  source_allocation_version: 9,
  company_count: 2,
  total_planned_cents: 260_000_000,
  last_applied_at: null,
  last_applied_by: null,
  last_applied_allocation_version: null,
  last_synced_at: '2026-04-02T08:00:00.000Z',
  last_synced_by: 'system',
  created_at: '2026-04-02T08:00:00.000Z',
  updated_at: '2026-04-05T10:00:00.000Z',
  context: {
    scenario_notes: 'Discuss at next IC.',
    last_sync: null,
    last_apply: null,
  },
  snapshot_items: [
    {
      company_id: 1,
      planned_reserves_cents: 175_000_000,
      allocation_cap_cents: 250_000_000,
      allocation_reason: 'Increase reserve for expected Series B participation.',
    },
    {
      company_id: 2,
      planned_reserves_cents: 85_000_000,
      allocation_cap_cents: null,
      allocation_reason: 'Small hold pending milestone review.',
    },
  ],
};

const publishedResults: FundResultsReadV1 = {
  status: 'ready',
  fundId: 7,
  fund: {
    name: 'Fund Seven',
    vintageYear: 2024,
    size: 50_000_000,
  },
  lifecycle: {
    fundId: 7,
    configState: {
      hasDraft: true,
      hasPublished: true,
      currentDraftVersion: 12,
      publishedVersion: 11,
      publishedAt: '2026-04-02T09:00:00.000Z',
    },
    calculations: {
      reserve: {
        snapshotType: 'RESERVE',
        queueKey: 'reserve-calc',
        authority: 'authoritative',
        syncCapable: true,
        status: 'ready',
        dispatchState: 'dispatched',
        lastCalculatedAt: '2026-04-02T10:00:00.000Z',
        correlationId: 'corr-1',
      },
      pacing: {
        snapshotType: 'PACING',
        queueKey: 'pacing-calc',
        authority: 'authoritative',
        syncCapable: true,
        status: 'ready',
        dispatchState: 'dispatched',
        lastCalculatedAt: '2026-04-02T10:00:00.000Z',
        correlationId: 'corr-2',
      },
      cohort: {
        snapshotType: 'COHORT',
        queueKey: 'cohort-calc',
        authority: 'experimental',
        syncCapable: false,
        status: 'ready',
        dispatchState: 'partial',
        lastCalculatedAt: '2026-04-02T10:00:00.000Z',
        correlationId: 'corr-3',
      },
    },
    legacy: {
      hasLegacyEvidence: false,
      reserveSnapshotWithoutConfigVersion: false,
      pacingSnapshotWithoutConfigVersion: false,
    },
  },
  sections: {
    reserve: {
      status: 'available',
      calculatedAt: '2026-04-02T10:00:00.000Z',
      source: 'fund_snapshots',
      legacyEvidence: false,
      payload: {
        totalAllocation: 240_000_000,
        reserveRatio: 0.48,
        avgConfidence: 0.81,
        allocations: [
          {
            allocation: 175_000_000,
            confidence: 0.86,
            rationale: 'High expected reserve efficiency.',
          },
          {
            allocation: 65_000_000,
            confidence: 0.76,
            rationale: 'Hold a smaller reserve pending milestone completion.',
          },
        ],
      },
    },
    pacing: {
      status: 'available',
      calculatedAt: '2026-04-02T10:00:00.000Z',
      source: 'fund_snapshots',
      legacyEvidence: false,
      payload: {
        deploymentRate: 0.2,
        yearsToFullDeploy: 4,
        totalQuarters: 16,
        marketCondition: 'neutral',
        deployments: [],
      },
    },
    scorecard: {
      status: 'available',
      payload: {
        fundName: { value: 'Fund Seven', source: 'funds' },
        fundSize: { value: 50_000_000, source: 'funds' },
      },
    },
    scenarios: {
      status: 'unavailable',
      reason: 'No authoritative source',
      reasonCode: 'NO_AUTHORITATIVE_SOURCE',
    },
    waterfall: {
      status: 'unavailable',
      reason: 'Not configured',
      reasonCode: 'NO_PUBLISHED_CONFIG',
    },
  },
};

const comparison: FundResultsComparisonV1 = {
  fundId: 7,
  comparisonStatus: 'comparable',
  currentVersion: {
    version: 11,
    publishedAt: '2026-04-02T09:00:00.000Z',
    calcRun: {
      runId: 91,
      status: 'ready',
      dispatchState: 'dispatched',
      lastCalculatedAt: '2026-04-02T10:00:00.000Z',
      correlationId: 'corr-91',
    },
    metrics: {
      fundSize: 50_000_000,
      reserveRatio: 0.48,
      avgConfidence: 0.81,
      yearsToFullDeploy: 4,
    },
  },
  previousVersion: {
    version: 10,
    publishedAt: '2026-03-20T09:00:00.000Z',
    calcRun: {
      runId: 81,
      status: 'ready',
      dispatchState: 'dispatched',
      lastCalculatedAt: '2026-03-20T10:00:00.000Z',
      correlationId: 'corr-81',
    },
    metrics: {
      fundSize: 45_000_000,
      reserveRatio: 0.5,
      avgConfidence: 0.74,
      yearsToFullDeploy: 3.5,
    },
  },
  metricDeltas: [
    {
      metric: 'reserveRatio',
      displayName: 'Reserve Ratio',
      currentValue: 0.48,
      previousValue: 0.5,
      absoluteDelta: -0.02,
      percentageDelta: -4,
      driftCapable: true,
      driftReason: 'stable',
    },
  ],
};

const decisions: ReserveIcDecisionRecordV1[] = [
  {
    id: '00000000-0000-0000-0000-000000000301',
    fundId: 7,
    companyId: 1,
    decisionType: 'follow_on',
    decisionStatus: 'proposed',
    rationale: 'Propose larger reserve due to strong growth trajectory.',
    proposedPlannedReservesCents: 175_000_000,
    finalPlannedReservesCents: null,
    decidedByUserId: null,
    decidedByLabel: null,
    decidedAt: null,
    provenance: {
      sourceScenarioId: scenario.id,
      sourceAllocationVersion: 9,
      liveAllocationVersion: 9,
    },
    createdAt: '2026-04-05T10:00:00.000Z',
    updatedAt: '2026-04-05T10:00:00.000Z',
  },
];

describe('buildReserveIcPacket', () => {
  it('builds company rows from live allocations, scenario overlay, and recorded decisions', () => {
    const packet = buildReserveIcPacket({
      liveAllocations,
      scenario,
      publishedResults,
      comparison,
      decisions,
      packetCreatedAt: '2026-04-06T00:00:00.000Z',
    });

    expect(packet.fundId).toBe(7);
    expect(packet.companyRows).toHaveLength(2);
    expect(packet.companyRows[0]).toMatchObject({
      companyId: 1,
      companyName: 'Atlas Bio',
      livePlannedReservesCents: 150_000_000,
      scenarioPlannedReservesCents: 175_000_000,
      deltaPlannedReservesCents: 25_000_000,
      decisionRationale: 'Propose larger reserve due to strong growth trajectory.',
      recordedDecisionType: 'follow_on',
      recordedDecisionStatus: 'proposed',
    });
  });

  it('keeps published reserve evidence summary-level and source-tagged', () => {
    const packet = buildReserveIcPacket({
      liveAllocations,
      scenario,
      publishedResults,
      comparison,
    });

    expect(packet.publishedReserve).toMatchObject({
      status: 'available',
      totalAllocation: 240_000_000,
      reserveRatio: 0.48,
      avgConfidence: 0.81,
      calculatedAt: '2026-04-02T10:00:00.000Z',
    });
    expect(packet.publishedReserve.note).toMatch(/summary-level only/i);
    expect(packet.sources.find((source) => source.source === 'published_results')).toMatchObject({
      kind: 'summary-only',
    });
  });

  it('preserves comparison evidence as narrow supporting deltas', () => {
    const packet = buildReserveIcPacket({
      liveAllocations,
      scenario,
      publishedResults,
      comparison,
    });

    expect(packet.comparison.comparisonStatus).toBe('comparable');
    expect(packet.comparison.metricDeltas).toEqual([
      {
        metric: 'reserveRatio',
        displayName: 'Reserve Ratio',
        absoluteDelta: -0.02,
        percentageDelta: -4,
      },
    ]);
  });
});
