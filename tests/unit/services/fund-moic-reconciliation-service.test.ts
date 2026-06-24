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

const sourceBundle = (overrides: Partial<FundMoicRankingSources> = {}): FundMoicRankingSources => ({
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
    sourceVersion: 'moic-exit-probability-v1',
    explicitExitProbabilityCount: 1,
    defaultedExitProbabilityCount: 0,
    activationBlockingDefaultedExitProbabilityCount: 0,
    explicitReserveExitMultipleCount: 1,
    defaultedReserveExitMultipleCount: 0,
    activationBlockingDefaultedReserveExitMultipleCount: 0,
  },
  moicSourceInputHash: 'source-hash-a',
  ...overrides,
});

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
  });

  it('replays an existing fund-scoped idempotency key with the same request hash', async () => {
    getFundMoicRankingSources.mockResolvedValue(sourceBundle());
    const existing = {
      id: 321,
      requestedAt: new Date('2026-06-24T01:00:00.000Z'),
      requestHash: requestHashFor(7, 'source-hash-a'),
    };
    const database = makeDatabase({ selectResults: [[existing]] });

    const result = await recordMoicReconciliation({
      fundId: 7,
      idempotencyKey: 'idem-1',
      requestedBy: 42,
      database: database as never,
    });

    expect(result).toEqual({
      run: { runId: '321', createdAt: '2026-06-24T01:00:00.000Z' },
      replayed: true,
    });
    expect(database.insert).not.toHaveBeenCalled();
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
