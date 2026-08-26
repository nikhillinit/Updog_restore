/**
 * Database mock ID strategy regression tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { databaseMock } from '../../helpers/database-mock';
import { funds } from '../../../shared/schema/fund';
import { investmentLots } from '../../../shared/schema/portfolio';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('databaseMock ID strategy', () => {
  beforeEach(() => {
    databaseMock.clearMockData();
  });

  it('generates schema-matching IDs for query-builder inserts', async () => {
    const [fund] = await databaseMock
      .insert(funds)
      .values({
        name: 'Mock Fund',
        size: '1000000',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
        createdAt: new Date(),
      })
      .returning();

    expect(typeof fund.id).toBe('number');

    const [lot] = await databaseMock
      .insert(investmentLots)
      .values({
        investmentId: 1,
        lotType: 'initial',
        sharePriceCents: BigInt(250_000),
        sharesAcquired: '1000.00000000',
        costBasisCents: BigInt(250_000_000),
        version: BigInt(1),
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    expect(typeof lot.id).toBe('string');
    expect(lot.id).toMatch(UUID_PATTERN);
  });

  it('generates schema-matching IDs for raw SQL inserts', async () => {
    const [fund] = await databaseMock.execute(`
      INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
      VALUES ('Raw SQL Fund', 1000000, 0.02, 0.2, 2026)
      RETURNING *
    `);

    expect(typeof fund.id).toBe('number');

    const [baseline] = await databaseMock.execute(`
      INSERT INTO fund_baselines (
        fund_id,
        name,
        baseline_type,
        period_start,
        period_end,
        snapshot_date,
        total_value,
        deployed_capital
      )
      VALUES (
        1,
        'Baseline Alpha',
        'initial',
        '2026-01-01T00:00:00Z',
        '2026-03-31T00:00:00Z',
        '2026-03-31T00:00:00Z',
        1000000,
        500000
      )
      RETURNING *
    `);

    expect(typeof baseline.id).toBe('string');
    expect(baseline.id).toMatch(UUID_PATTERN);
  });
});
