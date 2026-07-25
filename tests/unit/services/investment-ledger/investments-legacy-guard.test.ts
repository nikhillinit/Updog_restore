import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  assertLegacyInvestmentMutable,
  createLegacyInvestmentWithLedgerGuard,
  UseLedgerRouteError,
} from '../../../../server/services/investment-ledger/legacy-compat-guard-service';

describe('legacy compatibility write guards', () => {
  it('rejects legacy investment creation for a participation-linked company before insert', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ participation_id: 51 }]);
    const insert = vi.fn();
    const database = {
      transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ execute, insert })
      ),
    };

    await expect(
      createLegacyInvestmentWithLedgerGuard(
        {
          fundId: 7,
          companyId: 12,
          investmentDate: new Date('2026-07-01T00:00:00.000Z'),
          amount: '100.00',
          round: 'Seed',
        },
        database
      )
    ).rejects.toBeInstanceOf(UseLedgerRouteError);
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates an unlinked legacy investment inside the guarded transaction', async () => {
    const created = {
      id: 71,
      fundId: 7,
      companyId: 12,
      investmentDate: new Date('2026-07-01T00:00:00.000Z'),
      amount: '100.00',
      round: 'Seed',
    };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const execute = vi.fn().mockResolvedValue([]);
    const database = {
      transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ execute, insert })
      ),
    };

    await expect(
      createLegacyInvestmentWithLedgerGuard(
        {
          fundId: 7,
          companyId: 12,
          investmentDate: created.investmentDate,
          amount: '100.00',
          round: 'Seed',
        },
        database
      )
    ).resolves.toMatchObject(created);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('rejects round and lot mutation of participation-linked investments', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ vehicle_participation_id: 51 }]);
    const database = {
      transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ execute, insert: vi.fn() })
      ),
    };

    await expect(assertLegacyInvestmentMutable(7, 71, database)).rejects.toBeInstanceOf(
      UseLedgerRouteError
    );
  });

  it('wires every current legacy compatibility mutation surface through the guard', () => {
    const investmentsRoute = fs.readFileSync(
      path.join(process.cwd(), 'server', 'routes', 'investments.ts'),
      'utf8'
    );
    const lotsRoute = fs.readFileSync(
      path.join(process.cwd(), 'server', 'routes', 'portfolio', 'lots.ts'),
      'utf8'
    );

    expect(investmentsRoute).toContain('createLegacyInvestmentWithLedgerGuard');
    expect(investmentsRoute).toMatch(
      /assertLegacyInvestmentMutable\(scope\.fundId,\s*scope\.investmentId\)/
    );
    expect(lotsRoute).toMatch(/assertLegacyInvestmentMutable\(fundId,\s*investmentId\)/);
  });
});
