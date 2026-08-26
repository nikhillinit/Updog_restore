import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runDrizzlePush } from '../helpers/run-drizzle-push';
import { setupTestDB } from '../../helpers/testcontainers';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let container: Awaited<ReturnType<typeof setupTestDB>> | undefined;
let pool: Pool | undefined;

describe.skipIf(skipIfNoDocker)('investments (id, fund_id) unique', () => {
  beforeAll(async () => {
    container = await setupTestDB();

    const connectionString = container.getConnectionUri();
    runDrizzlePush(connectionString);

    pool = new Pool({ connectionString, max: 1 });
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('has a unique constraint on (id, fund_id) so it can be a composite-FK target', async () => {
    expect(pool).toBeDefined();
    const db = drizzle(pool!);

    const rows = await db.execute(sql`
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'investments_id_fund_id_key'
        AND contype = 'u'
    `);

    expect(rows.rows).toHaveLength(1);
  });
});
