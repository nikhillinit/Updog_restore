import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  FundMoicInputIdempotencyConflictError,
  FundMoicInputInProgressError,
  FundMoicInputNotFoundError,
  FundMoicInputVersionConflictError,
  updateFundMoicInputs,
  type FundMoicInputUpdateResponse,
} from '../../../server/services/fund-moic-input-service';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const route = 'PUT /api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId';

function requestHashFor(params: {
  fundId: number;
  companyId: number;
  expectedVersion: number;
  exitProbability: number | null;
  exitMoicBps: number | null;
}): string {
  return canonicalSha256({
    route,
    fundId: params.fundId,
    companyId: params.companyId,
    expectedVersion: params.expectedVersion,
    exitProbability: params.exitProbability,
    exitMoicBps: params.exitMoicBps,
  });
}

function makeDatabase(executeRows: unknown[][]) {
  const queue = [...executeRows];
  const execute = vi.fn(async () => ({ rows: queue.shift() ?? [] }));
  const tx = {
    execute,
  };
  const database = {
    execute,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  return { database, tx };
}

const baseParams = {
  fundId: 7,
  companyId: 12,
  expectedVersion: 3,
  exitProbability: 0.8,
  exitMoicBps: 35000,
  idempotencyKey: 'idem-1',
  actorId: 42,
};

function moicMutation(overrides: Record<string, unknown> = {}) {
  return [
    {
      company_exists: true,
      actual_version: 3,
      claim_id: 1,
      completed_id: 1,
      deleted_id: null,
      response_body: {
        fundId: 7,
        companyId: 12,
        allocationVersion: 4,
        exitProbability: 0.8,
        exitMoicBps: 35000,
      },
      ...overrides,
    },
  ];
}

describe('fund MOIC input service', () => {
  it('claims the idempotency row, updates inputs, increments version, and audits once', async () => {
    const { database, tx } = makeDatabase([moicMutation()]);

    const result = await updateFundMoicInputs({ ...baseParams, database: database as never });

    expect(result).toEqual({
      response: {
        fundId: 7,
        companyId: 12,
        allocationVersion: 4,
        exitProbability: 0.8,
        exitMoicBps: 35000,
      },
      replayed: false,
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('treats the same idempotency key on a different company as an independent update', async () => {
    expect(requestHashFor({ ...baseParams, companyId: 12 })).not.toBe(
      requestHashFor({ ...baseParams, companyId: 13 })
    );

    const { database, tx } = makeDatabase([
      moicMutation({
        response_body: {
          fundId: 7,
          companyId: 13,
          allocationVersion: 4,
          exitProbability: 0.8,
          exitMoicBps: 35000,
        },
      }),
    ]);

    const result = await updateFundMoicInputs({
      ...baseParams,
      companyId: 13,
      database: database as never,
    });

    expect(result).toEqual({
      response: {
        fundId: 7,
        companyId: 13,
        allocationVersion: 4,
        exitProbability: 0.8,
        exitMoicBps: 35000,
      },
      replayed: false,
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('replays a completed idempotency ledger response without updating again', async () => {
    const response: FundMoicInputUpdateResponse = {
      fundId: 7,
      companyId: 12,
      allocationVersion: 4,
      exitProbability: 0.8,
      exitMoicBps: 35000,
    };
    const { database, tx } = makeDatabase([
      moicMutation({ claim_id: null, completed_id: null }),
      [
        {
          request_hash: requestHashFor(baseParams),
          response_body: response,
          status: 'completed',
        },
      ],
    ]);

    const result = await updateFundMoicInputs({ ...baseParams, database: database as never });

    expect(result).toEqual({ response, replayed: true });
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('conflicts when the same key is reused with a different request hash', async () => {
    const { database } = makeDatabase([
      moicMutation({ claim_id: null, completed_id: null }),
      [
        {
          request_hash: requestHashFor({ ...baseParams, exitProbability: 0.7 }),
          response_body: null,
          status: 'completed',
        },
      ],
    ]);

    await expect(
      updateFundMoicInputs({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(FundMoicInputIdempotencyConflictError);
  });

  it('returns an in-progress error for a matching pending idempotency row', async () => {
    const { database } = makeDatabase([
      moicMutation({ claim_id: null, completed_id: null }),
      [
        {
          request_hash: requestHashFor(baseParams),
          response_body: null,
          status: 'pending',
        },
      ],
    ]);

    await expect(
      updateFundMoicInputs({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(FundMoicInputInProgressError);
  });

  it('returns not found for the wrong fund/company pair', async () => {
    const { database } = makeDatabase([
      moicMutation({
        company_exists: false,
        actual_version: null,
        claim_id: null,
        completed_id: null,
      }),
      [],
    ]);

    await expect(
      updateFundMoicInputs({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(FundMoicInputNotFoundError);
  });

  it('returns stale version when allocationVersion does not match expectedVersion', async () => {
    const { database } = makeDatabase([
      moicMutation({ actual_version: 5, claim_id: null, completed_id: null }),
      [],
    ]);
    const promise = updateFundMoicInputs({ ...baseParams, database: database as never });

    await expect(promise).rejects.toMatchObject({
      code: 'stale_expected_version',
      expectedVersion: 3,
      actualVersion: 5,
    });
    await expect(promise).rejects.toBeInstanceOf(FundMoicInputVersionConflictError);
  });

  it('uses claim-first idempotency and row-level locking in the SQL path', async () => {
    const source = await readFile(
      path.join(repoRoot, 'server/services/fund-moic-input-service.ts'),
      'utf8'
    );

    expect(source).toContain('ON CONFLICT (fund_id, company_id, idempotency_key) DO NOTHING');
    expect(source).toContain('RETURNING id');
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain('MOIC_INPUTS_UPDATED');
  });
});
