import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createValuationHttpFixture,
  VALUATION_HTTP_FACTORIES,
} from '../helpers/valuation-mark-http-fixture';
import {
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../server/services/lp-reporting/import-reconciliation-service';

let harness: Awaited<ReturnType<typeof createValuationHttpFixture>>;
// Loaded after the fixture boots: a static import would load server/db in
// test-mock mode before the fixture selects the real database.
let caseEtag: (version: number) => string;
type Seed = Awaited<ReturnType<typeof harness.seed>>;

function csvRow(seed: Seed, value = '2000000.000000') {
  return `${seed.companyId},2025-06-30,2025-06-30,${value},USD,financing_round,high,priced_round,1000000.000000,${seed.vehicleId}`;
}

function body(fundId: number, rows: string[], spoof?: Seed) {
  const header =
    'company_id,mark_date,as_of_date,fair_value,currency,mark_source,confidence_level,valuation_method,cost_basis,vehicle_id';
  const csv = spoof
    ? [
        `${header},created_by,user_id,fund_id`,
        ...rows.map((row) => `${row},${spoof.userId},${spoof.userId},${spoof.fundId}`),
      ].join('\n')
    : [header, ...rows].join('\n');
  const buffer = Buffer.from(csv);
  const preview = runValuationMarkDryRun(buffer, 'csv', fundId);
  expect(preview.errors).toEqual([]);
  return {
    sourceType: 'csv',
    payload: buffer.toString('base64'),
    previewHash: preview.previewHash,
  };
}

function ledgerBody(fundId: number) {
  const csv = Buffer.from(
    'event_type,amount,currency,event_date,perspective,description\n' +
      'fund_expense,12500.000000,USD,2025-03-31T00:00:00.000Z,fund_gross,Q1 audit fee\n'
  );
  const preview = runLedgerDryRun(csv, 'csv', fundId);
  expect(preview.errors).toEqual([]);
  return { sourceType: 'csv', payload: csv.toString('base64'), previewHash: preview.previewHash };
}

describe('valuation mark commit signed source HTTP and real PostgreSQL', () => {
  beforeAll(async () => {
    harness = await createValuationHttpFixture();
    ({ caseEtag } =
      await import('../../server/services/financial-observations/reconciliation-case-service'));
  }, 180_000);
  afterAll(async () => {
    await harness?.cleanup();
  }, 30_000);

  describe.each(VALUATION_HTTP_FACTORIES)('%s', (factory) => {
    it.each(['admin', 'partner', 'analyst', 'operator', 'viewer'])(
      'allows signed %s and persists the verified actor, ignoring CSV actor/fund fields',
      async (role) => {
        const target = await harness.seed();
        const sentinel = await harness.seed();
        const before = await harness.projection(sentinel.fundId);
        const response = await harness.send(
          factory,
          target.fundId,
          body(target.fundId, [csvRow(target)], sentinel),
          harness.token(target.userId, [target.fundId], role)
        );
        expect(response.status, JSON.stringify(response.body)).toBe(201);
        expect(response.body.insertedCount).toBe(1);
        const rows = (
          await harness.observer.query(
            'SELECT fund_id, company_id, vehicle_id, created_by FROM valuation_marks WHERE id = ANY($1::int[])',
            [response.body.insertedIds]
          )
        ).rows;
        expect(rows).toEqual([
          {
            fund_id: target.fundId,
            company_id: target.companyId,
            vehicle_id: target.vehicleId,
            created_by: target.userId,
          },
        ]);
        expect(await harness.projection(sentinel.fundId)).toEqual(before);
      }
    );

    it.each(['lp', 'service'])(
      'denies signed same-fund %s before telemetry, service, invalidation, or durable writes',
      async (role) => {
        const target = await harness.seed();
        const sentinel = await harness.seed();
        const before = await harness.projection(target.fundId);
        const otherBefore = await harness.projection(sentinel.fundId);
        const telemetry = vi.spyOn(
          await import('../../server/services/lp-reporting/v1-import-telemetry'),
          'recordV1ImportInvocation'
        );
        const commit = vi.spyOn(
          await import('../../server/services/lp-reporting/import-commit-service'),
          'commitValuationMarkImport'
        );
        const invalidate = vi.spyOn(
          await import('../../server/services/h9-artifact-invalidation-service'),
          'invalidateH9Artifacts'
        );
        const response = await harness.send(
          factory,
          target.fundId,
          body(target.fundId, [csvRow(target)]),
          harness.token(target.userId, [target.fundId], role)
        );
        expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
        expect.soft(response.body).toEqual({
          error: 'Forbidden',
          code: 'WRITE_ROLE_REQUIRED',
          message: 'A write role is required for this operation',
        });
        expect.soft(telemetry).not.toHaveBeenCalled();
        expect.soft(commit).not.toHaveBeenCalled();
        expect.soft(invalidate).not.toHaveBeenCalled();
        expect.soft(await harness.projection(target.fundId)).toEqual(before);
        expect.soft(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
      }
    );

    it.each(['admin', 'partner', 'analyst', 'operator', 'viewer'])(
      'denies an LP-linked signed %s before any import side effects',
      async (role) => {
        const target = await harness.seed();
        const sentinel = await harness.seed();
        const before = await harness.projection(target.fundId);
        const otherBefore = await harness.projection(sentinel.fundId);
        const telemetry = vi.spyOn(
          await import('../../server/services/lp-reporting/v1-import-telemetry'),
          'recordV1ImportInvocation'
        );
        const commit = vi.spyOn(
          await import('../../server/services/lp-reporting/import-commit-service'),
          'commitValuationMarkImport'
        );
        const invalidate = vi.spyOn(
          await import('../../server/services/h9-artifact-invalidation-service'),
          'invalidateH9Artifacts'
        );
        const response = await harness.send(
          factory,
          target.fundId,
          body(target.fundId, [csvRow(target)]),
          harness.token(target.userId, [target.fundId], role, 99)
        );
        expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
        expect.soft(response.body).toEqual({
          error: 'Forbidden',
          code: 'TEAM_WRITE_REQUIRED',
          message: 'A team write role is required for this operation',
        });
        expect.soft(telemetry).not.toHaveBeenCalled();
        expect.soft(commit).not.toHaveBeenCalled();
        expect.soft(invalidate).not.toHaveBeenCalled();
        expect.soft(await harness.projection(target.fundId)).toEqual(before);
        expect.soft(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
      }
    );

    it.each(['partner', 'analyst', 'ungranted'])(
      'denies explicit foreign fund for %s with the named code and no side effects',
      async (role) => {
        const target = await harness.seed();
        const sentinel = await harness.seed();
        const before = await harness.projection(target.fundId);
        const otherBefore = await harness.projection(sentinel.fundId);
        const telemetry = vi.spyOn(
          await import('../../server/services/lp-reporting/v1-import-telemetry'),
          'recordV1ImportInvocation'
        );
        const commit = vi.spyOn(
          await import('../../server/services/lp-reporting/import-commit-service'),
          'commitValuationMarkImport'
        );
        const invalidate = vi.spyOn(
          await import('../../server/services/h9-artifact-invalidation-service'),
          'invalidateH9Artifacts'
        );
        const credential = harness.token(
          target.userId,
          role === 'ungranted' ? [] : [sentinel.fundId],
          role === 'ungranted' ? 'partner' : role
        );
        const response = await harness.send(
          factory,
          target.fundId,
          body(target.fundId, [csvRow(target)]),
          credential
        );
        expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
        expect.soft(response.body).toEqual({
          error: 'Forbidden',
          code: 'FUND_ACCESS_DENIED',
          message: `You do not have access to fund ${target.fundId}`,
        });
        expect.soft(telemetry).not.toHaveBeenCalled();
        expect.soft(commit).not.toHaveBeenCalled();
        expect.soft(invalidate).not.toHaveBeenCalled();
        expect.soft(await harness.projection(target.fundId)).toEqual(before);
        expect.soft(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
      }
    );

    it.each(['anonymous', 'invalid-signature'])(
      'rejects %s credentials with no mutation',
      async (kind) => {
        const target = await harness.seed();
        const sentinel = await harness.seed();
        const before = await harness.projection(target.fundId);
        const otherBefore = await harness.projection(sentinel.fundId);
        const credential =
          kind === 'anonymous'
            ? null
            : `${harness
                .token(target.userId, [target.fundId])
                .split('.')
                .slice(0, 2)
                .join('.')}.invalid`;
        const response = await harness.send(
          factory,
          target.fundId,
          body(target.fundId, [csvRow(target)]),
          credential
        );
        expect(response.status).toBe(401);
        expect(response.body).not.toHaveProperty('insertedIds');
        expect(await harness.projection(target.fundId)).toEqual(before);
        expect(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
      }
    );

    it.each(['company-first', 'company-last', 'vehicle-first', 'vehicle-last'])(
      'rejects a mixed batch (%s) atomically using canonical SQL ownership',
      async (placement) => {
        const target = await harness.seed();
        const sentinel = await harness.seed();
        const before = await harness.projection(target.fundId);
        const otherBefore = await harness.projection(sentinel.fundId);
        const company = placement.startsWith('company');
        const foreign = {
          ...target,
          ...(company ? { companyId: sentinel.companyId } : { vehicleId: sentinel.vehicleId }),
        };
        const rows = [csvRow(target), csvRow(foreign, '3000000.000000')];
        if (placement.endsWith('first')) rows.reverse();
        const response = await harness.send(
          factory,
          target.fundId,
          body(target.fundId, rows),
          harness.token(target.userId, [target.fundId])
        );
        expect(response.status, JSON.stringify(response.body)).toBe(403);
        expect(response.body.error).toBe(
          company ? 'CROSS_FUND_COMPANY_REFERENCE' : 'CROSS_FUND_VEHICLE_REFERENCE'
        );
        expect(response.body).not.toHaveProperty('insertedIds');
        expect(await harness.projection(target.fundId)).toEqual(before);
        expect(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
      }
    );

    it('rejects body actor spoofing without inserting any marks', async () => {
      const target = await harness.seed();
      const sentinel = await harness.seed();
      const before = await harness.projection(target.fundId);
      const otherBefore = await harness.projection(sentinel.fundId);
      const response = await harness.send(
        factory,
        target.fundId,
        {
          ...body(target.fundId, [csvRow(target)]),
          userId: sentinel.userId,
          createdBy: sentinel.userId,
        },
        harness.token(target.userId, [target.fundId])
      );
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_BODY');
      expect(await harness.projection(target.fundId)).toEqual(before);
      expect(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
    });

    it.each(['1junk', '01', '1e1', '9007199254740992'])(
      'rejects malformed fund path %s without mutation',
      async (fundId) => {
        const target = await harness.seed();
        const before = await harness.projection(target.fundId);
        const response = await harness.send(
          factory,
          fundId,
          body(target.fundId, [csvRow(target)]),
          harness.token(target.userId, [target.fundId], 'admin')
        );
        expect(response.status).toBe(400);
        expect(await harness.projection(target.fundId)).toEqual(before);
      }
    );

    it('denies LP and ungranted team ledger commits without writing rows', async () => {
      const target = await harness.seed();
      for (const actor of [
        { role: 'lp', fundIds: [target.fundId] },
        { role: 'partner', fundIds: [] },
      ]) {
        const before = Number(
          (
            await harness.observer.query(
              'SELECT count(*)::int AS count FROM cash_flow_events WHERE fund_id = $1',
              [target.fundId]
            )
          ).rows[0].count
        );
        const response = await harness.sendPath(
          factory,
          `/api/funds/${target.fundId}/imports/ledger/commit`,
          ledgerBody(target.fundId),
          harness.token(target.userId, actor.fundIds, actor.role)
        );
        expect(response.status, JSON.stringify(response.body)).toBe(403);
        const after = Number(
          (
            await harness.observer.query(
              'SELECT count(*)::int AS count FROM cash_flow_events WHERE fund_id = $1',
              [target.fundId]
            )
          ).rows[0].count
        );
        expect(after).toBe(before);
      }
    });

    it('allows a granted analyst ledger commit and writes one row', async () => {
      const target = await harness.seed();
      const response = await harness.sendPath(
        factory,
        `/api/funds/${target.fundId}/imports/ledger/commit`,
        ledgerBody(target.fundId),
        harness.token(target.userId, [target.fundId], 'analyst')
      );
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.insertedCount).toBe(1);
      const rows = await harness.observer.query(
        'SELECT fund_id, created_by FROM cash_flow_events WHERE id = ANY($1::int[])',
        [response.body.insertedIds]
      );
      expect(rows.rows).toEqual([{ fund_id: target.fundId, created_by: target.userId }]);
    });

    it('hides another fund import batch during commit and preserves it', async () => {
      const fundA = await harness.seed();
      const fundB = await harness.seed();
      const batchId = Number(
        (
          await harness.observer.query(
            `INSERT INTO import_batches (fund_id, purge_after, idempotency_key, request_hash)
           VALUES ($1, now() + interval '1 day', $2, $3) RETURNING id`,
            [fundB.fundId, `foreign-batch-${fundB.fundId}`, 'a'.repeat(64)]
          )
        ).rows[0].id
      );
      const before = (
        await harness.observer.query(
          'SELECT to_jsonb(batch) AS value FROM import_batches AS batch WHERE id = $1',
          [batchId]
        )
      ).rows[0].value;
      const response = await harness.sendPath(
        factory,
        `/api/funds/${fundA.fundId}/imports/batches/${batchId}/commit`,
        { previewHash: 'b'.repeat(64), requestedGroupKeys: ['source-observation:1'] },
        harness.token(fundA.userId, [fundA.fundId]),
        'W/"unrelated"'
      );
      expect(response.status, JSON.stringify(response.body)).toBe(404);
      expect(
        (
          await harness.observer.query(
            'SELECT to_jsonb(batch) AS value FROM import_batches AS batch WHERE id = $1',
            [batchId]
          )
        ).rows[0].value
      ).toEqual(before);
    });

    it('hides another fund case during single resolve and preserves it', async () => {
      const fundA = await harness.seed();
      const fundB = await harness.seed();
      const caseId = Number(
        (
          await harness.observer.query(
            `INSERT INTO reconciliation_cases (fund_id, case_type) VALUES ($1, 'observation_match') RETURNING id`,
            [fundB.fundId]
          )
        ).rows[0].id
      );
      const before = (
        await harness.observer.query(
          'SELECT to_jsonb(case_row) AS value FROM reconciliation_cases AS case_row WHERE id = $1',
          [caseId]
        )
      ).rows[0].value;
      const response = await harness.sendPath(
        factory,
        `/api/funds/${fundA.fundId}/reconciliation/cases/${caseId}/resolve`,
        { action: 'reject', targetCompanyIdentityId: null, memo: 'reject suggested match' },
        harness.token(fundA.userId, [fundA.fundId]),
        'W/"unrelated"'
      );
      expect(response.status, JSON.stringify(response.body)).toBe(404);
      expect(
        (
          await harness.observer.query(
            'SELECT to_jsonb(case_row) AS value FROM reconciliation_cases AS case_row WHERE id = $1',
            [caseId]
          )
        ).rows[0].value
      ).toEqual(before);
    });

    it('returns per-item cross-fund bulk resolve results and preserves foreign case', async () => {
      const fundA = await harness.seed();
      const fundB = await harness.seed();
      const sameCaseId = Number(
        (
          await harness.observer.query(
            `INSERT INTO reconciliation_cases (fund_id, case_type) VALUES ($1, 'observation_match') RETURNING id`,
            [fundA.fundId]
          )
        ).rows[0].id
      );
      const foreignCaseId = Number(
        (
          await harness.observer.query(
            `INSERT INTO reconciliation_cases (fund_id, case_type) VALUES ($1, 'observation_match') RETURNING id`,
            [fundB.fundId]
          )
        ).rows[0].id
      );
      const foreignBefore = (
        await harness.observer.query(
          'SELECT to_jsonb(case_row) AS value FROM reconciliation_cases AS case_row WHERE id = $1',
          [foreignCaseId]
        )
      ).rows[0].value;
      const decision = {
        action: 'reject',
        targetCompanyIdentityId: null,
        memo: 'reject suggested match',
      };
      const response = await harness.sendPath(
        factory,
        `/api/funds/${fundA.fundId}/reconciliation/cases/bulk-resolve`,
        {
          items: [
            { caseId: sameCaseId, ifMatch: caseEtag(1), decision },
            { caseId: foreignCaseId, ifMatch: caseEtag(1), decision },
          ],
        },
        harness.token(fundA.userId, [fundA.fundId])
      );
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.results).toMatchObject([
        { caseId: sameCaseId, ok: true, httpStatus: 200 },
        { caseId: foreignCaseId, ok: false, httpStatus: 404 },
      ]);
      expect(
        (
          await harness.observer.query(
            'SELECT to_jsonb(case_row) AS value FROM reconciliation_cases AS case_row WHERE id = $1',
            [foreignCaseId]
          )
        ).rows[0].value
      ).toEqual(foreignBefore);
    });

    it('deduplicates concurrent commits and sequential replay without changing the stored actor', async () => {
      const target = await harness.seed();
      const sentinel = await harness.seed();
      const otherBefore = await harness.projection(sentinel.fundId);
      const payload = body(target.fundId, [csvRow(target), csvRow(target)]);
      const credential = harness.token(target.userId, [target.fundId]);
      const results = await Promise.all(
        [1, 2].map(() => harness.send(factory, target.fundId, payload, credential))
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(results.map((r) => r.body.insertedCount).sort()).toEqual([0, 1]);
      expect(results.every((r) => r.body.skippedDuplicateCount === 1)).toBe(true);
      const beforeReplay = await harness.projection(target.fundId);
      const replay = await harness.send(
        factory,
        target.fundId,
        payload,
        harness.token(sentinel.userId, [target.fundId])
      );
      expect(replay.status).toBe(200);
      expect(replay.body.insertedCount).toBe(0);
      expect(replay.body.skippedExistingCount).toBe(1);
      expect(await harness.projection(target.fundId)).toEqual(beforeReplay);
      expect(await harness.projection(sentinel.fundId)).toEqual(otherBefore);
      expect(
        (
          await harness.observer.query(
            'SELECT created_by FROM valuation_marks WHERE fund_id = $1 AND source_hash IS NOT NULL',
            [target.fundId]
          )
        ).rows
      ).toEqual([{ created_by: target.userId }]);
    });
  });
});
