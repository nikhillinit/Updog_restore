import { describe, expect, it } from 'vitest';

import { resolveTerminalFactsHead } from '../../../../server/services/financial-facts/terminal-head';
import { financialFactsSnapshots } from '../../../../shared/schema/financial-facts-snapshots';
import type { FinancialFactsSnapshot } from '../../../../shared/schema/financial-facts-snapshots';

function snapshot(
  id: number,
  supersedesSnapshotId: number | null,
  asOfDate = '2026-06-30',
  knowledgeCutoff = new Date('2026-07-01T00:00:00.000Z')
): FinancialFactsSnapshot {
  return {
    id,
    fundId: 7,
    policyVersion: 'financial-facts-policy/1.3.0',
    payloadSchemaId: 'financial-facts-payload/4',
    asOfDate,
    knowledgeCutoff,
    vehicleScope: 'fund_all',
    vehicleIds: [11],
    selectionSetHash: 'a'.repeat(64),
    sourceFactsInputHash: 'b'.repeat(64),
    snapshotInputHash: `${String(id).padStart(64, '0')}`,
    payload: {} as FinancialFactsSnapshot['payload'],
    consumerEvaluations: [],
    actorId: null,
    idempotencyKey: `facts-${id}`,
    requestHash: 'c'.repeat(64),
    supersedesSnapshotId,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

class FakeDatabase {
  constructor(private readonly rows: FinancialFactsSnapshot[]) {}

  select() {
    return {
      from: (table: unknown) => {
        expect(table).toBe(financialFactsSnapshots);
        return {
          where: (_condition: unknown) => ({
            orderBy: (_order: unknown) =>
              Promise.resolve([...this.rows].sort((left, right) => left.id - right.id)),
          }),
        };
      },
    };
  }
}

async function resolve(rows: FinancialFactsSnapshot[]) {
  return resolveTerminalFactsHead(new FakeDatabase(rows) as never, 7);
}

describe('resolveTerminalFactsHead', () => {
  it('returns none for a fund with no snapshots', async () => {
    await expect(resolve([])).resolves.toEqual({ kind: 'none' });
  });

  it('returns the only unreferenced row after a terminating lineage walk', async () => {
    const result = await resolve([snapshot(2, 1), snapshot(1, null)]);

    expect(result).toEqual({ kind: 'head', row: expect.objectContaining({ id: 2 }) });
  });

  it('selects the newest valid terminal across distinct historical as-of families', async () => {
    const result = await resolve([
      snapshot(2, 1, '2026-03-31', new Date('2026-04-01T00:00:00.000Z')),
      snapshot(1, null, '2026-03-31', new Date('2026-04-01T00:00:00.000Z')),
      snapshot(4, 3, '2026-06-30', new Date('2026-07-01T00:00:00.000Z')),
      snapshot(3, null, '2026-06-30', new Date('2026-07-01T00:00:00.000Z')),
    ]);

    expect(result).toEqual({ kind: 'head', row: expect.objectContaining({ id: 4 }) });

    await expect(
      resolve([
        snapshot(1, null, '2026-03-31', new Date('2026-12-01T00:00:00.000Z')),
        snapshot(2, 1, '2026-06-30', new Date('2026-07-01T00:00:00.000Z')),
      ])
    ).resolves.toEqual({ kind: 'head', row: expect.objectContaining({ id: 2 }) });

    await expect(
      resolve([
        snapshot(3, null, '2026-03-31', new Date('2026-07-01T00:00:00.000Z')),
        snapshot(9, null, '2026-06-30', new Date('2026-07-01T00:00:00.000Z')),
      ])
    ).resolves.toEqual({ kind: 'head', row: expect.objectContaining({ id: 9 }) });
  });

  it('returns deterministic head ids when same-date independent terminal heads exist', async () => {
    await expect(resolve([snapshot(9, null), snapshot(3, null)])).resolves.toEqual({
      kind: 'ambiguous',
      code: 'FACTS_HEAD_AMBIGUOUS',
      headIds: [3, 9],
    });
  });

  it('rejects a repeated lineage id as a cycle', async () => {
    await expect(
      resolve([snapshot(2, 1), snapshot(1, null), snapshot(4, 3), snapshot(3, 4)])
    ).resolves.toEqual({
      kind: 'invalid',
      code: 'FACTS_LINEAGE_INVALID',
      reason: 'cycle',
    });
  });

  it('rejects a supersession pointer outside the fund as detached', async () => {
    await expect(resolve([snapshot(2, 99)])).resolves.toEqual({
      kind: 'invalid',
      code: 'FACTS_LINEAGE_INVALID',
      reason: 'detached',
    });
  });
});
