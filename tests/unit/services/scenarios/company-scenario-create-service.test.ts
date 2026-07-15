import { describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import {
  CompanyScenarioCreateIdempotencyConflictError,
  CompanyScenarioCreateInProgressError,
  CompanyScenarioCreateScopeError,
  createCompanyScenario,
  type CompanyScenarioCreateResponse,
} from '../../../../server/services/scenarios/company-scenario-create-service';

const route = 'POST /api/companies/:companyId/scenarios';
const updatedAt = new Date('2026-07-15T08:00:00.000Z');

const baseParams = {
  fundId: 7,
  companyId: 12,
  name: 'New Scenario',
  description: null,
  idempotencyKey: 'scenario-create-1',
  actorId: 42,
};

function requestHashFor(params: typeof baseParams): string {
  return canonicalSha256({
    route,
    fundId: params.fundId,
    companyId: params.companyId,
    name: params.name,
    description: params.description,
  });
}

function makeDatabase(executeRows: unknown[][]) {
  const queue = [...executeRows];
  const tx = { execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })) };
  const database = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  return { database, tx };
}

describe('company scenario create service', () => {
  it('claims, creates, audits, and completes the ledger in one transaction', async () => {
    const { database, tx } = makeDatabase([
      [{ id: 12 }],
      [{ id: 1 }],
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'New Scenario',
          version: 1,
          updated_at: updatedAt,
          locked_at: null,
        },
      ],
      [],
      [],
    ]);

    const result = await createCompanyScenario({ ...baseParams, database: database as never });

    expect(result).toEqual({
      scenario: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'New Scenario',
        version: 1,
        updatedAt: updatedAt.toISOString(),
        isLocked: false,
        caseCount: 0,
      },
      replay: false,
    });
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(tx.execute).toHaveBeenCalledTimes(5);
  });

  it('replays the persisted response without a second scenario or audit insert', async () => {
    const stored: CompanyScenarioCreateResponse = {
      scenario: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'New Scenario',
        version: 1,
        updatedAt: updatedAt.toISOString(),
        isLocked: false,
        caseCount: 0,
      },
      replay: false,
    };
    const { database, tx } = makeDatabase([
      [{ id: 12 }],
      [],
      [
        {
          request_hash: requestHashFor(baseParams),
          response_status: 201,
          response_body: stored,
          status: 'completed',
        },
      ],
    ]);

    await expect(
      createCompanyScenario({ ...baseParams, database: database as never })
    ).resolves.toEqual({ ...stored, replay: true });
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });

  it('conflicts when the fund-scoped key is associated with another request', async () => {
    const { database } = makeDatabase([
      [{ id: 12 }],
      [],
      [
        {
          request_hash: requestHashFor({ ...baseParams, companyId: 13 }),
          response_status: 201,
          response_body: null,
          status: 'completed',
        },
      ],
    ]);

    await expect(
      createCompanyScenario({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(CompanyScenarioCreateIdempotencyConflictError);
  });

  it('treats the same key in another fund as an independent claim', async () => {
    const otherFund = { ...baseParams, fundId: 8 };
    expect(requestHashFor(otherFund)).not.toBe(requestHashFor(baseParams));

    const { database } = makeDatabase([
      [{ id: 12 }],
      [{ id: 2 }],
      [
        {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'New Scenario',
          version: 1,
          updated_at: updatedAt,
          locked_at: null,
        },
      ],
      [],
      [],
    ]);

    await expect(
      createCompanyScenario({ ...otherFund, database: database as never })
    ).resolves.toMatchObject({ replay: false });
  });

  it('does not accept a matching ledger row until its atomic writer completes', async () => {
    const { database } = makeDatabase([
      [{ id: 12 }],
      [],
      [
        {
          request_hash: requestHashFor(baseParams),
          response_status: null,
          response_body: null,
          status: 'pending',
        },
      ],
    ]);

    await expect(
      createCompanyScenario({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(CompanyScenarioCreateInProgressError);
  });

  it('fails closed before claiming when company ownership changed after route scope resolution', async () => {
    const { database, tx } = makeDatabase([[]]);

    await expect(
      createCompanyScenario({ ...baseParams, database: database as never })
    ).rejects.toBeInstanceOf(CompanyScenarioCreateScopeError);
    expect(tx.execute).toHaveBeenCalledOnce();
  });
});
