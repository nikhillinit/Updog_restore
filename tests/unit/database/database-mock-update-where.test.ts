/**
 * Database mock update semantics regression tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { databaseMock } from '../../helpers/database-mock';
import { fundConfigs } from '../../../shared/schema/fund';

describe('databaseMock update(where)', () => {
  beforeEach(() => {
    databaseMock.clearMockData();
  });

  it('updates only rows matching the where clause', async () => {
    databaseMock.setMockData('fundconfigs', [
      {
        id: 1,
        fundId: 100,
        version: 1,
        config: {},
        isDraft: true,
        isPublished: false,
      },
      {
        id: 2,
        fundId: 200,
        version: 1,
        config: { fundName: 'Before' },
        isDraft: true,
        isPublished: false,
      },
    ]);

    const [updated] = await databaseMock
      .update(fundConfigs)
      .set({ config: { fundName: 'After' } })
      .where(eq(fundConfigs.id, 2))
      .returning();

    const rows = databaseMock.getMockData('fundconfigs');
    expect(updated).toMatchObject({ id: 2, config: { fundName: 'After' } });
    expect(rows[0]).toMatchObject({ id: 1, config: {} });
    expect(rows[1]).toMatchObject({ id: 2, config: { fundName: 'After' } });
  });

  it('updates every row matching a bulk where clause', async () => {
    databaseMock.setMockData('fundconfigs', [
      {
        id: 11,
        fundId: 300,
        version: 1,
        config: { status: 'published-a' },
        isDraft: false,
        isPublished: true,
      },
      {
        id: 12,
        fundId: 300,
        version: 2,
        config: { status: 'published-b' },
        isDraft: false,
        isPublished: true,
      },
      {
        id: 13,
        fundId: 300,
        version: 3,
        config: { status: 'draft' },
        isDraft: true,
        isPublished: false,
      },
    ]);

    const updatedRows = await databaseMock
      .update(fundConfigs)
      .set({ isPublished: false })
      .where(and(eq(fundConfigs.fundId, 300), eq(fundConfigs.isPublished, true)))
      .returning();

    expect(updatedRows).toHaveLength(2);

    const rows = databaseMock.getMockData('fundconfigs');
    expect(rows[0]).toMatchObject({ id: 11, isPublished: false });
    expect(rows[1]).toMatchObject({ id: 12, isPublished: false });
    expect(rows[2]).toMatchObject({ id: 13, isPublished: false });
  });
});
