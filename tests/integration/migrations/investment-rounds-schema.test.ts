import { execFileSync } from 'node:child_process';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupTestDB } from '../../helpers/testcontainers';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let container: Awaited<ReturnType<typeof setupTestDB>> | undefined;
let pool: Pool | undefined;

function runDrizzlePush(connectionString: string): void {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npxCommand, ['drizzle-kit', 'push', '--force'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
    },
    stdio: 'pipe',
  });
}

function getPgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.code === 'string') return record.code;

  const cause = record.cause;
  if (typeof cause === 'object' && cause !== null) {
    const causeRecord = cause as Record<string, unknown>;
    if (typeof causeRecord.code === 'string') return causeRecord.code;
  }

  return undefined;
}

async function expectPgRejection(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    expect(getPgErrorCode(error)).toBe(code);
    return;
  }

  throw new Error(`Expected PostgreSQL error ${code}`);
}

async function insertFundAndInvestment(): Promise<{ fundId: number; investmentId: number }> {
  expect(pool).toBeDefined();
  const db = drizzle(pool!);

  const fund = await db.execute(sql`
    INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
    VALUES ('Round Schema Fund', '100000000.00', '0.0200', '0.2000', 2026)
    RETURNING id
  `);
  const fundId = Number(fund.rows[0]?.id);

  const investment = await db.execute(sql`
    INSERT INTO investments (fund_id, investment_date, amount, round)
    VALUES (${fundId}, '2026-01-15T00:00:00.000Z', '1000000.00', 'Seed')
    RETURNING id
  `);
  const investmentId = Number(investment.rows[0]?.id);

  return { fundId, investmentId };
}

async function insertRound(input: {
  fundId: number;
  investmentId: number;
  idempotencyKey: string;
  roundName: string;
  supersedesRoundId?: number;
}): Promise<number> {
  expect(pool).toBeDefined();
  const db = drizzle(pool!);

  const result = await db.execute(sql`
    INSERT INTO investment_rounds (
      investment_id,
      fund_id,
      round_name,
      security_type,
      round_date,
      investment_amount,
      idempotency_key,
      request_hash,
      supersedes_round_id
    )
    VALUES (
      ${input.investmentId},
      ${input.fundId},
      ${input.roundName},
      'equity',
      '2026-02-01',
      '250000.000000',
      ${input.idempotencyKey},
      repeat('a', 64),
      ${input.supersedesRoundId ?? null}
    )
    RETURNING id
  `);

  return Number(result.rows[0]?.id);
}

describe.skipIf(skipIfNoDocker)('investment_rounds schema', () => {
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

  it('creates the investment_rounds table', async () => {
    expect(pool).toBeDefined();
    const db = drizzle(pool!);

    const rows = await db.execute(sql`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'investment_rounds'
    `);

    expect(rows.rows).toHaveLength(1);
  });

  it('blocks deleting an investment that has a round', async () => {
    expect(pool).toBeDefined();
    const db = drizzle(pool!);
    const { fundId, investmentId } = await insertFundAndInvestment();

    await insertRound({
      fundId,
      investmentId,
      idempotencyKey: 'delete-restrict',
      roundName: 'Delete Restrict Seed',
    });

    await expectPgRejection(
      () => db.execute(sql`DELETE FROM investments WHERE id = ${investmentId}`),
      '23503'
    );
  });

  it('rejects a second correction for the same superseded round', async () => {
    const { fundId, investmentId } = await insertFundAndInvestment();
    const originalRoundId = await insertRound({
      fundId,
      investmentId,
      idempotencyKey: 'original-round',
      roundName: 'Original Seed',
    });

    await insertRound({
      fundId,
      investmentId,
      idempotencyKey: 'first-correction',
      roundName: 'First Correction',
      supersedesRoundId: originalRoundId,
    });

    await expectPgRejection(
      () =>
        insertRound({
          fundId,
          investmentId,
          idempotencyKey: 'second-correction',
          roundName: 'Second Correction',
          supersedesRoundId: originalRoundId,
        }),
      '23505'
    );
  });
});
