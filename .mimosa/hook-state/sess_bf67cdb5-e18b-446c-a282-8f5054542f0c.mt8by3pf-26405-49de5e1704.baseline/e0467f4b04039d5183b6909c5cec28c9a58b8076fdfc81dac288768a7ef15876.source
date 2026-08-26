import { describe, expect, it } from 'vitest';
import { shouldUseNodePostgresDriver } from '../../../server/db-driver-selection';

describe('database driver selection', () => {
  it('uses node-postgres for loopback Postgres URLs', () => {
    expect(shouldUseNodePostgresDriver('postgresql://postgres:postgres@localhost:5432/test')).toBe(
      true
    );
    expect(shouldUseNodePostgresDriver('postgresql://postgres:postgres@127.0.0.1/test')).toBe(true);
  });

  it('keeps remote database URLs on the Neon-compatible driver path', () => {
    expect(
      shouldUseNodePostgresDriver(
        'postgresql://user:pass@ep-red-glitter-adtrt2m1-pooler.c-2.us-east-1.aws.neon.tech/neondb'
      )
    ).toBe(false);
  });
});
