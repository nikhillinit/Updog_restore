import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentPlanVersionV1 } from '../../../shared/contracts/current-plan-version-v1.contract';
import type { StructuredWarning } from '../../../shared/contracts/provenance-envelope.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  type CalcBasis,
} from '../../../shared/core/calc-substrate/calc-basis';
import { computeResultHash } from '../../../shared/core/calc-substrate/hash-admission';
import {
  buildResult,
  buildValue,
  getLatestConstructionReconciliation,
  reduceState,
  structuredWarningsFromFacts,
  type ConstructionReconciliationActualFact,
} from '../../../server/services/construction-reconciliation-service';

const CONTRACT_VERSION = 'construction-reconciliation/1.0.0';
const ENGINE_VERSION = 'construction-rec-v1';
const METHODOLOGY_VERSION = CONTRACT_VERSION;
const FUND_ID = 1;
const PLAN_ID = 11;
const FACTS_ID = 31;
const AS_OF_DATE = '2026-07-21';

const basis: CalcBasis = {
  contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
  calculationKey: 'construction-reconciliation',
  configuredMode: 'on',
  effectiveMode: 'on',
  killSwitchActive: false,
  engineVersion: ENGINE_VERSION,
  methodologyVersion: METHODOLOGY_VERSION,
  inputHash: 'a'.repeat(64),
  assumptionsHash: 'b'.repeat(64),
};

function makePlan(overrides: Record<string, unknown> = {}): CurrentPlanVersionV1 {
  return {
    contractVersion: 'current-plan-version-v1',
    id: String(PLAN_ID),
    fundId: FUND_ID,
    version: 1,
    sourceConfigId: 2,
    sourceConfigVersion: 1,
    sourceFactsSnapshotId: String(FACTS_ID),
    deployableCapitalUsd: '100.000000',
    planTransformationVersion: 'fund-config-to-current-plan/1.0.0',
    allocations: [
      {
        allocationId: 'seed',
        name: 'Seed',
        stageFocus: 'Seed',
        initialCapitalUsd: '70.000000',
        followOnCapitalUsd: '50.000000',
        avgInitialCheckUsd: '10.000000',
        pacingQuarters: 1,
        followOnStrategy: 'amount',
        followOnParticipationPct: null,
      },
    ],
    pacingAssumptions: {
      contractVersion: 'current-plan-pacing-v1',
      deploymentQuarters: 1,
      quarterlyDeploymentPcts: ['1.000000000000'],
      followOnReservePct: '0.000000000000',
      annualFeeDragPct: '0.000000000000',
    },
    cohortAssumptions: {
      contractVersion: 'current-plan-cohort-v1',
      averageInitialCheckUsd: '10.000000',
      stageDistribution: [{ stage: 'Seed', pct: '1.000000000000' }],
      graduationMatrix: [],
      exitAssumptions: [],
    },
    reservePolicyVersion: 'reserve-policy/1.0.0',
    assumptionsHash: 'b'.repeat(64),
    supersedesVersionId: null,
    supersededByVersionId: null,
    createdAt: '2026-07-21T12:00:00.000Z',
    ...overrides,
  } as CurrentPlanVersionV1;
}

function makeFact(overrides: Record<string, unknown> = {}): ConstructionReconciliationActualFact {
  return {
    fundId: FUND_ID,
    companyId: 101,
    companyName: 'Example Co',
    investmentIds: [],
    activeRoundIds: [],
    approvedPlanningFmvMarkId: null,
    planningFmvStatus: 'none',
    initialInvestmentAmount: '0.000000',
    followOnInvestmentAmount: '0.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: null,
    latestRoundValuation: null,
    latestPlanningFmvDate: null,
    latestPlanningFmvValue: null,
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [],
    warnings: [],
    provenance: { trustState: 'LIVE' },
    inputHash: 'c'.repeat(64),
    ...overrides,
  } as unknown as ConstructionReconciliationActualFact;
}

function makeStoredRow(options: {
  id: number;
  planId?: number;
  factsId?: number;
  snapshotTime?: string;
  createdAt?: string;
  payload?: unknown;
  metadata?: unknown;
  stateHash?: string | null;
  calcVersion?: string;
}) {
  const planId = options.planId ?? PLAN_ID;
  const factsId = options.factsId ?? FACTS_ID;
  const result = buildResult({
    basis,
    plan: makePlan({ id: String(planId), sourceFactsSnapshotId: String(factsId) }),
    facts: [makeFact()],
    asOfDate: AS_OF_DATE,
  });
  if (result.state !== 'available' && result.state !== 'indicative') {
    throw new Error('fixture must produce a persisted result');
  }

  const metadata = {
    idempotencyKey: `construction-key-${options.id}`,
    requestHash: canonicalSha256({
      contractVersion: CONTRACT_VERSION,
      fundId: FUND_ID,
      currentPlanVersionId: planId,
      financialFactsSnapshotId: factsId,
    }),
    currentPlanVersionId: planId,
    financialFactsSnapshotId: factsId,
    requestedFactsSnapshotId: factsId,
    asOfDate: AS_OF_DATE,
    structuredWarnings: [],
  };

  return {
    id: options.id,
    fundId: FUND_ID,
    type: 'CONSTRUCTION_RECONCILIATION',
    payload: options.payload ?? result,
    calcVersion: options.calcVersion ?? ENGINE_VERSION,
    correlationId: `correlation-${options.id}`,
    metadata: options.metadata ?? metadata,
    snapshotTime: new Date(options.snapshotTime ?? '2026-07-22T12:00:00.000Z'),
    eventCount: 0,
    stateHash: options.stateHash === undefined ? result.resultHash : options.stateHash,
    state: null,
    runId: null,
    configId: null,
    configVersion: null,
    scenarioSetId: null,
    h9MoicSourceInputHash: null,
    h9RoundEvidenceInputHash: null,
    h9RoundEvidenceAssumptionsHash: null,
    h9FingerprintHash: null,
    h9PolicyVersion: null,
    h9ActionabilityStatus: null,
    createdAt: new Date(options.createdAt ?? '2026-07-22T12:00:00.000Z'),
  };
}

function latestDatabase(rows: ReturnType<typeof makeStoredRow>[]) {
  const orderBy = vi.fn();
  const sortedRows = [...rows].sort((left, right) => {
    const snapshotDelta = right.snapshotTime.getTime() - left.snapshotTime.getTime();
    if (snapshotDelta !== 0) return snapshotDelta;

    const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;

    return right.id - left.id;
  });
  const chain = {} as {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn((...clauses: unknown[]) => {
    orderBy(...clauses);
    return chain;
  });
  chain.limit = vi.fn(async () => sortedRows.slice(0, 1));

  return {
    database: { select: vi.fn(() => chain) } as never,
    orderBy,
  };
}

function renderOrderClause(clause: unknown): string {
  return new PgDialect().sqlToQuery((clause as SQL<unknown>).getSQL()).sql;
}

describe('construction reconciliation calculation', () => {
  it('discloses 20.000000 over deployable capacity for 100 vs 120', () => {
    const value = buildValue({ plan: makePlan(), facts: [makeFact()], asOfDate: AS_OF_DATE });

    expect(value.deployableCapitalUsd).toBe('100.000000');
    expect(value.plannedTotalUsd).toBe('120.000000');
    expect(value.plannedCapitalOverDeployableUsd).toBe('20.000000');
  });

  it('excludes amount-only non-equity from equity totals while retaining its warning', () => {
    const warning: StructuredWarning = {
      code: 'NON_EQUITY_AMOUNT_ONLY',
      severity: 'warning',
      message: 'Amount-only non-equity activity is excluded from equity totals.',
      source: 'fund-company-actuals',
    };
    const fact = makeFact({
      initialInvestmentAmount: '10.000000',
      followOnInvestmentAmount: '5.000000',
      amountOnlyNonEquityAmount: '90.000000',
      warnings: [warning],
    });

    const value = buildValue({ plan: makePlan(), facts: [fact], asOfDate: AS_OF_DATE });
    const result = buildResult({ basis, plan: makePlan(), facts: [fact], asOfDate: AS_OF_DATE });

    expect(value.actualTotalEquityUsd).toBe('15.000000');
    expect(value.excludedNonEquityUsd).toBe('90.000000');
    expect(structuredWarningsFromFacts([fact])).toEqual([warning]);
    expect(result.reasonCodes).not.toContain('NON_EQUITY_AMOUNT_ONLY');
  });

  it.each([
    { label: 'empty facts', facts: [], state: 'unavailable', reasonCodes: ['INPUT_MISSING'] },
    {
      label: 'unavailable upstream',
      facts: [makeFact({ provenance: { trustState: 'UNAVAILABLE' } })],
      state: 'unavailable',
      reasonCodes: ['UPSTREAM_UNAVAILABLE'],
    },
    {
      label: 'failed upstream',
      facts: [makeFact({ provenance: { trustState: 'FAILED' } })],
      state: 'unavailable',
      reasonCodes: ['UPSTREAM_UNAVAILABLE'],
    },
    {
      label: 'currency mismatch',
      facts: [makeFact({ currencyStatus: 'mismatch_blocked' })],
      state: 'unavailable',
      reasonCodes: ['INPUT_INVALID'],
    },
    {
      label: 'unknown currency',
      facts: [makeFact({ currencyStatus: 'unknown' })],
      state: 'unavailable',
      reasonCodes: ['INPUT_INVALID'],
    },
    {
      label: 'partially trusted source',
      facts: [makeFact({ provenance: { trustState: 'PARTIAL' } })],
      state: 'indicative',
      reasonCodes: ['STALE_SOURCE'],
    },
    {
      label: 'live base-currency source with stale planning FMV',
      facts: [
        makeFact({
          planningFmvStatus: 'stale',
          latestPlanningFmvDate: '2026-01-01',
          latestPlanningFmvValue: '999.000000',
        }),
      ],
      state: 'available',
      reasonCodes: [],
    },
  ] as const)('$label follows first-match reducer rule', ({ facts, state, reasonCodes }) => {
    expect(reduceState(facts)).toEqual({ state, reasonCodes });
  });

  it('returns ENGINE_ERROR for an unexpected calculation failure', () => {
    const result = buildResult({
      basis,
      plan: makePlan({ deployableCapitalUsd: 'not-a-money-value' }),
      facts: [makeFact()],
      asOfDate: AS_OF_DATE,
    });

    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['ENGINE_ERROR']);
  });

  it('does not change result hash when JSONB key order changes', () => {
    const result = buildResult({
      basis,
      plan: makePlan(),
      facts: [makeFact()],
      asOfDate: AS_OF_DATE,
    });
    if (result.state !== 'available') throw new Error('fixture must produce available result');

    const reorderedValue = Object.fromEntries(
      Object.entries(result.value).reverse()
    ) as typeof result.value;

    expect(computeResultHash(result.basis, reorderedValue)).toBe(result.resultHash);
  });
});

describe('latest persisted construction reconciliation', () => {
  it('uses snapshot time, created time, then id descending tie-breaks', async () => {
    const snapshotTime = '2026-07-22T12:00:00.000Z';
    const rows = [
      makeStoredRow({
        id: 101,
        planId: 101,
        snapshotTime,
        createdAt: '2026-07-22T12:00:00.000Z',
      }),
      makeStoredRow({
        id: 102,
        planId: 102,
        snapshotTime,
        createdAt: '2026-07-22T13:00:00.000Z',
      }),
      makeStoredRow({
        id: 103,
        planId: 103,
        snapshotTime,
        createdAt: '2026-07-22T13:00:00.000Z',
      }),
    ];
    const { database, orderBy } = latestDatabase(rows);

    const response = await getLatestConstructionReconciliation(FUND_ID, { database });

    expect(response.state).toBe('persisted');
    if (response.state !== 'persisted') throw new Error('fixture must produce persisted response');
    expect(response.currentPlanVersionId).toBe(103);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(orderBy.mock.calls[0]?.map(renderOrderClause)).toEqual([
      '"fund_snapshots"."snapshot_time" desc',
      '"fund_snapshots"."created_at" desc',
      '"fund_snapshots"."id" desc',
    ]);

    const { database: newerSnapshotDatabase } = latestDatabase([
      makeStoredRow({
        id: 104,
        planId: 104,
        snapshotTime: '2026-07-23T12:00:00.000Z',
        createdAt: '2026-07-20T12:00:00.000Z',
      }),
      makeStoredRow({
        id: 105,
        planId: 105,
        snapshotTime: '2026-07-22T12:00:00.000Z',
        createdAt: '2026-07-23T12:00:00.000Z',
      }),
    ]);
    const newerSnapshotResponse = await getLatestConstructionReconciliation(FUND_ID, {
      database: newerSnapshotDatabase,
    });

    expect(newerSnapshotResponse.state).toBe('persisted');
    if (newerSnapshotResponse.state !== 'persisted') {
      throw new Error('fixture must produce persisted response');
    }
    expect(newerSnapshotResponse.currentPlanVersionId).toBe(104);
  });

  it('serves persisted structured warnings from snapshot metadata', async () => {
    const warning: StructuredWarning = {
      code: 'NON_EQUITY_AMOUNT_ONLY',
      severity: 'warning',
      message: 'Amount-only non-equity activity is excluded from equity totals.',
      source: 'fund-company-actuals',
    };
    const row = makeStoredRow({ id: 301 });
    (row.metadata as { structuredWarnings: StructuredWarning[] }).structuredWarnings = [warning];
    const { database } = latestDatabase([row]);

    const response = await getLatestConstructionReconciliation(FUND_ID, { database });

    expect(response.state).toBe('persisted');
    if (response.state !== 'persisted') throw new Error('fixture must produce persisted response');
    expect(response.structuredWarnings).toEqual([warning]);
  });

  it('returns an explicit empty state when no row is persisted', async () => {
    const { database } = latestDatabase([]);

    await expect(getLatestConstructionReconciliation(FUND_ID, { database })).resolves.toEqual({
      state: 'no_persisted_reconciliation',
    });
  });

  it.each([
    {
      label: 'malformed but valid JSON payload',
      row: () => makeStoredRow({ id: 201, payload: JSON.parse('{"state":"available"}') }),
    },
    {
      label: 'missing metadata field',
      row: () =>
        makeStoredRow({
          id: 202,
          metadata: {
            idempotencyKey: 'missing-as-of-date',
            requestHash: 'a'.repeat(64),
            currentPlanVersionId: PLAN_ID,
            financialFactsSnapshotId: FACTS_ID,
          },
        }),
    },
    {
      label: 'wrong stored request hash',
      row: () =>
        makeStoredRow({
          id: 203,
          metadata: {
            idempotencyKey: 'wrong-request-hash',
            requestHash: 'a'.repeat(64),
            currentPlanVersionId: PLAN_ID,
            financialFactsSnapshotId: FACTS_ID,
            requestedFactsSnapshotId: FACTS_ID,
            asOfDate: AS_OF_DATE,
            structuredWarnings: [],
          },
        }),
    },
    {
      label: 'stored state hash mismatch',
      row: () => makeStoredRow({ id: 204, stateHash: 'f'.repeat(64) }),
    },
    {
      label: 'recomputed result hash mismatch',
      row: () => {
        const valid = makeStoredRow({ id: 205 });
        const payload = JSON.parse(JSON.stringify(valid.payload)) as Record<string, unknown>;
        const value = payload['value'] as Record<string, unknown>;
        value['actualInitialUsd'] = '1.000000';
        return { ...valid, payload };
      },
    },
    {
      label: 'basis constant drift',
      row: () => {
        const valid = makeStoredRow({ id: 206 });
        const payload = JSON.parse(JSON.stringify(valid.payload)) as Record<string, unknown>;
        const storedBasis = payload['basis'] as Record<string, unknown>;
        storedBasis['engineVersion'] = 'construction-rec-drifted';
        return { ...valid, payload };
      },
    },
  ])('$label fails closed with a 5xx error', async ({ row }) => {
    const { database } = latestDatabase([row()]);

    await expect(getLatestConstructionReconciliation(FUND_ID, { database })).rejects.toMatchObject({
      status: 500,
      code: 'CONSTRUCTION_RECONCILIATION_SNAPSHOT_INVALID',
    });
  });
});
