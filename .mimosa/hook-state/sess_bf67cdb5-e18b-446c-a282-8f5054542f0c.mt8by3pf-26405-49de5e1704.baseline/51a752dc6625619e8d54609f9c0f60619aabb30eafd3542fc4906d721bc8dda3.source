import { describe, it, expect, vi, beforeEach } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';

// Mutable state consumed by the hoisted chain implementations below. Behavior
// lives INSIDE the vi.fn factories (reading this state) rather than in
// mockResolvedValue calls, so the global `restoreMocks: true` between tests
// cannot strip it.
const dbState = vi.hoisted(() => ({
  rows: [] as unknown[],
  failure: null as unknown,
}));

// Spies for the Drizzle select chain, hoisted so the vi.mock factory (itself
// hoisted above imports) can close over them. Mocking `../../../server/db`
// intercepts the reader's `import { db } from '../db'` at the same resolved
// module, so the default-reader proofs are fully DB-free.
const chain = vi.hoisted(() => {
  const limit = vi.fn((_count: number) => {
    if (dbState.failure) return Promise.reject(dbState.failure);
    return Promise.resolve(dbState.rows);
  });
  const orderBy = vi.fn((_order: unknown) => ({ limit }));
  const where = vi.fn((_condition: unknown) => ({ orderBy }));
  const from = vi.fn((_table: unknown) => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, orderBy, limit };
});

vi.mock('../../../server/db', () => ({ db: { select: chain.select } }));

import {
  DEFAULT_SHADOW_RECONCILIATION_READ_LIMIT,
  MAX_SHADOW_RECONCILIATION_READ_LIMIT,
  readConstrainedReserveShadowReconciliations,
} from '../../../server/services/substrate-shadow-reconciliation-reader';
import {
  substrateShadowReconciliations,
  type SubstrateShadowReconciliation,
} from '../../../shared/schema';
import { CONSTRAINED_RESERVE_CALCULATION_KEY } from '../../../shared/core/reserves/constrained-reserve-substrate-adapter';

function ledgerRow(
  overrides: Partial<SubstrateShadowReconciliation> = {}
): SubstrateShadowReconciliation {
  return {
    id: 1,
    fundId: 7,
    calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
    configuredMode: 'shadow',
    effectiveMode: 'shadow',
    killSwitchActive: false,
    substrateState: 'indicative',
    reconciliationStatus: 'match',
    inputHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    assumptionsHash: 'c'.repeat(64),
    mismatches: [],
    observedAt: new Date('2026-07-18T01:00:00.000Z'),
    ...overrides,
  };
}

describe('readConstrainedReserveShadowReconciliations (ADR-051)', () => {
  beforeEach(() => {
    dbState.rows = [];
    dbState.failure = null;
  });

  describe('injectable reader seam (DB-free)', () => {
    it('projects rows to the stable read DTO in reader order, observedAt as ISO', async () => {
      const newer = ledgerRow({
        id: 2,
        reconciliationStatus: 'mismatch',
        mismatches: ['totalAllocated cents differ: substrate 100 vs legacy 101'],
        observedAt: new Date('2026-07-18T02:00:00.000Z'),
      });
      const older = ledgerRow({ id: 1 });
      const reader = vi.fn(async () => [newer, older]);

      const observations = await readConstrainedReserveShadowReconciliations({
        fundId: 7,
        reader,
      });

      expect(reader).toHaveBeenCalledOnce();
      expect(reader).toHaveBeenCalledWith({
        fundId: 7,
        limit: DEFAULT_SHADOW_RECONCILIATION_READ_LIMIT,
      });
      expect(observations).toEqual([
        {
          id: 2,
          fundId: 7,
          calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
          configuredMode: 'shadow',
          effectiveMode: 'shadow',
          killSwitchActive: false,
          substrateState: 'indicative',
          reconciliationStatus: 'mismatch',
          inputHash: 'a'.repeat(64),
          resultHash: 'b'.repeat(64),
          assumptionsHash: 'c'.repeat(64),
          mismatches: ['totalAllocated cents differ: substrate 100 vs legacy 101'],
          observedAt: '2026-07-18T02:00:00.000Z',
        },
        {
          id: 1,
          fundId: 7,
          calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
          configuredMode: 'shadow',
          effectiveMode: 'shadow',
          killSwitchActive: false,
          substrateState: 'indicative',
          reconciliationStatus: 'match',
          inputHash: 'a'.repeat(64),
          resultHash: 'b'.repeat(64),
          assumptionsHash: 'c'.repeat(64),
          mismatches: [],
          observedAt: '2026-07-18T01:00:00.000Z',
        },
      ]);
    });

    it('passes a conforming limit through to the reader', async () => {
      const reader = vi.fn(async () => [] as SubstrateShadowReconciliation[]);

      await readConstrainedReserveShadowReconciliations({ fundId: 7, limit: 5, reader });

      expect(reader).toHaveBeenCalledWith({ fundId: 7, limit: 5 });
    });

    it('hard-caps the limit at 200', async () => {
      const reader = vi.fn(async () => [] as SubstrateShadowReconciliation[]);

      await readConstrainedReserveShadowReconciliations({ fundId: 7, limit: 5000, reader });

      expect(reader).toHaveBeenCalledWith({
        fundId: 7,
        limit: MAX_SHADOW_RECONCILIATION_READ_LIMIT,
      });
    });

    it('clamps a sub-1 limit up to 1', async () => {
      const reader = vi.fn(async () => [] as SubstrateShadowReconciliation[]);

      await readConstrainedReserveShadowReconciliations({ fundId: 7, limit: 0, reader });

      expect(reader).toHaveBeenCalledWith({ fundId: 7, limit: 1 });
    });

    it('propagates an injected reader failure (the service adds no swallow)', async () => {
      const reader = vi.fn(async () => {
        throw new Error('boom');
      });

      await expect(
        readConstrainedReserveShadowReconciliations({ fundId: 7, reader })
      ).rejects.toThrow('boom');
    });
  });

  describe('default reader (mocked db)', () => {
    it('issues one fund- and key-scoped SELECT, newest first, with the bounded limit', async () => {
      dbState.rows = [ledgerRow()];

      const observations = await readConstrainedReserveShadowReconciliations({ fundId: 7 });

      expect(chain.select).toHaveBeenCalledOnce();
      expect(chain.from).toHaveBeenCalledWith(substrateShadowReconciliations);
      expect(chain.where).toHaveBeenCalledWith(
        and(
          eq(substrateShadowReconciliations.fundId, 7),
          eq(substrateShadowReconciliations.calculationKey, CONSTRAINED_RESERVE_CALCULATION_KEY)
        )
      );
      expect(chain.orderBy).toHaveBeenCalledWith(desc(substrateShadowReconciliations.observedAt));
      expect(chain.limit).toHaveBeenCalledWith(DEFAULT_SHADOW_RECONCILIATION_READ_LIMIT);
      expect(observations).toHaveLength(1);
      expect(observations[0]?.observedAt).toBe('2026-07-18T01:00:00.000Z');
    });

    it('caps the issued query limit at 200', async () => {
      await readConstrainedReserveShadowReconciliations({ fundId: 7, limit: 999 });

      expect(chain.limit).toHaveBeenCalledWith(MAX_SHADOW_RECONCILIATION_READ_LIMIT);
    });

    it('returns [] when the table is absent (bare PG 42P01)', async () => {
      dbState.failure = Object.assign(
        new Error('relation "substrate_shadow_reconciliations" does not exist'),
        { code: '42P01' }
      );

      await expect(readConstrainedReserveShadowReconciliations({ fundId: 7 })).resolves.toEqual([]);
    });

    it('returns [] when 42P01 arrives wrapped in an error cause chain', async () => {
      dbState.failure = Object.assign(new Error('Failed query: select ...'), {
        cause: Object.assign(
          new Error('relation "substrate_shadow_reconciliations" does not exist'),
          {
            code: '42P01',
          }
        ),
      });

      await expect(readConstrainedReserveShadowReconciliations({ fundId: 7 })).resolves.toEqual([]);
    });

    it('propagates non-42P01 database errors', async () => {
      dbState.failure = Object.assign(new Error('permission denied for table'), {
        code: '42501',
      });

      await expect(readConstrainedReserveShadowReconciliations({ fundId: 7 })).rejects.toThrow(
        'permission denied for table'
      );
    });
  });
});
