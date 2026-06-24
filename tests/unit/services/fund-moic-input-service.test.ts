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
  const tx = {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
  };
  const database = {
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

describe('fund MOIC input service', () => {
  it('claims the idempotency row, updates inputs, increments version, and audits once', async () => {
    const { database, tx } = makeDatabase([
      [{ id: 1 }],
      [{ allocation_version: 3 }],
      [{ allocation_version: 4, exit_probability: '0.800000', exit_moic_bps: 35000 }],
      [],
      [],
    ]);

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
    expect(tx.execute).toHaveBeenCalledTimes(5);
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
      [],
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
      [],
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
      [],
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
    const { database } = makeDatabase([[{ id: 1 }], []]);

    await expect(
      updateFundMoicInputs({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(FundMoicInputNotFoundError);
  });

  it('returns stale version when allocationVersion does not match expectedVersion', async () => {
    const { database } = makeDatabase([[{ id: 1 }], [{ allocation_version: 5 }]]);
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
