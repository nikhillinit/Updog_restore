import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

const { buildRoundsToModelEvidence, getFundMoicRankingSources } = vi.hoisted(() => ({
  buildRoundsToModelEvidence: vi.fn(),
  getFundMoicRankingSources: vi.fn(),
}));

vi.mock('../../../server/services/rounds-to-model-evidence-service', () => ({
  buildRoundsToModelEvidence,
}));

vi.mock('../../../server/services/fund-moic-ranking-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-ranking-service')>();

  return {
    ...actual,
    getFundMoicRankingSources,
  };
});

import {
  MoicReconciliationConflictError,
  recordMoicReconciliation,
} from '../../../server/services/fund-moic-reconciliation-service';
import { reconciliationRuns } from '../../../shared/schema';
import type { FundMoicRankingSources } from '../../../server/services/fund-moic-ranking-service';

const rankingItem = (investmentId: string, value: number) => ({
  rank: 1,
  investmentId,
  investmentName: investmentId,
  reservesMoic: { value, description: 'desc', formula: 'formula' },
});

const sourceBundle = (overrides: Partial<FundMoicRankingSources> = {}): FundMoicRankingSources => {
  return {
    legacy: {
      fundId: 7,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt: '2026-06-24T00:00:00.000Z',
      rankings: [rankingItem('1', 0)],
    },
    candidate: {
      fundId: 7,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt: '2026-06-24T00:00:00.000Z',
      rankings: [rankingItem('1', 2.8)],
    },
    moicInputSummary: {
      sourceVersion: 'moic-round-fmv-facts-v2',
      explicitExitProbabilityCount: 1,
      defaultedExitProbabilityCount: 0,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 1,
      defaultedReserveExitMultipleCount: 0,
      activationBlockingDefaultedReserveExitMultipleCount: 0,
    },
    moicSourceInputHash: 'source-hash-a',
    factsSource: {
      status: 'available' as const,
      response: {
        fundId: 7,
        asOfDate: '2026-07-13',
        facts: [],
        inputHash: 'f'.repeat(64),
        generatedAt: '2026-07-13T00:00:00.000Z',
      },
    },
    ...overrides,
  };
};

function requestHashFor(fundId: number, moicSourceInputHash: string): string {
  return canonicalSha256({
    kind: 'moic_reconciliation',
    fundId,
    calculationKey: 'fund_moic_rankings_exit_probability',
    contractVersion: '2.1.0',
    moicSourceInputHash,
  });
}

function makeDatabase(params: {
  selectResults?: unknown[][];
  insertResult?: unknown[];
  capture?: {
    insertValues?: unknown;
    onConflictArg?: unknown;
  };
}) {
  const selectResults = [...(params.selectResults ?? [[]])];
  const capture = params.capture ?? {};
  const database = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => selectResults.shift() ?? []),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        capture.insertValues = values;
        return {
          onConflictDoNothing: vi.fn((arg: unknown) => {
            capture.onConflictArg = arg;
            return {
              returning: vi.fn(async () => params.insertResult ?? []),
            };
          }),
        };
      }),
    })),
  };

  return database;
}

describe('fund MOIC reconciliation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildRoundsToModelEvidence.mockResolvedValue({
      coverage: {
        activeRoundCount: 0,
        activeOverrideCount: 0,
        warningsByCode: {},
      },
    });
  });

  it('persists real legacy-vs-candidate hashes and materiality counts', async () => {
    getFundMoicRankingSources.mockResolvedValue(sourceBundle());
    const capture: { insertValues?: unknown; onConflictArg?: unknown } = {};
    const inserted = { id: 123, requestedAt: new Date('2026-06-24T00:00:00.000Z') };
    const database = makeDatabase({ selectResults: [[]], insertResult: [inserted], capture });

    const result = await recordMoicReconciliation({
      fundId: 7,
      idempotencyKey: 'idem-1',
      requestedBy: 42,
      database: database as never,
    });

    expect(result).toEqual({
      run: { runId: '123', createdAt: '2026-06-24T00:00:00.000Z' },
      replayed: false,
    });
    expect(capture.insertValues).toMatchObject({
      fundId: 7,
      idempotencyKey: 'idem-1',
      candidateInputHash: 'source-hash-a',
      candidateMaterial: true,
      diffSummary: {
        comparedInvestmentCount: 1,
        rankChangeCount: 0,
        reservesMoicValueChangeCount: 1,
        materialChangeCount: 1,
      },
    });
    expect(capture.insertValues).not.toHaveProperty('legacy');
    expect(capture.insertValues).not.toHaveProperty('candidate');
    expect(capture.onConflictArg).toEqual({
      target: [reconciliationRuns.fundId, reconciliationRuns.idempotencyKey],
    });
    expect(getFundMoicRankingSources).toHaveBeenCalledWith(7, database);
  });

  it('keeps a v1 row byte-identical while a fresh key inserts a separate v2 row', async () => {
    const v1SourceHash = 'v1-source-hash';
    const v2SourceHash = 'v2-source-hash';
    getFundMoicRankingSources.mockResolvedValue(
      sourceBundle({ moicSourceInputHash: v2SourceHash })
    );
    const existingV1 = {
      id: 321,
      requestedAt: new Date('2026-06-24T01:00:00.000Z'),
      requestHash: requestHashFor(7, v1SourceHash),
      candidateInputHash: v1SourceHash,
    };
    const existingBefore = structuredClone(existingV1);
    const reusedKeyDatabase = makeDatabase({ selectResults: [[existingV1]] });

    await expect(
      recordMoicReconciliation({
        fundId: 7,
        idempotencyKey: 'v1-key',
        requestedBy: 42,
        database: reusedKeyDatabase as never,
      })
    ).rejects.toBeInstanceOf(MoicReconciliationConflictError);

    expect(existingV1).toEqual(existingBefore);
    expect(reusedKeyDatabase.insert).not.toHaveBeenCalled();

    const capture: { insertValues?: unknown } = {};
    const freshKeyDatabase = makeDatabase({
      selectResults: [[]],
      insertResult: [{ id: 654, requestedAt: new Date('2026-07-13T00:00:00.000Z') }],
      capture,
    });
    const result = await recordMoicReconciliation({
      fundId: 7,
      idempotencyKey: 'v2-key',
      requestedBy: 42,
      database: freshKeyDatabase as never,
    });

    expect(result).toEqual({
      run: { runId: '654', createdAt: '2026-07-13T00:00:00.000Z' },
      replayed: false,
    });
    expect(capture.insertValues).toMatchObject({
      idempotencyKey: 'v2-key',
      candidateInputHash: v2SourceHash,
    });

    const simulatedPersistedRows = [existingV1, capture.insertValues];
    expect(
      simulatedPersistedRows.find(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          'candidateInputHash' in row &&
          row.candidateInputHash === v1SourceHash
      )
    ).toEqual(existingBefore);
    expect(simulatedPersistedRows).toHaveLength(2);
  });

  it('conflicts when an idempotency key is reused after MOIC source input changes', async () => {
    getFundMoicRankingSources.mockResolvedValue(sourceBundle({ moicSourceInputHash: 'source-b' }));
    const existing = {
      id: 321,
      requestedAt: new Date('2026-06-24T01:00:00.000Z'),
      requestHash: requestHashFor(7, 'source-a'),
    };
    const database = makeDatabase({ selectResults: [[existing]] });

    await expect(
      recordMoicReconciliation({
        fundId: 7,
        idempotencyKey: 'idem-1',
        requestedBy: 42,
        database: database as never,
      })
    ).rejects.toBeInstanceOf(MoicReconciliationConflictError);

    expect(database.insert).not.toHaveBeenCalled();
  });
});
