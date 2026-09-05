import { describe, expect, it, vi } from 'vitest';

import {
  actualsPilotPublishTestSeams,
  computeActualsPilotOperationHash,
  publishActualsPilot,
} from '../../../../server/services/lp-reporting/actuals-pilot-publish-service';
import type {
  ActualsPilotPublishError,
  PublishConnection,
  PublishQueryResult,
} from '../../../../server/services/lp-reporting/actuals-pilot-publish-service';
import type { ActualsPublishRequestV1 } from '../../../../shared/contracts/lp-reporting/actuals-pilot.contract';

const hash = (character: string) => character.repeat(64);

function request(fileName = 'ledger.csv'): ActualsPublishRequestV1 {
  return {
    contractVersion: 'actuals-pilot-publish/1.0.0',
    asOfDate: '2026-09-04',
    ledger: {
      templateVersion: 'actuals-ledger/1.0.0',
      fileName,
      payload: Buffer.from('header').toString('base64'),
      expectedPayloadSha256: hash('a'),
      expectedCanonicalRowsHash: hash('b'),
      expectedPreviewHash: hash('c'),
    },
    valuation: null,
    coverage: {
      ledger: 'inception_to_date',
      priorFactsSnapshotId: null,
      evidenceNote: 'Initial load',
    },
  };
}

function command(deadline: number) {
  const publishRequest = request();
  return {
    input: {
      fundId: 7,
      actorId: 9,
      idempotencyKey: 'abcdefab-cdef-4abc-8def-abcdefabcdef',
      ifMatch: '"financial-facts:none"',
      request: publishRequest,
    },
    request: publishRequest,
    operationHash: hash('d'),
    knowledgeCutoff: new Date('2026-09-04T00:00:00.000Z'),
    knowledgeCutoffIso: '2026-09-04T00:00:00.000Z',
    startedAt: 0,
    deadline,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('actuals pilot publisher command boundary', () => {
  it('keeps operation identity independent of filename and changes when content identity changes', () => {
    const first = computeActualsPilotOperationHash({
      fundId: 7,
      ifMatch: '"financial-facts:none"',
      request: request('first.csv'),
    });
    const renamed = computeActualsPilotOperationHash({
      fundId: 7,
      ifMatch: '"financial-facts:none"',
      request: request('renamed.csv'),
    });
    const changed = computeActualsPilotOperationHash({
      fundId: 7,
      ifMatch: '"financial-facts:none"',
      request: {
        ...request('first.csv'),
        ledger: { ...request('first.csv').ledger, expectedPayloadSha256: hash('d') },
      },
    });

    expect(renamed).toBe(first);
    expect(changed).not.toBe(first);
  });

  it.each(['ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF', 'not-a-uuid'])(
    'rejects invalid idempotency key %s before acquiring a connection',
    async (idempotencyKey) => {
      const connect = vi.fn();
      await expect(
        publishActualsPilot(
          {
            fundId: 7,
            actorId: 9,
            idempotencyKey,
            ifMatch: '"financial-facts:none"',
            request: request(),
          },
          { connect }
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_IDEMPOTENCY_KEY',
      } satisfies Partial<ActualsPilotPublishError>);
      expect(connect).not.toHaveBeenCalled();
    }
  );

  it('waits for rollback outcome and destroys the connection when cleanup fails', async () => {
    const rollback = deferred<PublishQueryResult>();
    const release = vi.fn();
    const connection: PublishConnection = {
      query: vi.fn(() => rollback.promise) as unknown as PublishConnection['query'],
      release,
    };
    const cleanup = actualsPilotPublishTestSeams.rollbackAndRelease(
      connection,
      Object.assign(new Error('serialization failure'), { code: '40001' })
    );

    expect(release).not.toHaveBeenCalled();
    rollback.reject(new Error('rollback failed'));
    await cleanup;

    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(true);
  });

  it('destroys late connections and poisons query connections after shared budget exhaustion', async () => {
    const lateConnect = deferred<PublishConnection>();
    const lateRelease = vi.fn();
    const lateConnection: PublishConnection = {
      query: vi.fn(),
      release: lateRelease,
    };
    const exhausted = command(0);

    await expect(
      actualsPilotPublishTestSeams.withinBudget(
        exhausted,
        () => 0,
        lateConnect.promise,
        'PUBLISH_RETRY_EXHAUSTED',
        (connection) => connection.release(true)
      )
    ).rejects.toMatchObject({ statusCode: 503, code: 'PUBLISH_RETRY_EXHAUSTED' });
    lateConnect.resolve(lateConnection);
    await lateConnect.promise;
    await Promise.resolve();
    expect(lateRelease).toHaveBeenCalledWith(true);

    const query = vi.fn() as unknown as PublishConnection['query'];
    const release = vi.fn();
    const wrapped = actualsPilotPublishTestSeams.budgetedConnection(
      { query, release },
      exhausted,
      () => 0,
      'PUBLISH_RETRY_EXHAUSTED'
    );
    await expect(wrapped.query('SELECT 1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'PUBLISH_RETRY_EXHAUSTED',
    });
    wrapped.release();

    expect(query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(true);
  });

  it('checks the locked actor grant before reading any stored receipt', async () => {
    const statements: string[] = [];
    const connection: PublishConnection = {
      query: vi.fn(async (query) => {
        const sql = typeof query === 'string' ? query : query.text;
        statements.push(sql);
        if (sql.includes('FROM users')) {
          return {
            rows: [
              {
                id: 9,
                is_active: true,
                role: 'admin',
                is_release_canary_principal: false,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM user_fund_grants')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }) as PublishConnection['query'],
      release: vi.fn(),
    };

    await expect(
      actualsPilotPublishTestSeams.mutationAttempt(connection, command(10_000), () => 0)
    ).rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });

    const lockIndex = statements.findIndex((sql) => sql.includes('pg_advisory_xact_lock'));
    const actorIndex = statements.findIndex((sql) => sql.includes('FROM users'));
    const grantIndex = statements.findIndex((sql) => sql.includes('FROM user_fund_grants'));

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(actorIndex).toBeGreaterThan(lockIndex);
    expect(grantIndex).toBeGreaterThan(actorIndex);
    expect(statements.some((sql) => sql.includes('FROM financial_facts_snapshots'))).toBe(false);
  });

  it('rejects a successor replay actor mismatch before reading its predecessor', async () => {
    let predecessorQueried = false;
    const connection: PublishConnection = {
      query: vi.fn(async (query) => {
        const sql = typeof query === 'string' ? query : query.text;
        if (sql.includes('FROM users')) {
          return {
            rows: [
              {
                id: 9,
                is_active: true,
                role: 'admin',
                is_release_canary_principal: false,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM user_fund_grants')) {
          return { rows: [{ userId: 9 }], rowCount: 1 };
        }
        if (sql.includes('WHERE fund_id = $1 AND idempotency_key = $2')) {
          return {
            rows: [{ fundId: 7, actorId: 10, supersedesSnapshotId: 41 }],
            rowCount: 1,
          };
        }
        if (sql.includes('WHERE fund_id = $1 AND id = $2')) {
          predecessorQueried = true;
          throw new Error('predecessor query must not run');
        }
        return { rows: [], rowCount: 0 };
      }) as PublishConnection['query'],
      release: vi.fn(),
    };

    await expect(
      actualsPilotPublishTestSeams.mutationAttempt(connection, command(10_000), () => 0)
    ).rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    expect(predecessorQueried).toBe(false);
  });
});
