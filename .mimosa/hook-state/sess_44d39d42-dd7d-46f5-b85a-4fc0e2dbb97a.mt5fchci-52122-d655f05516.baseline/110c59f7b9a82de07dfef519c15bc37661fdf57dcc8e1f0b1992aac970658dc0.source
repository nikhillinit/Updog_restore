import { describe, expect, it, vi } from 'vitest';

const databaseMock = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('../../../server/db', () => ({ db: databaseMock }));

import { seedPipelineData } from '../../../scripts/seed-pipeline';
import * as schemaValidation from '../../../scripts/schema-validation';

describe('production database dispatch block', () => {
  it('rejects remote pipeline seeding before database dispatch', async () => {
    await expect(
      seedPipelineData({ databaseUrl: 'postgres://operator:secret@prod.example/updog' })
    ).rejects.toThrow(/local database target/i);
    expect(databaseMock.insert).not.toHaveBeenCalled();
  });

  it('rejects remote schema validation before command dispatch', async () => {
    const dispatch = vi.fn();
    expect(typeof schemaValidation.validateSchema).toBe('function');

    await expect(
      schemaValidation.validateSchema({
        command: 'generate',
        databaseUrl: 'postgres://operator:secret@prod.example/updog',
        dispatch,
      })
    ).rejects.toThrow(/local database target/i);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
